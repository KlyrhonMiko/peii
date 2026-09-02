import json
from types import SimpleNamespace

import httpx
import pytest
from pydantic import ValidationError
from starlette.requests import Request

from core import rate_limit
from core.client_ip import resolve_client_ip
from core.config import Settings, settings
from core.deps import get_google_survey_respondent
from core.exceptions import RateLimitExceeded, RedisUnavailableError
from core.rate_limit import (
    FixedWindowRateLimiter,
    UpstashRedisRestClient,
    build_rate_limit_key,
    rate_limit_identifiers,
    rate_limit_policy,
)
from main import app
from routers import auth as auth_router


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
    values.update(
        RATE_LIMIT_ENABLED=True,
        RATE_LIMIT_INCLUDE_CLIENT_IP=True,
        RATE_LIMIT_KEY_HMAC_SECRET="short",
    )

    with pytest.raises(ValidationError, match="32"):
        Settings.model_validate(values)


def test_google_attestation_rate_limit_has_a_dedicated_conservative_policy() -> None:
    policy = rate_limit_policy("google-survey-attest")

    assert policy.name == "google-survey-attest"
    assert policy.limit == settings.GOOGLE_SURVEY_ATTEST_RATE_LIMIT
    assert policy.window_seconds == settings.GOOGLE_SURVEY_ATTEST_RATE_WINDOW_SECONDS
    assert policy.read_only is False


@pytest.mark.parametrize(
    ("normal", "global_policy"),
    [
        ("public-read", "public-read-global"),
        ("public-submit", "public-submit-global"),
        ("login", "login-global"),
        ("password-recovery", "password-recovery-global"),
    ],
)
def test_global_circuit_breakers_are_materially_higher(
    normal: str, global_policy: str
) -> None:
    assert rate_limit_policy(global_policy).limit >= rate_limit_policy(normal).limit * 10


def test_short_rate_limit_secret_is_allowed_when_limiting_disabled() -> None:
    values = settings.model_dump()
    values.update(RATE_LIMIT_ENABLED=False, RATE_LIMIT_KEY_HMAC_SECRET="short")

    assert Settings.model_validate(values).RATE_LIMIT_KEY_HMAC_SECRET == "short"


def test_csv_export_is_disabled_when_omitted_from_settings() -> None:
    values = settings.model_dump()
    values.pop("CSV_EXPORT_ENABLED", None)

    assert Settings.model_validate(values).CSV_EXPORT_ENABLED is False


def test_upstash_rest_settings_must_be_configured_together() -> None:
    values = settings.model_dump()
    values.update(
        UPSTASH_REDIS_REST_URL="https://example.upstash.io",
        UPSTASH_REDIS_REST_TOKEN=None,
    )

    with pytest.raises(ValidationError, match="configured together"):
        Settings.model_validate(values)


def test_withdrawal_rate_limiting_requires_client_ip_in_production() -> None:
    values = settings.model_dump()
    values.update(
        DEBUG=False,
        DB_MODE="supabase",
        RATE_LIMIT_ENABLED=True,
        RATE_LIMIT_INCLUDE_CLIENT_IP=False,
        RATE_LIMIT_KEY_HMAC_SECRET="x" * 32,
        WITHDRAWAL_CODE_HMAC_SECRET="x" * 32,
        GOOGLE_OAUTH_CLIENT_ID="production-google-client-id",
        SURVEY_RESPONDENT_HMAC_SECRET="s" * 32,
        REDIS_URL="rediss://redis.example.com:6379/0",
        TRUSTED_PROXY_CIDRS=["198.51.100.0/24"],
        DATABASE_TLS_MODE="require",
        APP_ORIGIN="https://app.example.com",
        BACKEND_CORS_ORIGINS=["https://app.example.com"],
    )

    with pytest.raises(ValidationError, match="RATE_LIMIT_INCLUDE_CLIENT_IP"):
        Settings.model_validate(values)

    values["RATE_LIMIT_INCLUDE_CLIENT_IP"] = True
    production_settings = Settings.model_validate(values)
    assert production_settings.RATE_LIMIT_INCLUDE_CLIENT_IP is True


