import pytest

pytestmark = pytest.mark.anyio


async def test_health_check(client):
    response = await client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {
        "data": {"status": "ok"},
        "message": "Success",
        "errors": None,
        "meta": None,
    }
