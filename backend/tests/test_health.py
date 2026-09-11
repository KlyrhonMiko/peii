import pytest
from starlette.requests import Request

from routers import health as health_router

pytestmark = pytest.mark.anyio


async def test_health_check(client):
    response = await client.get("/api/v1/health")

    assert response.status_code == 200
    body = response.json()
    assert body["data"] == {"status": "ok"}
    assert body["message"] == "Success"
    assert body["errors"] is None
    assert "request_id" in body["meta"]


async def test_ready_checks_database_and_redis_and_returns_shared_envelope(
    client, monkeypatch: pytest.MonkeyPatch
):
    calls: list[str] = []

    class Connection:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def execute(self, _statement):
            calls.append("database")

    class Engine:
        def connect(self):
            return Connection()

    class Redis:
        async def ping(self):
            calls.append("redis")
            return True

    monkeypatch.setattr(health_router, "async_engine", Engine(), raising=False)
    monkeypatch.setattr(health_router, "get_redis_client", lambda: Redis(), raising=False)
    monkeypatch.setattr(health_router.settings, "CACHE_ENABLED", True)
    monkeypatch.setattr(health_router.settings, "READINESS_TIMEOUT_SECONDS", 1.0, raising=False)

    response = await client.get("/api/v1/ready")

    assert response.status_code == 200
    assert response.json()["data"] == {
        "status": "ready",
        "database": "ok",
        "redis": "ok",
    }
    assert response.json()["errors"] is None
    assert "request_id" in response.json()["meta"]
    assert set(calls) == {"database", "redis"}


async def test_ready_returns_safe_503_when_a_dependency_fails(
    client, monkeypatch: pytest.MonkeyPatch
):
    class Connection:
        async def __aenter__(self):
            raise RuntimeError("postgres password=secret")

        async def __aexit__(self, *_args):
            return None

    class Engine:
        def connect(self):
            return Connection()

    class Redis:
        async def ping(self):
            return True

    monkeypatch.setattr(health_router, "async_engine", Engine(), raising=False)
    monkeypatch.setattr(health_router, "get_redis_client", lambda: Redis(), raising=False)
    monkeypatch.setattr(health_router.settings, "CACHE_ENABLED", True)
    monkeypatch.setattr(health_router.settings, "READINESS_TIMEOUT_SECONDS", 1.0, raising=False)

    response = await client.get("/api/v1/ready")

    assert response.status_code == 503
    assert response.json()["data"] is None
    assert response.json()["message"] == "Service is not ready."
    assert response.json()["errors"] is None
    assert "postgres password=secret" not in response.text


async def test_ready_skips_redis_when_local_redis_features_are_disabled(
    client, monkeypatch: pytest.MonkeyPatch
):
    class Connection:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def execute(self, _statement):
            return None

    class Engine:
        def connect(self):
            return Connection()

    monkeypatch.setattr(health_router, "async_engine", Engine())
    monkeypatch.setattr(health_router.settings, "RATE_LIMIT_ENABLED", False)
    monkeypatch.setattr(health_router.settings, "CACHE_ENABLED", False)

    response = await client.get("/api/v1/ready")

    assert response.status_code == 200
    assert response.json()["data"]["redis"] == "skipped"


async def test_ready_skips_redis_when_all_shared_cache_namespaces_are_disabled(
    client, monkeypatch: pytest.MonkeyPatch
):
    class Connection:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def execute(self, _statement):
            return None

    class Engine:
        def connect(self):
            return Connection()

    def unexpected_redis_client():
        raise AssertionError("Redis client must not be fetched")

    monkeypatch.setattr(health_router, "async_engine", Engine())
    monkeypatch.setattr(health_router, "get_redis_client", unexpected_redis_client)
    monkeypatch.setattr(health_router.settings, "RATE_LIMIT_ENABLED", False)
    monkeypatch.setattr(health_router.settings, "CACHE_ENABLED", True)
    for ttl_name in (
        "CACHE_TTL_PEII_SECONDS",
        "CACHE_TTL_AGGREGATES_SECONDS",
        "CACHE_TTL_SURVEYS_SECONDS",
        "CACHE_TTL_USERS_SECONDS",
        "CACHE_TTL_RBAC_SECONDS",
    ):
        monkeypatch.setattr(health_router.settings, ttl_name, 0)

    response = await client.get("/api/v1/ready")

    assert response.status_code == 200
    assert response.json()["data"]["redis"] == "skipped"


