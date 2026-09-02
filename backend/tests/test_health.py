import pytest

pytestmark = pytest.mark.anyio


async def test_health_check(client):
    response = await client.get("/api/v1/health")

    assert response.status_code == 200
    body = response.json()
    assert body["data"] == {"status": "ok"}
    assert body["message"] == "Success"
    assert body["errors"] is None
    assert "request_id" in body["meta"]


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
