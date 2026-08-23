import pytest

pytestmark = pytest.mark.anyio
EXPIRY = "2099-01-01T00:00:00+00:00"
IDEMPOTENCY_KEY = "018f4a1a-7b3b-7d0e-913a-c5f1c5c1c5c2"


async def _create_active_survey_with_questions(client):
    resp = await client.post(
        "/api/v1/surveys/",
        json={
            "title": "Response Survey",
        },
    )
    survey_uuid = resp.json()["data"]["id"]

    # Create a default section first
    sec_resp = await client.post(
        f"/api/v1/surveys/{survey_uuid}/sections/",
        json={"title": "Main Section"},
    )
    section_id = sec_resp.json()["data"]["id"]

    question_response = await client.post(
        f"/api/v1/surveys/{survey_uuid}/questions/",
        json={
            "question_text": "Employment status?",
            "question_type": "single_choice",
            "options": ["Full-Time", "Part-Time"],
            "section_id": section_id,
        },
    )

    status_response = await client.patch(
        f"/api/v1/surveys/{resp.json()['data']['survey_id']}",
        json={"status": "Active"},
    )
    assert status_response.status_code == 200

    dist_resp = await client.post(
        f"/api/v1/surveys/{survey_uuid}/distributions/",
        json={"expires_at": EXPIRY},
    )
    token = dist_resp.json()["data"]["token"]

    return survey_uuid, token, question_response.json()["data"]["id"]


async def test_get_public_survey_by_token(client):
    _, token, _question_id = await _create_active_survey_with_questions(client)

    resp = await client.get(f"/api/v1/survey/{token}")
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert "survey_id" in data
    assert data["title"] == "Response Survey"
    assert len(data["questions"]) == 1


async def test_submit_response(client):
    _, token, question_id = await _create_active_survey_with_questions(client)

    resp = await client.post(
        f"/api/v1/survey/{token}/respond",
        json={"answers": {question_id: "Full-Time"}},
        headers={"Idempotency-Key": IDEMPOTENCY_KEY},
    )
    assert resp.status_code == 201
    assert resp.json()["data"]["distribution_id"] is not None
    assert "alumni_token" not in resp.json()["data"]
    assert "version_id" not in resp.json()["data"]


async def test_submit_response_requires_idempotency_key(client):
    _, token, question_id = await _create_active_survey_with_questions(client)

    response = await client.post(
        f"/api/v1/survey/{token}/respond",
        json={"answers": {question_id: "Full-Time"}},
    )

    assert response.status_code == 400
    assert "Idempotency-Key" in response.json()["message"]


async def test_submit_response_increments_count(client):
    _, token, question_id = await _create_active_survey_with_questions(client)

    resp = await client.post(
        f"/api/v1/survey/{token}/respond",
        json={"answers": {question_id: "Part-Time"}},
        headers={"Idempotency-Key": IDEMPOTENCY_KEY},
    )
    assert resp.status_code == 201

    get_resp = await client.get("/api/v1/surveys/?search=Response Survey")
    assert len(get_resp.json()["data"]) == 1
    assert get_resp.json()["data"][0]["responses_count"] == 1


async def test_submit_response_is_idempotent(client):
    survey_uuid, token, question_id = await _create_active_survey_with_questions(client)
    key = IDEMPOTENCY_KEY
    payload = {"answers": {question_id: "Part-Time"}}

    first = await client.post(
        f"/api/v1/survey/{token}/respond",
        json=payload,
        headers={"Idempotency-Key": key},
    )
    replay = await client.post(
        f"/api/v1/survey/{token}/respond",
        json=payload,
        headers={"Idempotency-Key": key},
    )
    conflict = await client.post(
        f"/api/v1/survey/{token}/respond",
        json={"answers": {question_id: "Full-Time"}},
        headers={"Idempotency-Key": key},
    )

    assert first.status_code == 201
    assert replay.status_code == 200
    assert replay.json()["data"]["id"] == first.json()["data"]["id"]
    assert conflict.status_code == 409

    get_resp = await client.get("/api/v1/surveys/?search=Response Survey")
    assert get_resp.json()["data"][0]["responses_count"] == 1


