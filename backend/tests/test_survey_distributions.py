import pytest

pytestmark = pytest.mark.anyio
EXPIRY = "2099-01-01T00:00:00+00:00"


async def _create_active_survey(client):
    resp = await client.post("/api/v1/surveys/", json={
        "title": "Distributable Survey",
        "status": "Active",
        "performed_by": None,
    })
    survey_uuid = resp.json()["data"]["id"]
    section = await client.post(
        f"/api/v1/surveys/{survey_uuid}/sections/", json={"title": "Main"}
    )
    await client.post(
        f"/api/v1/surveys/{survey_uuid}/questions/",
        json={
            "question_text": "Status",
            "question_type": "text",
            "section_id": section.json()["data"]["id"],
        },
    )
    published = await client.post(f"/api/v1/surveys/{survey_uuid}/publish")
    assert published.status_code == 200
    return survey_uuid


async def _create_active_survey_without_publishing(client):
    resp = await client.post(
        "/api/v1/surveys/",
        json={"title": "Unpublished Survey", "status": "Active"},
    )
    return resp.json()["data"]["id"]


async def test_create_and_list_distributions(client):
    survey_uuid = await _create_active_survey(client)

    dist_resp = await client.post(
        f"/api/v1/surveys/{survey_uuid}/distributions/",
        json={"expires_at": EXPIRY},
    )
    assert dist_resp.status_code == 201
    token = dist_resp.json()["data"]["token"]
    assert len(token) > 20
    assert dist_resp.json()["data"]["is_active"] is True

    list_resp = await client.get(f"/api/v1/surveys/{survey_uuid}/distributions/")
    assert list_resp.status_code == 200
    assert len(list_resp.json()["data"]) == 1
    assert list_resp.json()["data"][0]["status"] == "active"
    assert list_resp.json()["data"][0]["is_legacy"] is False


async def test_revoke_distribution(client):
    survey_uuid = await _create_active_survey(client)
    dist_resp = await client.post(
        f"/api/v1/surveys/{survey_uuid}/distributions/",
        json={"expires_at": EXPIRY},
    )
    dist_id = dist_resp.json()["data"]["id"]

    revoke_resp = await client.request(
        "DELETE", f"/api/v1/surveys/{survey_uuid}/distributions/{dist_id}",
    )
    assert revoke_resp.status_code == 200
    assert revoke_resp.json()["data"]["is_active"] is False
    assert revoke_resp.json()["data"]["status"] == "revoked"

    repeated_resp = await client.request(
        "DELETE", f"/api/v1/surveys/{survey_uuid}/distributions/{dist_id}"
    )
    assert repeated_resp.status_code == 200
    assert repeated_resp.json()["data"]["status"] == "revoked"


async def test_cannot_distribute_draft_survey(client):
    resp = await client.post("/api/v1/surveys/", json={
        "title": "Draft Survey",
        "performed_by": None,
    })
    survey_uuid = resp.json()["data"]["id"]

    dist_resp = await client.post(
        f"/api/v1/surveys/{survey_uuid}/distributions/",
        json={"expires_at": EXPIRY},
    )
    assert dist_resp.status_code == 400
    assert "active" in dist_resp.json()["message"].lower()


async def test_cannot_distribute_unpublished_draft(client):
    survey_uuid = await _create_active_survey_without_publishing(client)

    dist_resp = await client.post(
        f"/api/v1/surveys/{survey_uuid}/distributions/",
        json={"expires_at": EXPIRY},
    )
    assert dist_resp.status_code == 409
    assert "publish" in dist_resp.json()["message"].lower()


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
    survey_response = await client.post(
        "/api/v1/surveys/",
        json={"title": "Lifecycle Survey", "status": "Active"},
    )
    survey_data = survey_response.json()["data"]
    survey_uuid = survey_data["id"]
    survey_business_id = survey_data["survey_id"]
    section = await client.post(
        f"/api/v1/surveys/{survey_uuid}/sections/", json={"title": "Main"}
    )
    await client.post(
        f"/api/v1/surveys/{survey_uuid}/questions/",
        json={
            "question_text": "Status",
            "question_type": "text",
            "section_id": section.json()["data"]["id"],
        },
    )
    assert (await client.post(f"/api/v1/surveys/{survey_uuid}/publish")).status_code == 200
    create_resp = await client.post(
        f"/api/v1/surveys/{survey_uuid}/distributions/",
        json={"expires_at": EXPIRY},
    )
    distribution_id = create_resp.json()["data"]["id"]
    token = create_resp.json()["data"]["token"]

    await client.patch(f"/api/v1/surveys/{survey_business_id}", json={"status": "Closed"})
    suspended = await client.get(f"/api/v1/surveys/{survey_uuid}/distributions/")
    assert suspended.json()["data"][0]["status"] == "suspended"
    assert suspended.json()["data"][0]["is_active"] is False
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
    assert rotate.json()["data"]["status"] == "active"
    assert (await client.get(f"/api/v1/survey/{token}")).status_code == 404
    assert (
        await client.get(f"/api/v1/survey/{rotate.json()['data']['token']}")
    ).status_code == 200