@pytest.mark.parametrize(
    ("setting", "value", "message"),
    [
        ("RATE_LIMIT_READ_FAILURE_POLICY", "fail_open", "RATE_LIMIT_READ_FAILURE_POLICY"),
        ("TRUSTED_PROXY_CIDRS", [], "TRUSTED_PROXY_CIDRS"),
        ("TRUSTED_PROXY_CIDRS", ["not-a-cidr"], "TRUSTED_PROXY_CIDRS"),
        ("TRUSTED_PROXY_CIDRS", ["198.51.100.1/24"], "TRUSTED_PROXY_CIDRS"),
        ("REDIS_URL", "redis://redis.example.com:6379/0", "Redis"),
    ],
)
def test_production_supabase_rejects_insecure_traffic_settings(
    setting: str, value: object, message: str
) -> None:
    values = settings.model_dump()
    values.update(
        DEBUG=False,
        DB_MODE="supabase",
        DATABASE_TLS_MODE="require",
        RATE_LIMIT_ENABLED=True,
        RATE_LIMIT_INCLUDE_CLIENT_IP=True,
        RATE_LIMIT_KEY_HMAC_SECRET="x" * 32,
        WITHDRAWAL_CODE_HMAC_SECRET="x" * 32,
        GOOGLE_OAUTH_CLIENT_ID="production-google-client-id",
        SURVEY_RESPONDENT_HMAC_SECRET="s" * 32,
        REDIS_URL="rediss://redis.example.com:6379/0",
        TRUSTED_PROXY_CIDRS=["198.51.100.0/24"],
        APP_ORIGIN="https://app.example.com",
        BACKEND_CORS_ORIGINS=["https://app.example.com"],
        UPSTASH_REDIS_REST_URL=None,
        UPSTASH_REDIS_REST_TOKEN=None,
    )
    values[setting] = value

    with pytest.raises(ValidationError, match=message):
        Settings.model_validate(values)


def test_production_supabase_accepts_rediss_without_upstash() -> None:
    values = settings.model_dump()
    values.update(
        DEBUG=False,
        DB_MODE="supabase",
        DATABASE_TLS_MODE="require",
        RATE_LIMIT_ENABLED=True,
        RATE_LIMIT_INCLUDE_CLIENT_IP=True,
        RATE_LIMIT_KEY_HMAC_SECRET="x" * 32,
        WITHDRAWAL_CODE_HMAC_SECRET="x" * 32,
        GOOGLE_OAUTH_CLIENT_ID="production-google-client-id",
        SURVEY_RESPONDENT_HMAC_SECRET="s" * 32,
        REDIS_URL="rediss://redis.example.com:6379/0",
        TRUSTED_PROXY_CIDRS=["198.51.100.0/24"],
        UPSTASH_REDIS_REST_URL=None,
        UPSTASH_REDIS_REST_TOKEN=None,
        APP_ORIGIN="https://app.example.com",
        BACKEND_CORS_ORIGINS=["https://app.example.com"],
    )

    assert Settings.model_validate(values).REDIS_URL.startswith("rediss://")


@pytest.mark.parametrize(
    ("url", "token"),
    [
        ("http://example.upstash.io", "token"),
        ("https://example.upstash.io/path", "token"),
        ("https://example.upstash.io", None),
    ],
)
def test_production_supabase_rejects_invalid_upstash_configuration(
    url: str, token: str | None
) -> None:
    values = settings.model_dump()
    values.update(
        DEBUG=False,
        DB_MODE="supabase",
        DATABASE_TLS_MODE="require",
        RATE_LIMIT_ENABLED=True,
        RATE_LIMIT_INCLUDE_CLIENT_IP=True,
        RATE_LIMIT_KEY_HMAC_SECRET="x" * 32,
        WITHDRAWAL_CODE_HMAC_SECRET="x" * 32,
        GOOGLE_OAUTH_CLIENT_ID="production-google-client-id",
        SURVEY_RESPONDENT_HMAC_SECRET="s" * 32,
        REDIS_URL="rediss://redis.example.com:6379/0",
        TRUSTED_PROXY_CIDRS=["198.51.100.0/24"],
        UPSTASH_REDIS_REST_URL=url,
        UPSTASH_REDIS_REST_TOKEN=token,
        APP_ORIGIN="https://app.example.com",
        BACKEND_CORS_ORIGINS=["https://app.example.com"],
    )

    with pytest.raises(ValidationError):
        Settings.model_validate(values)


