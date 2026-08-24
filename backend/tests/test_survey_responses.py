import csv
import io
from uuid import UUID, uuid4

import pytest

from core.deps import Principal, get_current_principal
from main import app

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


async def _create_survey_with_question_specs(client, question_specs):
    survey_response = await client.post(
        "/api/v1/surveys/", json={"title": "Response Lifecycle Survey"}
    )
    survey = survey_response.json()["data"]
    section_response = await client.post(
        f"/api/v1/surveys/{survey['id']}/sections/", json={"title": "Main"}
    )
    question_ids = {}
    for name, question in question_specs.items():
        question_response = await client.post(
            f"/api/v1/surveys/{survey['id']}/questions/",
            json={**question, "section_id": section_response.json()["data"]["id"]},
        )
        assert question_response.status_code == 201
        question_ids[name] = question_response.json()["data"]["id"]

    activated = await client.patch(
        f"/api/v1/surveys/{survey['survey_id']}", json={"status": "Active"}
    )
    assert activated.status_code == 200
    distribution = await client.post(
        f"/api/v1/surveys/{survey['id']}/distributions/", json={"expires_at": EXPIRY}
    )
    assert distribution.status_code == 201
    return survey, question_ids, distribution.json()["data"]["token"]


def _override_permissions(*permissions: str) -> None:
    async def override() -> Principal:
        from models.user import User

        return Principal(
            user=User(
                id=UUID("00000000-0000-0000-0000-000000000001"),
                user_id="USER-TESTADMIN",
                auth_user_id=UUID("00000000-0000-0000-0000-000000000002"),
                email="admin@example.com",
                username="admin",
                first_name="Test",
                last_name="Admin",
            ),
            permissions=frozenset(permissions),
            access_token="test",
        )

    app.dependency_overrides[get_current_principal] = override


async def _submit(client, token, question_id, answer, key=None):
    return await client.post(
        f"/api/v1/survey/{token}/respond",
        json={"answers": {question_id: answer}},
        headers={"Idempotency-Key": key or str(uuid4())},
    )


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


async def test_response_routes_require_separate_permissions(client):
    survey, _questions, _token = await _create_survey_with_question_specs(
        client,
        {"text": {"question_text": "Text", "question_type": "text"}},
    )
    _override_permissions("survey_responses.read_aggregates")

    assert (
        await client.get(f"/api/v1/surveys/{survey['id']}/responses/aggregates")
    ).status_code == 200
    assert (
        await client.get(f"/api/v1/surveys/{survey['id']}/responses/")
    ).status_code == 403
    assert (
        await client.get(f"/api/v1/surveys/{survey['id']}/responses/export")
    ).status_code == 403
    assert (
        await client.post(
            f"/api/v1/surveys/{survey['id']}/responses/erase",
            json={
                "scope": "selected",
                "response_ids": [str(uuid4())],
                "confirmation": "ERASE_SELECTED_RESPONSES",
            },
            headers={"Idempotency-Key": str(uuid4())},
        )
    ).status_code == 403


async def test_aggregate_supported_types_are_suppressed_conservatively(client):
    survey, questions, token = await _create_survey_with_question_specs(
        client,
        {
            "choice": {
                "question_text": "Choice",
                "question_type": "single_choice",
                "options": ["A", "B"],
            },
            "free_text": {
                "question_text": "Free text",
                "question_type": "text",
                "is_required": False,
            },
        },
    )
    for _index in range(5):
        response = await _submit(
            client,
            token,
            questions["choice"],
            "A",
        )
        assert response.status_code == 201

    aggregate = await client.get(f"/api/v1/surveys/{survey['id']}/responses/aggregates")
    data = aggregate.json()["data"]
    assert len(data) == 1
    assert data[0]["question_type"] == "single_choice"
    assert data[0]["total"] == 5
    assert {cell["value"] for cell in data[0]["cells"]} == {"A", "B"}
    assert {cell["value"]: cell["count"] for cell in data[0]["cells"]} == {
        "A": 5,
        "B": 0,
    }
    assert "answers" not in data[0]
    assert "Free text" not in str(data)

    suppressed_survey, suppressed_questions, suppressed_token = (
        await _create_survey_with_question_specs(
            client,
            {
                "choice": {
                    "question_text": "Choice",
                    "question_type": "single_choice",
                    "options": ["A", "B"],
                }
            },
        )
    )
    for index in range(5):
        response = await _submit(
            client,
            suppressed_token,
            suppressed_questions["choice"],
            "A" if index < 4 else "B",
        )
        assert response.status_code == 201
    suppressed = await client.get(
        f"/api/v1/surveys/{suppressed_survey['id']}/responses/aggregates"
    )
    assert suppressed.status_code == 200
    assert suppressed.json()["data"] == []


