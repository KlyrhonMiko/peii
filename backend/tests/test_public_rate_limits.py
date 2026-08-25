import json
from types import SimpleNamespace

import httpx
import pytest
from pydantic import ValidationError
from starlette.requests import Request

from core import rate_limit
from core.client_ip import resolve_client_ip
from core.config import Settings, settings
from core.exceptions import RateLimitExceeded, RedisUnavailableError
from core.rate_limit import (
    FixedWindowRateLimiter,
    UpstashRedisRestClient,
    build_rate_limit_key,
    rate_limit_identifiers,
)


def _scope(peer: str, forwarded_for: str | None = None) -> dict:
    headers = []
    if forwarded_for is not None:
        headers.append((b"x-forwarded-for", forwarded_for.encode()))
    return {
        "type": "http",
        "client": (peer, 1234),
        "headers": headers,
    }


def test_forwarding_header_is_ignored_from_untrusted_peer() -> None:
    assert resolve_client_ip(
        _scope("198.51.100.10", "203.0.113.20"),
        trusted_proxy_cidrs=["10.0.0.0/8"],
    ) == "198.51.100.10"


def test_forwarded_chain_is_resolved_right_to_left() -> None:
    assert resolve_client_ip(
        _scope("10.0.0.3", "203.0.113.20, 10.0.0.2"),
        trusted_proxy_cidrs=["10.0.0.0/8"],
    ) == "203.0.113.20"


def test_malformed_forwarding_chain_falls_back_to_peer() -> None:
    assert resolve_client_ip(
        _scope("10.0.0.3", "not-an-ip, 10.0.0.2"),
        trusted_proxy_cidrs=["10.0.0.0/8"],
    ) == "10.0.0.3"


def test_rate_limit_keys_do_not_contain_raw_identifiers() -> None:
    raw_identifier = "198.51.100.10:user@example.com:secret-token"
    key = build_rate_limit_key("login", raw_identifier, "test-hmac-secret")

    assert raw_identifier not in key
    assert "198.51.100.10" not in key
    assert "user@example.com" not in key
    assert "secret-token" not in key


def test_rate_limit_secret_requires_32_bytes_when_limiting_enabled() -> None:
    values = settings.model_dump()
    values.update(RATE_LIMIT_ENABLED=True, RATE_LIMIT_KEY_HMAC_SECRET="short")

    with pytest.raises(ValidationError, match="32"):
        Settings.model_validate(values)


def test_short_rate_limit_secret_is_allowed_when_limiting_disabled() -> None:
    values = settings.model_dump()
    values.update(RATE_LIMIT_ENABLED=False, RATE_LIMIT_KEY_HMAC_SECRET="short")

    assert Settings.model_validate(values).RATE_LIMIT_KEY_HMAC_SECRET == "short"


def test_upstash_rest_settings_must_be_configured_together() -> None:
    values = settings.model_dump()
    values.update(
        UPSTASH_REDIS_REST_URL="https://example.upstash.io",
        UPSTASH_REDIS_REST_TOKEN=None,
    )

    with pytest.raises(ValidationError, match="configured together"):
        Settings.model_validate(values)


def test_rate_limit_identifiers_use_resource_only_by_default(monkeypatch) -> None:
    monkeypatch.setattr(rate_limit.settings, "RATE_LIMIT_INCLUDE_CLIENT_IP", False)
    request = Request(_scope("10.0.0.3", "203.0.113.20, 10.0.0.2"))

    assert rate_limit_identifiers("token:shared-token", request) == [
        "token:shared-token"
    ]
    assert rate_limit_identifiers("identifier:alice@example.com", request) == [
        "identifier:alice@example.com"
    ]


def test_rate_limit_identifiers_include_resolved_ip_when_enabled(monkeypatch) -> None:
    monkeypatch.setattr(rate_limit.settings, "RATE_LIMIT_INCLUDE_CLIENT_IP", True)
    monkeypatch.setattr(rate_limit.settings, "TRUSTED_PROXY_CIDRS", ["10.0.0.0/8"])
    request = Request(_scope("10.0.0.3", "203.0.113.20, 10.0.0.2"))

    assert rate_limit_identifiers("token:shared-token", request) == [
        "ip:203.0.113.20",
        "token:shared-token",
    ]
    assert rate_limit_identifiers("email:alice@example.com", request) == [
        "ip:203.0.113.20",
        "email:alice@example.com",
    ]


