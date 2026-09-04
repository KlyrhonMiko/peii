"""Unit + API coverage for the shared Redis response cache (core/cache.py)."""

import fnmatch

import pytest

from core import cache
from core.config import settings

pytestmark = pytest.mark.anyio


class FakeRedis:
    """Minimal async Redis surface used by core.cache (get/setex/scan/unlink)."""

    def __init__(self) -> None:
        self.store: dict[str, str] = {}
        self.setex_calls = 0

    async def get(self, key: str) -> bytes | None:
        value = self.store.get(key)
        return value.encode("utf-8") if isinstance(value, str) else None

    async def setex(self, key: str, ttl_seconds: int, value: str) -> None:
        self.setex_calls += 1
        self.store[key] = value

    async def scan(
        self, cursor: int = 0, match: str | None = None, count: int = 200
    ) -> tuple[int, list[str]]:
        return 0, [k for k in self.store if fnmatch.fnmatch(k, match or "*")]

    async def unlink(self, *keys: str) -> None:
        for key in keys:
            self.store.pop(key, None)

    async def aclose(self) -> None:
        return None


class ExplodingRedis(FakeRedis):
    async def get(self, key: str) -> bytes | None:
        raise ConnectionError("redis down")

    async def setex(self, key: str, ttl_seconds: int, value: str) -> None:
        raise ConnectionError("redis down")


def _patch_redis(monkeypatch: pytest.MonkeyPatch, client: FakeRedis) -> None:
    monkeypatch.setattr("core.rate_limit.get_redis_client", lambda: client)
    monkeypatch.setattr(settings, "CACHE_ENABLED", True)


def test_build_cache_key_sanitizes_parts() -> None:
    assert cache.build_cache_key("a:b", "c|d", " e ", None, "") == "a-b:c-d:e:_:_"
    assert cache.build_cache_key() == "_"


async def test_roundtrip_returns_stored_value(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = FakeRedis()
    _patch_redis(monkeypatch, fake)
    monkeypatch.setattr(settings, "CACHE_TTL_RBAC_SECONDS", 300)

    assert await cache.cache_get("rbac", "roles") is None
    await cache.cache_set("rbac", "roles", [{"code": "roles.read"}])
    assert await cache.cache_get("rbac", "roles") == [{"code": "roles.read"}]
    assert fake.setex_calls == 1


async def test_fail_open_on_redis_error(monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_redis(monkeypatch, ExplodingRedis())
    monkeypatch.setattr(settings, "CACHE_TTL_RBAC_SECONDS", 300)

    assert await cache.cache_get("rbac", "roles") is None
    await cache.cache_set("rbac", "roles", [{"code": "roles.read"}])


async def test_disabled_flag_skips_redis(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = FakeRedis()
    monkeypatch.setattr("core.rate_limit.get_redis_client", lambda: fake)
    monkeypatch.setattr(settings, "CACHE_ENABLED", False)
    monkeypatch.setattr(settings, "CACHE_TTL_RBAC_SECONDS", 300)

    await cache.cache_set("rbac", "roles", [{"code": "roles.read"}])
    assert await cache.cache_get("rbac", "roles") is None
    assert fake.setex_calls == 0


async def test_zero_ttl_disables_namespace(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = FakeRedis()
    _patch_redis(monkeypatch, fake)
    monkeypatch.setattr(settings, "CACHE_TTL_USERS_SECONDS", 0)

    await cache.cache_set("users", "list", {"items": []})
    assert await cache.cache_get("users", "list") is None
    assert fake.setex_calls == 0


async def test_invalidate_prefix_removes_only_matching(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake = FakeRedis()
    _patch_redis(monkeypatch, fake)

    await cache.cache_set("peii", "survey-a:2024:x", {"score": 1}, ttl_seconds=60)
    await cache.cache_set("peii", "survey-b:2024:x", {"score": 2}, ttl_seconds=60)
    await cache.cache_invalidate_prefix("peii", "survey-a")

    assert await cache.cache_get("peii", "survey-a:2024:x") is None
    assert await cache.cache_get("peii", "survey-b:2024:x") == {"score": 2}


async def test_permissions_list_serves_hit_then_invalidates_on_write(
    client, monkeypatch: pytest.MonkeyPatch
) -> None:
    fake = FakeRedis()
    _patch_redis(monkeypatch, fake)
    monkeypatch.setattr(settings, "CACHE_TTL_RBAC_SECONDS", 300)

    first = await client.get("/api/v1/rbac/permissions")
    assert first.status_code == 200
    assert first.headers["X-Cache"] == "MISS"

    second = await client.get("/api/v1/rbac/permissions")
    assert second.status_code == 200
    assert second.headers["X-Cache"] == "HIT"
    assert second.json()["data"] == first.json()["data"]

    created = await client.post("/api/v1/rbac/roles", json={"name": "cache-probe"})
    assert created.status_code == 201

    third = await client.get("/api/v1/rbac/permissions")
    assert third.status_code == 200
    assert third.headers["X-Cache"] == "MISS"