async def test_export_is_long_form_canonical_and_formula_safe(client):
    survey, questions, token = await _create_survey_with_question_specs(
        client,
        {
            "dangerous": {"question_text": " =SUM(A1)", "question_type": "text"},
            "nul": {"question_text": "\x00=SUM(B1)", "question_type": "text"},
        },
    )
    submitted = await client.post(
        f"/api/v1/survey/{token}/respond",
        headers={"Idempotency-Key": str(uuid4())},
        json={
            "answers": {
                questions["dangerous"]: "=2+2",
                questions["nul"]: "safe",
            }
        },
    )
    assert submitted.status_code == 201

    exported = await client.get(f"/api/v1/surveys/{survey['id']}/responses/export")
    assert exported.status_code == 200
    assert exported.headers["pragma"] == "no-cache"
    assert "max-age=0" in exported.headers["cache-control"]
    rows = list(csv.DictReader(io.StringIO(exported.text)))
    assert len(rows) == 2
    assert rows[0]["question_text"] == "' =SUM(A1)"
    assert rows[0]["answer_json"] == '"=2+2"'
    assert "\x00" not in rows[1]["question_text"]
    assert rows[1]["question_text"] == "�=SUM(B1)"

    audit = await client.get(
        "/api/v1/audit-logs/",
        params={
            "resource_type": "survey_response",
            "resource_id": survey["survey_id"],
            "action": "export",
        },
    )
    assert audit.status_code == 200
    assert audit.json()["data"][0]["changes"] == {
        "response_count": 1,
        "answer_row_count": 2,
    }


async def test_selected_erasure_is_atomic_and_idempotent(client):
    survey, questions, token = await _create_survey_with_question_specs(
        client,
        {"text": {"question_text": "Text", "question_type": "text"}},
    )
    response = await _submit(client, token, questions["text"], "answer")
    response_id = response.json()["data"]["id"]
    key = str(uuid4())
    invalid = await client.post(
        f"/api/v1/surveys/{survey['id']}/responses/erase",
        json={
            "scope": "selected",
            "response_ids": [response_id, str(uuid4())],
            "confirmation": "ERASE_SELECTED_RESPONSES",
        },
        headers={"Idempotency-Key": key},
    )
    assert invalid.status_code == 404
    assert (await client.get(f"/api/v1/surveys/{survey['id']}/responses/")).json()["meta"][
        "pagination"
    ]["total"] == 1

    payload = {
        "scope": "selected",
        "response_ids": [response_id],
        "confirmation": "ERASE_SELECTED_RESPONSES",
    }
    erased = await client.post(
        f"/api/v1/surveys/{survey['id']}/responses/erase",
        json=payload,
        headers={"Idempotency-Key": key},
    )
    replay = await client.post(
        f"/api/v1/surveys/{survey['id']}/responses/erase",
        json=payload,
        headers={"Idempotency-Key": key},
    )
    mismatch = await client.post(
        f"/api/v1/surveys/{survey['id']}/responses/erase",
        json={
            "scope": "all",
            "expected_response_count": 0,
            "confirmation": "ERASE_ALL_RESPONSES",
        },
        headers={"Idempotency-Key": key},
    )
    assert erased.status_code == 200
    assert erased.json()["data"]["erased_count"] == 1
    assert replay.status_code == 200
    assert replay.json()["data"] == erased.json()["data"]
    assert mismatch.status_code == 409
    assert (
        await client.get(f"/api/v1/surveys/{survey['id']}/responses/")
    ).json()["meta"]["pagination"]["total"] == 0
    survey_read = await client.get(f"/api/v1/surveys/{survey['survey_id']}")
    assert survey_read.json()["data"]["responses_count"] == 0


async def test_all_erasure_requires_archive_and_restore_does_not_reactivate(client):
    survey, questions, token = await _create_survey_with_question_specs(
        client,
        {"text": {"question_text": "Text", "question_type": "text"}},
    )
    first = await _submit(client, token, questions["text"], "one")
    second = await _submit(client, token, questions["text"], "two")
    assert first.status_code == 201 and second.status_code == 201

    before_archive = await client.post(
        f"/api/v1/surveys/{survey['id']}/responses/erase",
        json={
            "scope": "all",
            "expected_response_count": 2,
            "confirmation": "ERASE_ALL_RESPONSES",
        },
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert before_archive.status_code == 409

    archived = await client.request(
        "DELETE", f"/api/v1/surveys/{survey['survey_id']}", json={}
    )
    assert archived.status_code == 200
    key = str(uuid4())
    payload = {
        "scope": "all",
        "expected_response_count": 2,
        "confirmation": "ERASE_ALL_RESPONSES",
    }
    erased = await client.post(
        f"/api/v1/surveys/{survey['id']}/responses/erase",
        json=payload,
        headers={"Idempotency-Key": key},
    )
    assert erased.status_code == 200
    assert erased.json()["data"]["erased_count"] == 2

    restored = await client.post(f"/api/v1/surveys/{survey['survey_id']}/restore", json={})
    assert restored.status_code == 200
    assert restored.json()["data"]["status"] == "Inactive"
    assert (
        await client.get(f"/api/v1/surveys/{survey['id']}/responses/")
    ).json()["meta"]["pagination"]["total"] == 0
    replay = await client.post(
        f"/api/v1/surveys/{survey['id']}/responses/erase",
        json=payload,
        headers={"Idempotency-Key": key},
    )
    assert replay.status_code == 200
    assert replay.json()["data"]["erased_count"] == 2
