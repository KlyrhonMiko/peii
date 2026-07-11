import pytest

pytestmark = pytest.mark.anyio


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

    dist_resp = await client.post(f"/api/v1/surveys/{survey_uuid}/distributions/")
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
    assert resp.json()["data"]["alumni_token"] == token


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
