from uuid import UUID, uuid4

import pytest
from sqlmodel import select

from core.database import get_async_session
from main import app
from models.survey import Survey
from models.survey_distribution import SurveyDistribution

pytestmark = pytest.mark.anyio


async def _create_survey_with_section(client, title: str) -> tuple[str, str, str]:
    survey_response = await client.post(
        "/api/v1/surveys/", json={"title": title, "status": "Inactive"}
    )
    survey = survey_response.json()["data"]
    section_response = await client.post(
        f"/api/v1/surveys/{survey['id']}/sections/", json={"title": "Main"}
    )
    return survey["id"], survey["survey_id"], section_response.json()["data"]["id"]


async def _activate(client, survey_id: str) -> None:
    response = await client.patch(
        f"/api/v1/surveys/{survey_id}", json={"status": "Active"}
    )
    assert response.status_code == 200


async def _create_legacy_active_survey(client, title: str) -> tuple[str, str]:
    override = app.dependency_overrides[get_async_session]
    session_generator = override()
    session = await anext(session_generator)
    try:
        survey = Survey(
            survey_id=f"SURV-{uuid4().hex[:8]}",
            title=title,
            status="Active",
        )
        session.add(survey)
        await session.commit()
        await session.refresh(survey)
        return str(survey.id), survey.survey_id
    finally:
        await session_generator.aclose()


async def test_question_cannot_use_a_section_from_another_survey(client):
    survey_a, _, _ = await _create_survey_with_section(client, "Survey A")
    survey_b, survey_b_business_id, section_b = await _create_survey_with_section(
        client, "Survey B"
    )

    response = await client.post(
        f"/api/v1/surveys/{survey_a}/questions/",
        json={
            "question_text": "Foreign question",
            "question_type": "text",
            "section_id": section_b,
        },
    )

    assert response.status_code == 400
    assert response.json()["data"] is None
    assert (await client.get(f"/api/v1/surveys/{survey_a}/questions/")).json()["data"] == []
    assert (
        await client.get(f"/api/v1/surveys/{survey_b_business_id}")
    ).json()["data"]["questions"] == []


async def test_section_delete_requires_explicit_cascade(client):
    survey_uuid, _, section_id = await _create_survey_with_section(client, "Cascade Survey")
    question = await client.post(
        f"/api/v1/surveys/{survey_uuid}/questions/",
        json={"question_text": "Child", "question_type": "text", "section_id": section_id},
    )
    question_id = question.json()["data"]["id"]

    rejected = await client.request(
        "DELETE", f"/api/v1/surveys/{survey_uuid}/sections/{section_id}"
    )
    assert rejected.status_code == 409

    deleted = await client.request(
        "DELETE",
        f"/api/v1/surveys/{survey_uuid}/sections/{section_id}",
        json={"cascade_questions": True},
    )
    assert deleted.status_code == 200
    assert deleted.json()["data"]["is_deleted"] is True
    questions = await client.get(f"/api/v1/surveys/{survey_uuid}/questions/")
    assert all(item["id"] != question_id for item in questions.json()["data"])


async def test_duplicate_question_reorder_ids_are_rejected(client):
    survey_uuid, _, section_id = await _create_survey_with_section(client, "Order Survey")
    first = await client.post(
        f"/api/v1/surveys/{survey_uuid}/questions/",
        json={"question_text": "First", "question_type": "text", "section_id": section_id},
    )
    first_id = first.json()["data"]["id"]
    response = await client.patch(
        f"/api/v1/surveys/{survey_uuid}/questions/reorder",
        json={"section_id": section_id, "question_ids": [first_id, first_id]},
    )
    assert response.status_code == 422


