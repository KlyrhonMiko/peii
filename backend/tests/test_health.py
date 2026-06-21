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