async def test_ready_requires_redis_when_a_shared_cache_namespace_is_active(
    client, monkeypatch: pytest.MonkeyPatch
):
    calls: list[str] = []

    class Connection:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def execute(self, _statement):
            return None

    class Engine:
        def connect(self):
            return Connection()

    class Redis:
        async def ping(self):
            calls.append("redis")
            return True

    monkeypatch.setattr(health_router, "async_engine", Engine())
    monkeypatch.setattr(health_router, "get_redis_client", lambda: Redis())
    monkeypatch.setattr(health_router.settings, "RATE_LIMIT_ENABLED", False)
    monkeypatch.setattr(health_router.settings, "CACHE_ENABLED", True)
    for ttl_name in (
        "CACHE_TTL_PEII_SECONDS",
        "CACHE_TTL_AGGREGATES_SECONDS",
        "CACHE_TTL_SURVEYS_SECONDS",
        "CACHE_TTL_USERS_SECONDS",
        "CACHE_TTL_RBAC_SECONDS",
    ):
        monkeypatch.setattr(health_router.settings, ttl_name, 0)
    monkeypatch.setattr(health_router.settings, "CACHE_TTL_RBAC_SECONDS", 1)

    response = await client.get("/api/v1/ready")

    assert response.status_code == 200
    assert response.json()["data"]["redis"] == "ok"
    assert calls == ["redis"]


def test_rbac_audit_ip_uses_trusted_forwarded_client_address(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(health_router.settings, "TRUSTED_PROXY_CIDRS", ["10.0.0.0/8"])
    from routers.rbac import _ip_address

    request = Request(
        {
            "type": "http",
            "client": ("10.1.2.3", 1234),
            "headers": [(b"x-forwarded-for", b"198.51.100.7, 10.2.3.4")],
        }
    )

    assert _ip_address(request) == "198.51.100.7"


async def test_root_redirect(client):
    response = await client.get("/", follow_redirects=False)
    assert response.status_code == 307
    assert response.headers["location"] == "/api/v1/docs"


async def test_security_headers_are_present(client):
    response = await client.get("/api/v1/health")

    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["referrer-policy"] == "strict-origin-when-cross-origin"
    assert response.headers["permissions-policy"] == (
        "camera=(), geolocation=(), microphone=(), payment=()"
    )


async def test_survey_security_headers_override_global_policy(client):
    response = await client.get("/api/v1/survey/not-a-real-token")

    assert response.status_code == 404
    assert response.headers["referrer-policy"] == "no-referrer"
    assert response.headers["x-robots-tag"] == "noindex, nofollow, noarchive"


async def test_cors_preflight_uses_exact_api_policy(client):
    response = await client.options(
        "/api/v1/health",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "Content-Type, X-Request-ID",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert response.headers["access-control-allow-methods"] == "GET, POST, PATCH"
    assert response.headers["access-control-allow-headers"] == (
        "Accept, Accept-Language, Content-Language, Content-Type, Idempotency-Key, X-Request-ID"
    )
    assert "access-control-allow-credentials" not in response.headers
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["referrer-policy"] == "strict-origin-when-cross-origin"
    assert response.headers["permissions-policy"] == (
        "camera=(), geolocation=(), microphone=(), payment=()"
    )

    simple_response = await client.get(
        "/api/v1/health", headers={"Origin": "http://localhost:3000"}
    )
    assert simple_response.headers["access-control-expose-headers"] == (
        "Retry-After, X-Request-ID"
    )


async def test_non_survey_413_has_baseline_security_headers(client):
    response = await client.post(
        "/api/v1/auth/login",
        content=b"x" * 65_537,
        headers={"X-Request-ID": "non-survey-413"},
    )

    assert response.status_code == 413
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["referrer-policy"] == "strict-origin-when-cross-origin"
    assert response.headers["permissions-policy"] == (
        "camera=(), geolocation=(), microphone=(), payment=()"
    )
    assert response.headers["x-request-id"] == "non-survey-413"


async def test_survey_413_keeps_strict_headers_and_baseline_permissions_policy(client):
    response = await client.post(
        "/api/v1/survey/not-a-real-token/respond",
        content=b"x" * 65_537,
    )

    assert response.status_code == 413
    assert response.headers["cache-control"] == "private, no-store, max-age=0"
    assert response.headers["pragma"] == "no-cache"
    assert response.headers["referrer-policy"] == "no-referrer"
    assert response.headers["x-robots-tag"] == "noindex, nofollow, noarchive"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["content-security-policy"] == "frame-ancestors 'none'"
    assert response.headers["permissions-policy"] == (
        "camera=(), geolocation=(), microphone=(), payment=()"
    )
    assert response.headers["x-request-id"]