async def test_structure_replace_rejects_a_stale_updated_at_precondition(client):
    survey_uuid, survey_business_id, _ = await _create_survey_with_section(
        client, "Structure Survey"
    )
    original = (await client.get(f"/api/v1/surveys/{survey_business_id}")).json()["data"]
    response = await client.put(
        f"/api/v1/surveys/{survey_uuid}/structure",
        json={
            "expected_updated_at": original["updated_at"],
            "sections": [
                {
                    "client_id": "local-section",
                    "title": "Employment",
                    "questions": [
                        {
                            "client_id": "local-question",
                            "question_text": "Status",
                            "question_type": "text",
                            "is_required": False,
                        }
                    ],
                }
            ]
        },
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["sections"][0]["questions"][0]["is_required"] is False
    assert data["updated_at"] != original["updated_at"]

    stale = await client.put(
        f"/api/v1/surveys/{survey_uuid}/structure",
        json={
            "expected_updated_at": original["updated_at"],
            "sections": [
                {
                    "client_id": "local-section",
                    "id": data["sections"][0]["id"],
                    "title": "Changed by another editor",
                    "questions": [
                        {
                            "client_id": "local-question",
                            "id": data["sections"][0]["questions"][0]["id"],
                            "question_text": "Status",
                            "question_type": "text",
                            "is_required": False,
                        }
                    ],
                }
            ],
        },
    )
    assert stale.status_code == 409
    assert stale.json()["errors"][0]["code"] == "stale_structure"

    fetched = await client.get(f"/api/v1/surveys/{survey_business_id}")
    assert fetched.json()["data"]["sections"][0]["title"] == "Employment"


async def test_individual_structure_change_invalidates_structure_precondition(client):
    survey_uuid, survey_business_id, section_id = await _create_survey_with_section(
        client, "Concurrent Structure Survey"
    )
    original = (await client.get(f"/api/v1/surveys/{survey_business_id}")).json()["data"]
    question = await client.post(
        f"/api/v1/surveys/{survey_uuid}/questions/",
        json={"question_text": "Status", "question_type": "text", "section_id": section_id},
    )

    stale = await client.put(
        f"/api/v1/surveys/{survey_uuid}/structure",
        json={"expected_updated_at": original["updated_at"], "sections": []},
    )
    assert stale.status_code == 409
    assert stale.json()["errors"][0]["code"] == "stale_structure"
    assert question.status_code == 201


async def test_structure_can_reorder_sections_while_inactive(client):
    survey_uuid, survey_business_id, _ = await _create_survey_with_section(client, "Section Swap")
    second = await client.post(
        f"/api/v1/surveys/{survey_uuid}/sections/", json={"title": "Second"}
    )
    initial = (await client.get(f"/api/v1/surveys/{survey_business_id}")).json()["data"]
    first_section, second_section = initial["sections"]
    swapped = await client.put(
        f"/api/v1/surveys/{survey_uuid}/structure",
        json={
            "expected_updated_at": initial["updated_at"],
            "sections": [
                {
                    "client_id": second_section["id"],
                    "id": second_section["id"],
                    "title": "Second",
                    "questions": [],
                },
                {
                    "client_id": first_section["id"],
                    "id": first_section["id"],
                    "title": "Main",
                    "questions": [],
                },
            ]
        },
    )
    assert swapped.status_code == 200
    sections = swapped.json()["data"]["sections"]
    assert [section["id"] for section in sections] == [second_section["id"], first_section["id"]]
    assert [section["order_index"] for section in sections] == [0, 1]
    assert second.status_code == 201


async def test_structure_edit_requires_inactive_and_zero_responses(client):
    survey_uuid, survey_business_id, section_id = await _create_survey_with_section(
        client, "Locked Structure"
    )
    question = await client.post(
        f"/api/v1/surveys/{survey_uuid}/questions/",
        json={"question_text": "Status", "question_type": "text", "section_id": section_id},
    )
    question_id = question.json()["data"]["id"]
    await _activate(client, survey_business_id)

    blocked = await client.patch(
        f"/api/v1/surveys/{survey_uuid}/questions/{question_id}",
        json={"question_text": "Blocked"},
    )
    assert blocked.status_code == 409

    await client.patch(f"/api/v1/surveys/{survey_business_id}", json={"status": "Inactive"})
    await _activate(client, survey_business_id)
    distribution = await client.post(
        f"/api/v1/surveys/{survey_uuid}/distributions/",
        json={"expires_at": "2099-01-01T00:00:00+00:00"},
    )
    response = await client.post(
        f"/api/v1/survey/{distribution.json()['data']['token']}/respond",
        json={"answers": {question_id: "answer"}},
        headers={"Idempotency-Key": "018f4a1a-7b3b-7d0e-913a-c5f1c5c1c5c2"},
    )
    assert response.status_code == 201
    await client.patch(f"/api/v1/surveys/{survey_business_id}", json={"status": "Inactive"})
    locked = await client.patch(
        f"/api/v1/surveys/{survey_uuid}/questions/{question_id}",
        json={"question_text": "Still locked"},
    )
    assert locked.status_code == 409


async def test_structure_change_revokes_distribution_token(client):
    survey_uuid, survey_business_id, section_id = await _create_survey_with_section(
        client, "Current Structure"
    )
    question = await client.post(
        f"/api/v1/surveys/{survey_uuid}/questions/",
        json={"question_text": "Status", "question_type": "text", "section_id": section_id},
    )
    await _activate(client, survey_business_id)
    distribution = await client.post(
        f"/api/v1/surveys/{survey_uuid}/distributions/",
        json={"expires_at": "2099-01-01T00:00:00+00:00"},
    )
    token = distribution.json()["data"]["token"]
    await client.patch(f"/api/v1/surveys/{survey_business_id}", json={"status": "Inactive"})
    updated = await client.patch(
        f"/api/v1/surveys/{survey_uuid}/questions/{question.json()['data']['id']}",
        json={"question_text": "Changed"},
    )
    assert updated.status_code == 200
    await _activate(client, survey_business_id)
    assert (await client.get(f"/api/v1/survey/{token}")).status_code == 404


async def test_response_rejects_unknown_and_missing_required_questions(client):
    survey_uuid, survey_business_id, section_id = await _create_survey_with_section(
        client, "Response Integrity"
    )
    question = await client.post(
        f"/api/v1/surveys/{survey_uuid}/questions/",
        json={
            "question_text": "Required status",
            "question_type": "single_choice",
            "options": ["Yes", "No"],
            "section_id": section_id,
        },
    )
    question_id = question.json()["data"]["id"]
    await _activate(client, survey_business_id)
    distribution = await client.post(
        f"/api/v1/surveys/{survey_uuid}/distributions/",
        json={"expires_at": "2099-01-01T00:00:00+00:00"},
    )
    token = distribution.json()["data"]["token"]

    unknown = await client.post(
        f"/api/v1/survey/{token}/respond",
        json={"answers": {"00000000-0000-0000-0000-000000000000": "Yes"}},
        headers={"Idempotency-Key": "018f4a1a-7b3b-7d0e-913a-c5f1c5c1c5c2"},
    )
    assert unknown.status_code == 422
    assert unknown.json()["errors"][0]["code"] == "unknown_question"

    missing = await client.post(
        f"/api/v1/survey/{token}/respond",
        json={"answers": {}},
        headers={"Idempotency-Key": "018f4a1a-7b3b-7d0e-913a-c5f1c5c1c5c3"},
    )
    assert missing.status_code == 422
    assert missing.json()["errors"][0]["code"] == "required"

    valid = await client.post(
        f"/api/v1/survey/{token}/respond",
        json={"answers": {question_id: "Yes"}},
        headers={"Idempotency-Key": "018f4a1a-7b3b-7d0e-913a-c5f1c5c1c5c4"},
    )
    assert valid.status_code == 201


async def test_legacy_invalid_active_survey_cannot_be_distributed_or_submitted(client):
    survey_uuid, _ = await _create_legacy_active_survey(client, "Legacy Empty Survey")

    distribution = await client.post(
        f"/api/v1/surveys/{survey_uuid}/distributions/",
        json={"expires_at": "2099-01-01T00:00:00+00:00"},
    )
    assert distribution.status_code == 409
    assert distribution.json()["message"] == "Survey is not ready for distribution."
    assert distribution.json()["errors"][0]["code"] == "no_sections"

    override = app.dependency_overrides[get_async_session]
    session_generator = override()
    session = await anext(session_generator)
    try:
        legacy_distribution = SurveyDistribution(
            survey_id=UUID(survey_uuid),
            token="legacy-empty-survey-token",
        )
        session.add(legacy_distribution)
        await session.commit()
    finally:
        await session_generator.aclose()

    public_survey = await client.get("/api/v1/survey/legacy-empty-survey-token")
    response = await client.post(
        "/api/v1/survey/legacy-empty-survey-token/respond",
        json={"answers": {}},
        headers={"Idempotency-Key": "018f4a1a-7b3b-7d0e-913a-c5f1c5c1c5c2"},
    )
    assert public_survey.status_code == 404
    assert response.status_code == 404

    session_generator = override()
    session = await anext(session_generator)
    try:
        stored = await session.exec(select(Survey).where(Survey.id == UUID(survey_uuid)))
        assert stored.one().responses_count == 0
    finally:
        await session_generator.aclose()


async def test_restore_rejects_legacy_invalid_active_survey(client):
    _, survey_business_id = await _create_legacy_active_survey(client, "Deleted Legacy Survey")

    deleted = await client.request(
        "DELETE", f"/api/v1/surveys/{survey_business_id}", json={}
    )
    assert deleted.status_code == 200

    restored = await client.post(
        f"/api/v1/surveys/{survey_business_id}/restore", json={}
    )
    assert restored.status_code == 409
    body = restored.json()
    assert body["message"] == "Survey is not ready to be activated."
    assert body["errors"][0]["code"] == "no_sections"

    override = app.dependency_overrides[get_async_session]
    session_generator = override()
    session = await anext(session_generator)
    try:
        result = await session.exec(
            select(Survey).where(Survey.survey_id == survey_business_id)
        )
        assert result.one().is_deleted is True
    finally:
        await session_generator.aclose()