class FakeRedis:
    def __init__(self, result: list[int] | Exception) -> None:
        self.result = result
        self.calls: list[tuple[object, ...]] = []

    async def eval(self, *args: object) -> list[int]:
        self.calls.append(args)
        if isinstance(self.result, Exception):
            raise self.result
        return self.result


@pytest.mark.anyio
async def test_upstash_rest_posts_eval_command_with_bearer_auth() -> None:
    captured: dict[str, object] = {}
    token = "test-upstash-token"

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["authorization"] = request.headers["authorization"]
        captured["command"] = json.loads(request.content)
        return httpx.Response(200, json={"result": [1, 4, 7]})

    client = UpstashRedisRestClient(
        "https://example.upstash.io",
        token,
        max_connections=4,
        connect_timeout_seconds=1,
        socket_timeout_seconds=2,
        transport=httpx.MockTransport(handler),
    )
    try:
        result = await client.eval("return ARGV[1]", 1, "key", "60", "10")
    finally:
        await client.aclose()

    assert result == [1, 4, 7]
    assert captured == {
        "url": "https://example.upstash.io",
        "authorization": f"Bearer {token}",
        "command": ["EVAL", "return ARGV[1]", 1, "key", "60", "10"],
    }


@pytest.mark.anyio
@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(503, text="upstream unavailable"),
        httpx.Response(200, json={"error": "command failed"}),
        httpx.Response(200, json={"unexpected": True}),
        httpx.Response(200, json={"result": "not-a-result"}),
        httpx.Response(200, text="not-json"),
    ],
)
async def test_upstash_rest_failures_are_generic_and_secret_free(
    response: httpx.Response,
) -> None:
    token = "test-upstash-token"

    def handler(_request: httpx.Request) -> httpx.Response:
        return response

    client = UpstashRedisRestClient(
        "https://example.upstash.io",
        token,
        transport=httpx.MockTransport(handler),
    )
    try:
        with pytest.raises(RuntimeError) as raised:
            await client.eval("return 1", 0)
    finally:
        await client.aclose()

    assert token not in str(raised.value)


@pytest.mark.anyio
async def test_upstash_failure_uses_existing_read_failure_policy() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"error": "command failed"})

    client = UpstashRedisRestClient(
        "https://example.upstash.io",
        "test-upstash-token",
        transport=httpx.MockTransport(handler),
    )
    limiter = FixedWindowRateLimiter(
        client,
        secret="test-hmac-secret",
        settings=SimpleNamespace(RATE_LIMIT_ENABLED=True),
    )
    try:
        await limiter.check(
            "public-read",
            ["resource"],
            limit=10,
            window_seconds=60,
            read_only=True,
            read_failure_policy="fail_open",
        )
        with pytest.raises(RedisUnavailableError):
            await limiter.check(
                "public-read",
                ["resource"],
                limit=10,
                window_seconds=60,
                read_only=True,
                read_failure_policy="fail_closed",
            )
    finally:
        await client.aclose()


@pytest.mark.anyio
async def test_rate_limit_lifecycle_prefers_upstash_rest(monkeypatch) -> None:
    lifecycle_settings = SimpleNamespace(
        RATE_LIMIT_ENABLED=True,
        RATE_LIMIT_KEY_HMAC_SECRET="test-hmac-secret",
        UPSTASH_REDIS_REST_URL="https://example.upstash.io",
        UPSTASH_REDIS_REST_TOKEN="test-upstash-token",
        REDIS_URL="redis://redis:6379/0",
        REDIS_MAX_CONNECTIONS=4,
        REDIS_CONNECT_TIMEOUT_SECONDS=1,
        REDIS_SOCKET_TIMEOUT_SECONDS=2,
    )
    monkeypatch.setattr(rate_limit, "settings", lifecycle_settings)
    lifecycle = rate_limit.RedisRateLimitLifecycle()

    await lifecycle.start()
    try:
        assert isinstance(lifecycle.client, UpstashRedisRestClient)
        assert isinstance(lifecycle.limiter, FixedWindowRateLimiter)
    finally:
        await lifecycle.stop()