async def test_response_validates_each_answer_type(client):
    survey_response = await client.post(
        "/api/v1/surveys/",
        json={"title": "Typed Responses"},
    )
    survey_uuid = survey_response.json()["data"]["id"]
    section_response = await client.post(
        f"/api/v1/surveys/{survey_uuid}/sections/",
        json={"title": "Main"},
    )
    section_id = section_response.json()["data"]["id"]

    questions: dict[str, str] = {}
    question_specs: list[tuple[str, dict[str, object]]] = [
        (
            "multiple_choice",
            {
                "question_text": "Multiple",
                "question_type": "multiple_choice",
                "options": ["A", "B"],
            },
        ),
        (
            "ranking",
            {
                "question_text": "Ranking",
                "question_type": "ranking",
                "options": ["A", "B"],
            },
        ),
        (
            "matrix",
            {
                "question_text": "Matrix",
                "question_type": "matrix",
                "options": ["Row 1"],
                "config": {"columns": ["Yes", "No"]},
            },
        ),
        (
            "scale",
            {
                "question_text": "Scale",
                "question_type": "scale",
                "config": {"min": 1, "max": 5},
            },
        ),
        ("boolean", {"question_text": "Boolean", "question_type": "boolean"}),
    ]
    for question_type, question in question_specs:
        question["section_id"] = section_id
        question["is_required"] = False
        response = await client.post(f"/api/v1/surveys/{survey_uuid}/questions/", json=question)
        assert response.status_code == 201
        questions[question_type] = response.json()["data"]["id"]

    assert (
        await client.patch(
            f"/api/v1/surveys/{survey_response.json()['data']['survey_id']}",
            json={"status": "Active"},
        )
    ).status_code == 200
    distribution = await client.post(
        f"/api/v1/surveys/{survey_uuid}/distributions/",
        json={"expires_at": EXPIRY},
    )
    token = distribution.json()["data"]["token"]
    base_answers: dict[str, object] = {}

    invalid_answers: list[dict[str, object]] = [
        {questions["multiple_choice"]: ["A", "A"]},
        {questions["ranking"]: ["A", "A"]},
        {questions["matrix"]: {"Row 1": "Maybe"}},
        {questions["scale"]: 2.5},
        {questions["boolean"]: "yes"},
    ]
    for invalid in invalid_answers:
        response = await client.post(
            f"/api/v1/survey/{token}/respond",
            json={"answers": {**base_answers, **invalid}},
            headers={"Idempotency-Key": IDEMPOTENCY_KEY},
        )
        assert response.status_code == 422

    valid = await client.post(
        f"/api/v1/survey/{token}/respond",
        json={
            "answers": {
                questions["matrix"]: {"Row 1": "Yes"},
                questions["scale"]: 2,
                questions["boolean"]: True,
            }
        },
        headers={"Idempotency-Key": IDEMPOTENCY_KEY},
    )
    assert valid.status_code == 201


async def test_required_whitespace_answer_is_rejected(client):
    survey_response = await client.post(
        "/api/v1/surveys/",
        json={"title": "Required Text"},
    )
    survey_uuid = survey_response.json()["data"]["id"]
    section_response = await client.post(
        f"/api/v1/surveys/{survey_uuid}/sections/", json={"title": "Main"}
    )
    question = await client.post(
        f"/api/v1/surveys/{survey_uuid}/questions/",
        json={
            "question_text": "Name",
            "question_type": "text",
            "section_id": section_response.json()["data"]["id"],
        },
    )
    question_id = question.json()["data"]["id"]
    assert (
        await client.patch(
            f"/api/v1/surveys/{survey_response.json()['data']['survey_id']}",
            json={"status": "Active"},
        )
    ).status_code == 200
    distribution = await client.post(
        f"/api/v1/surveys/{survey_uuid}/distributions/",
        json={"expires_at": EXPIRY},
    )

    response = await client.post(
        f"/api/v1/survey/{distribution.json()['data']['token']}/respond",
        json={"answers": {question_id: "   "}},
        headers={"Idempotency-Key": IDEMPOTENCY_KEY},
    )
    assert response.status_code == 422


async def test_invalid_token_returns_404(client):
    resp = await client.get("/api/v1/survey/invalid-token-123")
    assert resp.status_code == 404
    body = resp.json()
    assert body["data"] is None
    assert "request_id" in body["meta"]


async def test_revoked_token_rejects_read_and_submit(client):
    survey_uuid, token, question_id = await _create_active_survey_with_questions(client)
    distribution = await client.get(f"/api/v1/surveys/{survey_uuid}/distributions/")
    distribution_id = distribution.json()["data"][0]["id"]
    await client.request("DELETE", f"/api/v1/surveys/{survey_uuid}/distributions/{distribution_id}")

    get_response = await client.get(f"/api/v1/survey/{token}")
    post_response = await client.post(
        f"/api/v1/survey/{token}/respond",
        json={"answers": {question_id: "Full-Time"}},
        headers={"Idempotency-Key": IDEMPOTENCY_KEY},
    )
    assert get_response.status_code == 404
    assert post_response.status_code == 404
    assert post_response.json()["data"] is None


async def test_expired_token_rejects_public_access(client, monkeypatch):
    survey_response = await client.post(
        "/api/v1/surveys/",
        json={"title": "Expired Survey"},
    )
    survey_uuid = survey_response.json()["data"]["id"]
    section_response = await client.post(
        f"/api/v1/surveys/{survey_uuid}/sections/", json={"title": "Main"}
    )
    question_response = await client.post(
        f"/api/v1/surveys/{survey_uuid}/questions/",
        json={
            "question_text": "Status",
            "question_type": "text",
            "section_id": section_response.json()["data"]["id"],
        },
    )
    assert (
        await client.patch(
            f"/api/v1/surveys/{survey_response.json()['data']['survey_id']}",
            json={"status": "Active"},
        )
    ).status_code == 200
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
    submit = await client.post(
        f"/api/v1/survey/{token}/respond",
        json={"answers": {question_response.json()["data"]["id"]: "answer"}},
        headers={"Idempotency-Key": IDEMPOTENCY_KEY},
    )
    assert submit.status_code == 404