def test_production_supabase_accepts_complete_https_upstash_configuration() -> None:
    values = settings.model_dump()
    values.update(
        DEBUG=False,
        DB_MODE="supabase",
        DATABASE_TLS_MODE="require",
        RATE_LIMIT_ENABLED=True,
        RATE_LIMIT_INCLUDE_CLIENT_IP=True,
        RATE_LIMIT_KEY_HMAC_SECRET="x" * 32,
        WITHDRAWAL_CODE_HMAC_SECRET="x" * 32,
        GOOGLE_OAUTH_CLIENT_ID="production-google-client-id",
        SURVEY_RESPONDENT_HMAC_SECRET="s" * 32,
        REDIS_URL="redis://redis:6379/0",
        TRUSTED_PROXY_CIDRS=["198.51.100.0/24"],
        UPSTASH_REDIS_REST_URL="https://example.upstash.io",
        UPSTASH_REDIS_REST_TOKEN="token",
        APP_ORIGIN="https://app.example.com",
        BACKEND_CORS_ORIGINS=["https://app.example.com"],
    )

    assert Settings.model_validate(values).UPSTASH_REDIS_REST_URL == "https://example.upstash.io"


def test_local_settings_allow_plain_redis_and_empty_proxy_list() -> None:
    values = settings.model_dump()
    values.update(
        DEBUG=True,
        DB_MODE="local",
        RATE_LIMIT_ENABLED=False,
        RATE_LIMIT_INCLUDE_CLIENT_IP=False,
        REDIS_URL="redis://redis:6379/0",
        TRUSTED_PROXY_CIDRS=[],
        UPSTASH_REDIS_REST_URL=None,
        UPSTASH_REDIS_REST_TOKEN=None,
    )

    local_settings = Settings.model_validate(values)
    assert local_settings.REDIS_URL == "redis://redis:6379/0"
    assert local_settings.TRUSTED_PROXY_CIDRS == []


def test_rate_limiting_cannot_be_disabled_outside_debug_mode() -> None:
    values = settings.model_dump()
    values.update(
        DEBUG=False,
        RATE_LIMIT_ENABLED=False,
        RATE_LIMIT_INCLUDE_CLIENT_IP=False,
        WITHDRAWAL_CODE_HMAC_SECRET="x" * 32,
        DATABASE_TLS_MODE="require",
        APP_ORIGIN="https://app.example.com",
        BACKEND_CORS_ORIGINS=["https://app.example.com"],
    )

    with pytest.raises(ValidationError, match="RATE_LIMIT_ENABLED"):
        Settings.model_validate(values)