@pytest.mark.anyio
async def test_fixed_window_returns_retry_after() -> None:
    redis = FakeRedis([0, 4, 7])
    limiter = FixedWindowRateLimiter(
        redis,
        secret="test-hmac-secret",
        settings=SimpleNamespace(RATE_LIMIT_ENABLED=True),
    )

    with pytest.raises(RateLimitExceeded) as raised:
        await limiter.check("login", ["198.51.100.10"], limit=3, window_seconds=60)

    assert raised.value.retry_after == 7
    assert redis.calls


@pytest.mark.anyio
async def test_public_buckets_use_token_only_by_default(monkeypatch) -> None:
    calls: list[tuple[str, list[str]]] = []

    async def fake_enforce(policy, identifiers, **_kwargs) -> None:
        calls.append((policy.name, list(identifiers)))

    monkeypatch.setattr(rate_limit, "enforce_rate_limit", fake_enforce)
    monkeypatch.setattr(rate_limit.settings, "RATE_LIMIT_INCLUDE_CLIENT_IP", False)
    monkeypatch.setattr(rate_limit.settings, "TRUSTED_PROXY_CIDRS", ["10.0.0.0/8"])
    request = Request(_scope("10.0.0.3", "203.0.113.20, 10.0.0.2"))
    token = "raw-token-value"

    await rate_limit.check_public_survey_read(request, token)
    await rate_limit.check_public_survey_submit(request, token)

    assert calls == [
        ("public-read", [f"token:{token}"]),
        ("public-submit", [f"token:{token}"]),
    ]


@pytest.mark.anyio
async def test_public_buckets_include_resolved_ip_when_enabled(monkeypatch) -> None:
    calls: list[tuple[str, list[str]]] = []

    async def fake_enforce(policy, identifiers, **_kwargs) -> None:
        calls.append((policy.name, list(identifiers)))

    monkeypatch.setattr(rate_limit, "enforce_rate_limit", fake_enforce)
    monkeypatch.setattr(rate_limit.settings, "RATE_LIMIT_INCLUDE_CLIENT_IP", True)
    monkeypatch.setattr(rate_limit.settings, "TRUSTED_PROXY_CIDRS", ["10.0.0.0/8"])
    request = Request(_scope("10.0.0.3", "203.0.113.20, 10.0.0.2"))
    token = "raw-token-value"

    await rate_limit.check_public_survey_read(request, token)
    await rate_limit.check_public_survey_submit(request, token)

    assert calls == [
        ("public-read", ["ip:203.0.113.20", f"token:{token}"]),
        ("public-submit", ["ip:203.0.113.20", f"token:{token}"]),
    ]


@pytest.mark.anyio
async def test_public_bucket_keys_hash_ip_and_token() -> None:
    redis = FakeRedis([1, 1, 10])
    limiter = FixedWindowRateLimiter(
        redis,
        secret="test-hmac-secret",
        settings=SimpleNamespace(RATE_LIMIT_ENABLED=True),
    )

    await limiter.check(
        "public-read",
        ["ip:203.0.113.20", "token:raw-token-value"],
        limit=60,
        window_seconds=60,
        read_only=True,
    )

    keys = [str(call[2]) for call in redis.calls]
    assert len(keys) == 2
    assert all("203.0.113.20" not in key for key in keys)
    assert all("raw-token-value" not in key for key in keys)


@pytest.mark.anyio
async def test_redis_outage_uses_read_failure_policy() -> None:
    redis = FakeRedis(ConnectionError("redis unavailable"))
    limiter = FixedWindowRateLimiter(
        redis,
        secret="test-hmac-secret",
        settings=SimpleNamespace(RATE_LIMIT_ENABLED=True),
    )

    with pytest.raises(RedisUnavailableError):
        await limiter.check("public-read", ["198.51.100.10"], limit=10, window_seconds=60)

    await limiter.check(
        "public-read",
        ["198.51.100.10"],
        limit=10,
        window_seconds=60,
        read_only=True,
        read_failure_policy="fail_open",
    )


@pytest.mark.anyio
async def test_read_fail_open_setting_does_not_open_writes() -> None:
    redis = FakeRedis(ConnectionError("redis unavailable"))
    limiter = FixedWindowRateLimiter(
        redis,
        secret="test-hmac-secret",
        settings=SimpleNamespace(
            RATE_LIMIT_ENABLED=True,
            RATE_LIMIT_READ_FAILURE_POLICY="fail_open",
        ),
    )

    with pytest.raises(RedisUnavailableError):
        await limiter.check("public-submit", ["ip:203.0.113.20"], limit=10, window_seconds=60)
