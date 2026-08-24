import pytest

pytestmark = pytest.mark.anyio
EXPIRY = "2099-01-01T00:00:00+00:00"


async def _create_active_survey(client):
    resp = await client.post("/api/v1/surveys/", json={"title": "Distributable Survey"})
    survey = resp.json()["data"]
    section = await client.post(f"/api/v1/surveys/{survey['id']}/sections/", json={"title": "Main"})
    await client.post(
        f"/api/v1/surveys/{survey['id']}/questions/",
        json={
            "question_text": "Status",
            "question_type": "text",
            "section_id": section.json()["data"]["id"],
        },
    )
    activated = await client.patch(
        f"/api/v1/surveys/{survey['survey_id']}", json={"status": "Active"}
    )
    assert activated.status_code == 200
    return survey["id"]


async def test_create_and_list_distributions(client):
    survey_uuid = await _create_active_survey(client)
    dist_resp = await client.post(
        f"/api/v1/surveys/{survey_uuid}/distributions/", json={"expires_at": EXPIRY}
    )
    assert dist_resp.status_code == 201
    assert len(dist_resp.json()["data"]["token"]) > 20
    assert "version_id" not in dist_resp.json()["data"]
    assert "is_legacy" not in dist_resp.json()["data"]
    list_resp = await client.get(f"/api/v1/surveys/{survey_uuid}/distributions/")
    assert list_resp.status_code == 200
    assert list_resp.json()["data"][0]["status"] == "active"
    assert "token" not in list_resp.json()["data"][0]


async def test_revoke_distribution(client):
    survey_uuid = await _create_active_survey(client)
    dist_resp = await client.post(
        f"/api/v1/surveys/{survey_uuid}/distributions/", json={"expires_at": EXPIRY}
    )
    dist_id = dist_resp.json()["data"]["id"]
    revoke_resp = await client.request(
        "DELETE", f"/api/v1/surveys/{survey_uuid}/distributions/{dist_id}"
    )
    assert revoke_resp.status_code == 200
    assert revoke_resp.json()["data"]["is_active"] is False
    assert revoke_resp.json()["data"]["status"] == "revoked"


async def test_cannot_distribute_inactive_survey(client):
    resp = await client.post("/api/v1/surveys/", json={"title": "Inactive Survey"})
    dist_resp = await client.post(
        f"/api/v1/surveys/{resp.json()['data']['id']}/distributions/",
        json={"expires_at": EXPIRY},
    )
    assert dist_resp.status_code == 400
    assert "active" in dist_resp.json()["message"].lower()


async def test_distribution_requires_timezone_aware_future_expiry(client):
    survey_uuid = await _create_active_survey(client)
    missing_timezone = await client.post(
        f"/api/v1/surveys/{survey_uuid}/distributions/",
        json={"expires_at": "2099-01-01T00:00:00"},
    )
    assert missing_timezone.status_code == 422
    expired = await client.post(
        f"/api/v1/surveys/{survey_uuid}/distributions/",
        json={"expires_at": "2020-01-01T00:00:00+00:00"},
    )
    assert expired.status_code == 400


async def test_distribution_suspends_and_reactivates_with_survey_status(client):
    survey_response = await client.post("/api/v1/surveys/", json={"title": "Lifecycle Survey"})
    survey = survey_response.json()["data"]
    survey_uuid = survey["id"]
    survey_business_id = survey["survey_id"]
    section = await client.post(f"/api/v1/surveys/{survey_uuid}/sections/", json={"title": "Main"})
    await client.post(
        f"/api/v1/surveys/{survey_uuid}/questions/",
        json={
            "question_text": "Status",
            "question_type": "text",
            "section_id": section.json()["data"]["id"],
        },
    )
    await client.patch(f"/api/v1/surveys/{survey_business_id}", json={"status": "Active"})
    create_resp = await client.post(
        f"/api/v1/surveys/{survey_uuid}/distributions/", json={"expires_at": EXPIRY}
    )
    distribution_id = create_resp.json()["data"]["id"]
    token = create_resp.json()["data"]["token"]

    await client.patch(f"/api/v1/surveys/{survey_business_id}", json={"status": "Closed"})
    suspended = await client.get(f"/api/v1/surveys/{survey_uuid}/distributions/")
    assert suspended.json()["data"][0]["status"] == "suspended"
    assert (await client.get(f"/api/v1/survey/{token}")).status_code == 404

    await client.patch(f"/api/v1/surveys/{survey_business_id}", json={"status": "Active"})
    active = await client.get(f"/api/v1/surveys/{survey_uuid}/distributions/")
    assert active.json()["data"][0]["status"] == "active"

    rotate = await client.post(
        f"/api/v1/surveys/{survey_uuid}/distributions/{distribution_id}/rotate",
        json={"expires_at": EXPIRY},
    )
    assert rotate.status_code == 201
    assert rotate.json()["data"]["id"] != distribution_id
    assert (await client.get(f"/api/v1/survey/{token}")).status_code == 404
    assert (await client.get(f"/api/v1/survey/{rotate.json()['data']['token']}")).status_code == 200


async def test_archiving_revokes_distributions_and_restore_is_inactive(client):
    survey_uuid = await _create_active_survey(client)
    surveys = (await client.get("/api/v1/surveys/")).json()["data"]
    survey = next(survey for survey in surveys if survey["id"] == survey_uuid)
    created = await client.post(
        f"/api/v1/surveys/{survey_uuid}/distributions/", json={"expires_at": EXPIRY}
    )
    token = created.json()["data"]["token"]

    archived = await client.request("DELETE", f"/api/v1/surveys/{survey['survey_id']}", json={})
    assert archived.status_code == 200
    assert (await client.get(f"/api/v1/survey/{token}")).status_code == 404

    restored = await client.post(f"/api/v1/surveys/{survey['survey_id']}/restore", json={})
    assert restored.status_code == 200
    assert restored.json()["data"]["status"] == "Inactive"

    distributions = await client.get(f"/api/v1/surveys/{survey_uuid}/distributions/")
    assert distributions.json()["data"][0]["status"] == "revoked"