def test_rate_limiting_can_remain_disabled_in_debug_mode() -> None:
    values = settings.model_dump()
    values.update(
        DEBUG=True,
        RATE_LIMIT_ENABLED=False,
        RATE_LIMIT_INCLUDE_CLIENT_IP=False,
    )

    assert Settings.model_validate(values).RATE_LIMIT_ENABLED is False


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
    survey_id = "raw-survey-id"

    await rate_limit.check_public_survey_read(request, survey_id)
    await rate_limit.check_public_survey_submit(request, survey_id)

    assert calls == [
        ("public-read", [f"survey:{survey_id}"]),
        ("public-submit", [f"survey:{survey_id}"]),
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
    survey_id = "raw-survey-id"

    await rate_limit.check_public_survey_read(request, survey_id)
    await rate_limit.check_public_survey_submit(request, survey_id)

    assert calls == [
        ("public-read", ["ip:203.0.113.20", f"survey:{survey_id}"]),
        ("public-submit", ["ip:203.0.113.20", f"survey:{survey_id}"]),
    ]


@pytest.mark.anyio
async def test_authenticated_survey_limit_uses_one_subject_session_token_bucket(
    monkeypatch,
) -> None:
    calls: list[tuple[str, list[str]]] = []

    async def fake_enforce(policy, identifiers, **_kwargs) -> None:
        calls.append((policy.name, list(identifiers)))

    monkeypatch.setattr(rate_limit, "enforce_rate_limit", fake_enforce)

    await rate_limit.enforce_authenticated_survey_rate_limit(
        "public-read",
        auth_user_id="subject-a",
        session_id="session-a",
        survey_id="survey-token",
    )

    assert calls == [
        (
            "public-read",
            ["subject:subject-a:session:session-a:survey:survey-token"],
        ),
        ("public-read-global", ["public-read-global"]),
    ]


@pytest.mark.anyio
async def test_authenticated_survey_budgets_are_distinct_by_subject_and_session(
    monkeypatch,
) -> None:
    class CountingRedis:
        def __init__(self) -> None:
            self.counts: dict[str, int] = {}

        async def eval(self, *_args: object) -> list[int]:
            key = str(_args[2])
            limit = int(str(_args[4]))
            count = self.counts.get(key, 0) + 1
            self.counts[key] = count
            return [int(count <= limit), count, 60]

    monkeypatch.setattr(rate_limit.settings, "RATE_LIMIT_ENABLED", True)
    monkeypatch.setattr(rate_limit.settings, "PUBLIC_SURVEY_READ_LIMIT", 2)
    monkeypatch.setattr(rate_limit.settings, "PUBLIC_SURVEY_READ_GLOBAL_LIMIT", 100)
    limiter = FixedWindowRateLimiter(
        CountingRedis(),
        secret="x" * 32,
        settings_obj=rate_limit.settings,
    )
    monkeypatch.setattr(rate_limit, "get_rate_limiter", lambda: limiter)

    for _ in range(2):
        await rate_limit.enforce_authenticated_survey_rate_limit(
            "public-read",
            auth_user_id="subject-a",
            session_id="session-a",
            survey_id="survey-token",
        )

    with pytest.raises(RateLimitExceeded):
        await rate_limit.enforce_authenticated_survey_rate_limit(
            "public-read",
            auth_user_id="subject-a",
            session_id="session-a",
            survey_id="survey-token",
        )

    await rate_limit.enforce_authenticated_survey_rate_limit(
        "public-read",
        auth_user_id="subject-a",
        session_id="session-b",
        survey_id="survey-token",
    )
    await rate_limit.enforce_authenticated_survey_rate_limit(
        "public-read",
        auth_user_id="subject-b",
        session_id="session-b",
        survey_id="survey-token",
    )


@pytest.mark.anyio
async def test_normalized_identifier_limits_do_not_use_shared_peer_and_have_global_breaker(
    monkeypatch,
) -> None:
    calls: list[tuple[str, list[str]]] = []

    async def fake_enforce(policy, identifiers, **_kwargs) -> None:
        calls.append((policy.name, list(identifiers)))

    monkeypatch.setattr(rate_limit, "enforce_rate_limit", fake_enforce)

    await rate_limit.enforce_identifier_rate_limit("login", "identifier:alice@example.com")

    assert calls == [
        ("login", ["identifier:alice@example.com"]),
        ("login-global", ["login-global"]),
    ]


@pytest.mark.anyio
async def test_new_rate_limit_buckets_fail_closed_when_redis_is_unavailable(monkeypatch) -> None:
    monkeypatch.setattr(rate_limit.settings, "RATE_LIMIT_ENABLED", True)
    limiter = FixedWindowRateLimiter(
        FakeRedis(ConnectionError("redis unavailable")),
        secret="x" * 32,
        settings_obj=rate_limit.settings,
    )
    monkeypatch.setattr(rate_limit, "get_rate_limiter", lambda: limiter)

    with pytest.raises(RedisUnavailableError):
        await rate_limit.enforce_authenticated_survey_rate_limit(
            "public-submit",
            auth_user_id="subject-a",
            session_id="session-a",
            survey_id="survey-token",
        )

    with pytest.raises(RedisUnavailableError):
        await rate_limit.enforce_identifier_rate_limit(
            "password-recovery", "email:alice@example.com"
        )


@pytest.mark.anyio
async def test_unauthenticated_survey_failure_does_not_consume_authenticated_capacity(
    client, monkeypatch
) -> None:
    async def reject_respondent() -> None:
        from core.exceptions import AppError

        raise AppError("Authentication required.", status_code=401)

    app.dependency_overrides[get_google_survey_respondent] = reject_respondent
    monkeypatch.setattr(rate_limit.settings, "RATE_LIMIT_ENABLED", True)
    redis = FakeRedis([1, 1, 1])
    limiter = FixedWindowRateLimiter(
        redis,
        secret="x" * 32,
        settings_obj=rate_limit.settings,
    )
    monkeypatch.setattr(rate_limit, "get_rate_limiter", lambda: limiter)

    response = await client.get(
        "/api/v1/survey/known-token",
        headers={"X-Forwarded-For": "203.0.113.20"},
    )
    submit_response = await client.post(
        "/api/v1/survey/known-token/respond",
        json={
            "answers": {},
            "consent": {"accepted": True, "version": "test"},
            "withdrawal_code": "A" * 43,
        },
        headers={
            "X-Forwarded-For": "203.0.113.20",
            "Idempotency-Key": "00000000-0000-0000-0000-000000000401",
        },
    )

    assert response.status_code == 401
    assert submit_response.status_code == 401
    assert redis.calls == []


@pytest.mark.anyio
async def test_login_and_recovery_use_normalized_identity_without_shared_peer_bucket(
    client, monkeypatch
) -> None:
    calls: list[tuple[str, str]] = []

    async def capture(policy_name: str, identifier: str) -> None:
        calls.append((policy_name, identifier))

    monkeypatch.setattr(auth_router, "enforce_identifier_rate_limit", capture)

    async def no_audit(*_args, **_kwargs) -> None:
        return None

    monkeypatch.setattr(auth_router, "commit_with_audit", no_audit)

    async def fake_authenticate(*_args) -> tuple[object, dict[str, object]]:
        from models.user import User

        return (
            User(
                id="00000000-0000-0000-0000-000000000301",
                user_id="USER-RATE-LIMIT",
                auth_user_id="00000000-0000-0000-0000-000000000302",
                email="alice@example.com",
                username="alice",
                first_name="Alice",
                last_name="Example",
            ),
            {
                "access_token": "access",
                "refresh_token": "refresh",
                "expires_in": 3600,
                "token_type": "bearer",
            },
        )

    monkeypatch.setattr(auth_router.auth_service, "authenticate", fake_authenticate)

    async def fake_recovery(*_args) -> None:
        return None

    monkeypatch.setattr(auth_router, "send_recovery_email", fake_recovery)
    peer_headers = {"X-Forwarded-For": "203.0.113.20"}

    login_response = await client.post(
        "/api/v1/auth/login",
        json={"identifier": " Alice@Example.com ", "password": "password"},
        headers=peer_headers,
    )
    recovery_response = await client.post(
        "/api/v1/auth/password/recover",
        json={"email": " Bob@Example.com "},
        headers=peer_headers,
    )

    assert login_response.status_code == 200
    assert recovery_response.status_code == 200
    assert calls == [
        ("login", "identifier:alice@example.com"),
        ("password-recovery", "email:bob@example.com"),
    ]


@pytest.mark.anyio
async def test_google_attestation_bucket_uses_only_verified_subject_and_session(
    monkeypatch,
) -> None:
    calls: list[tuple[str, list[str]]] = []

    async def fake_enforce(policy, identifiers, **_kwargs) -> None:
        calls.append((policy.name, list(identifiers)))

    monkeypatch.setattr(rate_limit, "enforce_rate_limit", fake_enforce)
    monkeypatch.setattr(rate_limit.settings, "RATE_LIMIT_INCLUDE_CLIENT_IP", True)
    monkeypatch.setattr(rate_limit.settings, "TRUSTED_PROXY_CIDRS", ["10.0.0.0/8"])
    request = Request(_scope("10.0.0.3", "203.0.113.20, 10.0.0.2"))

    await rate_limit.check_google_survey_attestation(
        request,
        subject="00000000-0000-0000-0000-000000000101",
        session_id="00000000-0000-0000-0000-000000000102",
    )

    assert calls == [
        (
            "google-survey-attest",
            [
                "subject:00000000-0000-0000-0000-000000000101",
                "session:00000000-0000-0000-0000-000000000102",
            ],
        )
    ]


@pytest.mark.anyio
async def test_repeated_google_attestation_identity_is_limited_by_policy(monkeypatch) -> None:
    class CountingRedis:
        def __init__(self) -> None:
            self.counts: dict[str, int] = {}

        async def eval(self, *_args: object) -> list[int]:
            key = str(_args[2])
            limit = int(str(_args[4]))
            count = self.counts.get(key, 0) + 1
            self.counts[key] = count
            return [int(count <= limit), count, 60]

    monkeypatch.setattr(rate_limit.settings, "RATE_LIMIT_ENABLED", True)
    monkeypatch.setattr(rate_limit.settings, "RATE_LIMIT_INCLUDE_CLIENT_IP", True)
    monkeypatch.setattr(rate_limit.settings, "GOOGLE_SURVEY_ATTEST_RATE_LIMIT", 2)
    limiter = FixedWindowRateLimiter(
        CountingRedis(),
        secret="x" * 32,
        settings_obj=rate_limit.settings,
    )
    monkeypatch.setattr(rate_limit, "get_rate_limiter", lambda: limiter)
    request = Request(_scope("10.0.0.3", "203.0.113.20, 10.0.0.2"))

    for _ in range(2):
        await rate_limit.check_google_survey_attestation(
            request,
            subject="00000000-0000-0000-0000-000000000101",
            session_id="00000000-0000-0000-0000-000000000102",
        )

    with pytest.raises(RateLimitExceeded):
        await rate_limit.check_google_survey_attestation(
            request,
            subject="00000000-0000-0000-0000-000000000101",
            session_id="00000000-0000-0000-0000-000000000102",
        )


@pytest.mark.anyio
async def test_withdrawal_uses_strict_client_and_separate_global_buckets(monkeypatch) -> None:
    calls: list[tuple[str, list[str], int, int]] = []

    async def fake_enforce(policy, identifiers, **_kwargs) -> None:
        calls.append((policy.name, list(identifiers), policy.limit, policy.window_seconds))

    monkeypatch.setattr(rate_limit, "enforce_rate_limit", fake_enforce)
    monkeypatch.setattr(rate_limit.settings, "RATE_LIMIT_INCLUDE_CLIENT_IP", True)
    monkeypatch.setattr(rate_limit.settings, "TRUSTED_PROXY_CIDRS", ["10.0.0.0/8"])
    request = Request(_scope("10.0.0.3", "203.0.113.20, 10.0.0.2"))

    await rate_limit.check_public_survey_withdrawal(request)

    assert calls == [
        ("public-withdrawal-client", ["ip:203.0.113.20"], 10, 60),
        ("public-withdrawal-global", ["withdrawal-global"], 1000, 60),
    ]


@pytest.mark.anyio
async def test_exhausting_one_withdrawal_client_does_not_block_another(monkeypatch) -> None:
    class CountingRedis:
        def __init__(self) -> None:
            self.counts: dict[str, int] = {}

        async def eval(self, *_args: object) -> list[int]:
            key = str(_args[2])
            limit = int(str(_args[4]))
            count = self.counts.get(key, 0) + 1
            self.counts[key] = count
            return [int(count <= limit), count, 60]

    monkeypatch.setattr(rate_limit.settings, "RATE_LIMIT_ENABLED", True)
    monkeypatch.setattr(rate_limit.settings, "RATE_LIMIT_INCLUDE_CLIENT_IP", True)
    monkeypatch.setattr(rate_limit.settings, "PUBLIC_SURVEY_WITHDRAWAL_CLIENT_LIMIT", 2)
    redis = CountingRedis()
    limiter = FixedWindowRateLimiter(
        redis,
        secret="x" * 32,
        settings_obj=rate_limit.settings,
    )
    monkeypatch.setattr(rate_limit, "get_rate_limiter", lambda: limiter)

    client_a = Request(_scope("198.51.100.10"))
    client_b = Request(_scope("198.51.100.11"))
    await rate_limit.check_public_survey_withdrawal(client_a)
    await rate_limit.check_public_survey_withdrawal(client_a)

    with pytest.raises(RateLimitExceeded):
        await rate_limit.check_public_survey_withdrawal(client_a)

    await rate_limit.check_public_survey_withdrawal(client_b)


@pytest.mark.anyio
async def test_withdrawal_global_bucket_is_always_applied_without_client_ip(monkeypatch) -> None:
    calls: list[tuple[str, list[str]]] = []

    async def fake_enforce(policy, identifiers, **_kwargs) -> None:
        calls.append((policy.name, list(identifiers)))

    monkeypatch.setattr(rate_limit, "enforce_rate_limit", fake_enforce)
    monkeypatch.setattr(rate_limit.settings, "RATE_LIMIT_INCLUDE_CLIENT_IP", False)
    await rate_limit.check_public_survey_withdrawal(Request(_scope("198.51.100.10")))

    assert calls == [("public-withdrawal-global", ["withdrawal-global"])]


@pytest.mark.anyio
async def test_withdrawal_redis_failure_fails_closed(monkeypatch) -> None:
    monkeypatch.setattr(rate_limit.settings, "RATE_LIMIT_ENABLED", True)
    monkeypatch.setattr(rate_limit.settings, "RATE_LIMIT_INCLUDE_CLIENT_IP", False)
    limiter = FixedWindowRateLimiter(
        FakeRedis(ConnectionError("redis unavailable")),
        secret="x" * 32,
        settings_obj=rate_limit.settings,
    )
    monkeypatch.setattr(rate_limit, "get_rate_limiter", lambda: limiter)

    with pytest.raises(RedisUnavailableError):
        await rate_limit.check_public_survey_withdrawal(
            Request(_scope("198.51.100.10"))
        )


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
