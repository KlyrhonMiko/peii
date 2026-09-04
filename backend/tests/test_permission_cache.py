from typing import Any, cast
from uuid import UUID

import pytest
from sqlmodel.ext.asyncio.session import AsyncSession

from core.config import settings
from services import rbac_service

pytestmark = pytest.mark.anyio

PERMISSIONS_ROWS = ["portal.access", "surveys.read"]
USER_ID = UUID("00000000-0000-0000-0000-000000000010")


class FakeResult:
    def __init__(self, rows: list[Any]) -> None:
        self._rows = rows

    def all(self) -> list[Any]:
        return list(self._rows)


class FakeSession:
    def __init__(self, rows: list[Any]) -> None:
        self._rows = rows
        self.exec_count = 0

    async def exec(self, _statement: Any) -> FakeResult:
        self.exec_count += 1
        return FakeResult(self._rows)


def _reset_caches() -> None:
    rbac_service._PERMISSION_CACHE.clear()
    rbac_service._ROLE_NAME_CACHE.clear()


def _session(rows: list[Any]) -> tuple[FakeSession, AsyncSession]:
    fake = FakeSession(rows)
    return fake, cast(AsyncSession, fake)  # FakeSession satisfies the exec() surface


async def test_cached_permissions_resolve_once(monkeypatch) -> None:
    monkeypatch.setattr(settings, "PERMISSION_CACHE_TTL_SECONDS", 60)
    _reset_caches()
    fake, session = _session(PERMISSIONS_ROWS)

    first = await rbac_service.effective_permissions_cached(session, USER_ID)
    second = await rbac_service.effective_permissions_cached(session, USER_ID)

    assert first == set(PERMISSIONS_ROWS)
    assert second == set(PERMISSIONS_ROWS)
    assert fake.exec_count == 1


async def test_invalidation_forces_reload(monkeypatch) -> None:
    monkeypatch.setattr(settings, "PERMISSION_CACHE_TTL_SECONDS", 60)
    _reset_caches()
    fake, session = _session(PERMISSIONS_ROWS)

    await rbac_service.effective_permissions_cached(session, USER_ID)
    rbac_service.invalidate_permission_cache()
    await rbac_service.effective_permissions_cached(session, USER_ID)

    assert fake.exec_count == 2


async def test_zero_ttl_disables_cache(monkeypatch) -> None:
    monkeypatch.setattr(settings, "PERMISSION_CACHE_TTL_SECONDS", 0)
    _reset_caches()
    fake, session = _session(PERMISSIONS_ROWS)

    await rbac_service.effective_permissions_cached(session, USER_ID)
    await rbac_service.effective_permissions_cached(session, USER_ID)

    assert fake.exec_count == 2


async def test_cached_role_names_resolve_once(monkeypatch) -> None:
    monkeypatch.setattr(settings, "PERMISSION_CACHE_TTL_SECONDS", 60)
    _reset_caches()
    fake, session = _session(["researcher", "staff"])

    first = await rbac_service.effective_role_names_cached(session, USER_ID)
    second = await rbac_service.effective_role_names_cached(session, USER_ID)

    assert first == ["researcher", "staff"]
    assert second == ["researcher", "staff"]
    assert fake.exec_count == 1


async def test_uncached_functions_always_query(monkeypatch) -> None:
    monkeypatch.setattr(settings, "PERMISSION_CACHE_TTL_SECONDS", 60)
    _reset_caches()
    fake, session = _session(PERMISSIONS_ROWS)

    first = await rbac_service.effective_permissions(session, USER_ID)
    second = await rbac_service.effective_permissions(session, USER_ID)

    assert first == set(PERMISSIONS_ROWS)
    assert second == set(PERMISSIONS_ROWS)
    assert fake.exec_count == 2
