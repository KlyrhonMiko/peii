import pytest

pytestmark = pytest.mark.anyio


async def _create_active_survey(client):
    resp = await client.post("/api/v1/surveys/", json={
        "title": "Distributable Survey",
        "status": "Active",
        "performed_by": None,
    })
    return resp.json()["data"]["id"]


async def test_create_and_list_distributions(client):
    survey_uuid = await _create_active_survey(client)

    dist_resp = await client.post(f"/api/v1/surveys/{survey_uuid}/distributions/")
    assert dist_resp.status_code == 201
    token = dist_resp.json()["data"]["token"]
    assert len(token) > 20
    assert dist_resp.json()["data"]["is_active"] is True

    list_resp = await client.get(f"/api/v1/surveys/{survey_uuid}/distributions/")
    assert list_resp.status_code == 200
    assert len(list_resp.json()["data"]) == 1


async def test_revoke_distribution(client):
    survey_uuid = await _create_active_survey(client)
    dist_resp = await client.post(f"/api/v1/surveys/{survey_uuid}/distributions/")
    dist_id = dist_resp.json()["data"]["id"]

    revoke_resp = await client.request(
        "DELETE", f"/api/v1/surveys/{survey_uuid}/distributions/{dist_id}",
    )
    assert revoke_resp.status_code == 200
    assert revoke_resp.json()["data"]["is_active"] is False


async def test_cannot_distribute_draft_survey(client):
    resp = await client.post("/api/v1/surveys/", json={
        "title": "Draft Survey",
        "performed_by": None,
    })
    survey_uuid = resp.json()["data"]["id"]

    dist_resp = await client.post(f"/api/v1/surveys/{survey_uuid}/distributions/")
    assert dist_resp.status_code == 400
    assert "active" in dist_resp.json()["message"].lower()
