import pytest

pytestmark = pytest.mark.anyio
EXPIRY = "2099-01-01T00:00:00+00:00"


async def _create_active_survey_with_questions(client):
    resp = await client.post("/api/v1/surveys/", json={
        "title": "Response Survey",
        "status": "Active",
        "performed_by": None,
    })
    survey_uuid = resp.json()["data"]["id"]

    # Create a default section first
    sec_resp = await client.post(
        f"/api/v1/surveys/{survey_uuid}/sections/",
        json={"title": "Main Section"},
    )
    section_id = sec_resp.json()["data"]["id"]

    await client.post(f"/api/v1/surveys/{survey_uuid}/questions/", json={
        "question_text": "Employment status?",
        "question_type": "single_choice",
        "options": ["Full-Time", "Part-Time"],
        "section_id": section_id,
    })

    dist_resp = await client.post(
        f"/api/v1/surveys/{survey_uuid}/distributions/",
        json={"expires_at": EXPIRY},
    )
    token = dist_resp.json()["data"]["token"]

    return survey_uuid, token


async def test_get_public_survey_by_token(client):
    _, token = await _create_active_survey_with_questions(client)

    resp = await client.get(f"/api/v1/survey/{token}")
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert "survey_id" in data
    assert data["title"] == "Response Survey"
    assert len(data["questions"]) == 1


async def test_submit_response(client):
    _, token = await _create_active_survey_with_questions(client)

    resp = await client.post(
        f"/api/v1/survey/{token}/respond",
        json={"answers": {"q1": "Full-Time"}},
    )
    assert resp.status_code == 201
    assert resp.json()["data"]["distribution_id"] is not None
    assert "alumni_token" not in resp.json()["data"]


async def test_submit_response_increments_count(client):
    _, token = await _create_active_survey_with_questions(client)

    resp = await client.post(
        f"/api/v1/survey/{token}/respond",
        json={"answers": {"q1": "Part-Time"}},
    )
    assert resp.status_code == 201

    get_resp = await client.get("/api/v1/surveys/?search=Response Survey")
    assert len(get_resp.json()["data"]) == 1
    assert get_resp.json()["data"][0]["responses_count"] == 1


async def test_invalid_token_returns_404(client):
    resp = await client.get("/api/v1/survey/invalid-token-123")
    assert resp.status_code == 404
    body = resp.json()
    assert body["data"] is None
    assert "request_id" in body["meta"]


async def test_revoked_token_rejects_read_and_submit(client):
    survey_uuid, token = await _create_active_survey_with_questions(client)
    distribution = await client.get(f"/api/v1/surveys/{survey_uuid}/distributions/")
    distribution_id = distribution.json()["data"][0]["id"]
    await client.request(
        "DELETE", f"/api/v1/surveys/{survey_uuid}/distributions/{distribution_id}"
    )

    get_response = await client.get(f"/api/v1/survey/{token}")
    post_response = await client.post(
        f"/api/v1/survey/{token}/respond", json={"answers": {"q1": "Full-Time"}}
    )
    assert get_response.status_code == 404
    assert post_response.status_code == 404
    assert post_response.json()["data"] is None


async def test_expired_token_rejects_public_access(client, monkeypatch):
    survey_response = await client.post(
        "/api/v1/surveys/",
        json={"title": "Expired Survey", "status": "Active"},
    )
    survey_uuid = survey_response.json()["data"]["id"]
    distribution_response = await client.post(
        f"/api/v1/surveys/{survey_uuid}/distributions/",
        json={"expires_at": "2099-01-01T00:00:00+00:00"},
    )
    token = distribution_response.json()["data"]["token"]

    from datetime import datetime

    from services import distribution_service

    monkeypatch.setattr(distribution_service, "utc_now", lambda: datetime(2100, 1, 1))

    response = await client.get(f"/api/v1/survey/{token}")
    assert response.status_code == 404
