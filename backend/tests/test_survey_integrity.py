import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from sqlmodel import select

from core.database import get_async_session
from core.deps import Principal, get_current_principal
from main import app
from models.survey import Survey
from models.survey_distribution import SurveyDistribution
from models.user import User

pytestmark = pytest.mark.anyio
EXPIRY = (datetime.now(UTC) + timedelta(days=29)).isoformat()
CONSENT = {"accepted": True, "version": "2026-08-25"}
WITHDRAWAL_CODE = "A" * 42 + "B"


def _override_permissions(*permissions: str) -> None:
    async def override() -> Principal:
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
    response = await client.patch(f"/api/v1/surveys/{survey_id}", json={"status": "Active"})
    assert response.status_code == 200


async def _create_invalid_active_survey(client, title: str) -> tuple[str, str]:
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
    assert (await client.get(f"/api/v1/surveys/{survey_b_business_id}")).json()["data"][
        "questions"
    ] == []


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
            ],
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
    assert stale.json()["errors"][0]["code"] == "structure_edit_conflict"

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
    assert stale.json()["errors"][0]["code"] == "structure_edit_conflict"
    assert question.status_code == 201


async def test_structure_can_reorder_sections_while_inactive(client):
    survey_uuid, survey_business_id, _ = await _create_survey_with_section(client, "Section Swap")
    second = await client.post(f"/api/v1/surveys/{survey_uuid}/sections/", json={"title": "Second"})
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
            ],
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
        json={"expires_at": EXPIRY},
    )
    response = await client.post(
        f"/api/v1/survey/{distribution.json()['data']['token']}/respond",
        json={
            "answers": {question_id: "answer"},
            "consent": CONSENT,
            "withdrawal_code": WITHDRAWAL_CODE,
        },
        headers={"Idempotency-Key": "018f4a1a-7b3b-7d0e-913a-c5f1c5c1c5c2"},
    )
    assert response.status_code == 201
    await client.patch(f"/api/v1/surveys/{survey_business_id}", json={"status": "Inactive"})
    locked = await client.patch(
        f"/api/v1/surveys/{survey_uuid}/questions/{question_id}",
        json={"question_text": "Still locked"},
    )
    assert locked.status_code == 409


@pytest.mark.parametrize("response_count", [1, 2, 3, 4])
async def test_manage_only_structure_conflicts_do_not_reveal_response_presence(
    client, response_count: int
):
    zero_uuid, zero_business_id, zero_section_id = await _create_survey_with_section(
        client, f"Zero response conflict {response_count}"
    )
    zero_original = (await client.get(f"/api/v1/surveys/{zero_business_id}")).json()["data"]
    changed = await client.patch(
        f"/api/v1/surveys/{zero_uuid}/sections/{zero_section_id}",
        json={"title": "Changed by another editor"},
    )
    assert changed.status_code == 200

    response_uuid, response_business_id, response_section_id = await _create_survey_with_section(
        client, f"Present response conflict {response_count}"
    )
    question = await client.post(
        f"/api/v1/surveys/{response_uuid}/questions/",
        json={
            "question_text": "Answer",
            "question_type": "text",
            "section_id": response_section_id,
        },
    )
    question_id = question.json()["data"]["id"]
    await _activate(client, response_business_id)
    distribution = await client.post(
        f"/api/v1/surveys/{response_uuid}/distributions/",
        json={"expires_at": EXPIRY},
    )
    token = distribution.json()["data"]["token"]
    for _ in range(response_count):
        submitted = await client.post(
            f"/api/v1/survey/{token}/respond",
            json={
                "answers": {question_id: "answer"},
                "consent": CONSENT,
                "withdrawal_code": secrets.token_urlsafe(32),
            },
            headers={"Idempotency-Key": str(uuid4())},
        )
        assert submitted.status_code == 201
    inactivated = await client.patch(
        f"/api/v1/surveys/{response_business_id}", json={"status": "Inactive"}
    )
    assert inactivated.status_code == 200
    response_current = (await client.get(f"/api/v1/surveys/{response_business_id}")).json()["data"]

    _override_permissions("surveys.manage")
    zero_stale = await client.put(
        f"/api/v1/surveys/{zero_uuid}/structure",
        json={
            "expected_updated_at": zero_original["updated_at"],
            "sections": [
                {
                    "client_id": "zero-section",
                    "id": zero_section_id,
                    "title": "Changed by another editor",
                    "questions": [],
                }
            ],
        },
    )
    response_present = await client.put(
        f"/api/v1/surveys/{response_uuid}/structure",
        json={
            "expected_updated_at": response_current["updated_at"],
            "sections": [
                {
                    "client_id": "response-section",
                    "id": response_section_id,
                    "title": "Main",
                    "questions": [
                        {
                            "client_id": "response-question",
                            "id": question_id,
                            "question_text": "Answer",
                            "question_type": "text",
                            "is_required": True,
                        }
                    ],
                }
            ],
        },
    )

    assert zero_stale.status_code == response_present.status_code == 409
    zero_body = zero_stale.json()
    response_body = response_present.json()
    assert zero_body["meta"].get("request_id")
    assert response_body["meta"].get("request_id")
    zero_body["meta"].pop("request_id", None)
    response_body["meta"].pop("request_id", None)
    assert zero_body == response_body


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
        json={"expires_at": EXPIRY},
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
        json={"expires_at": EXPIRY},
    )
    token = distribution.json()["data"]["token"]

    unknown = await client.post(
        f"/api/v1/survey/{token}/respond",
        json={
            "answers": {"00000000-0000-0000-0000-000000000000": "Yes"},
            "consent": CONSENT,
            "withdrawal_code": secrets.token_urlsafe(32),
        },
        headers={"Idempotency-Key": "018f4a1a-7b3b-7d0e-913a-c5f1c5c1c5c2"},
    )
    assert unknown.status_code == 422
    assert unknown.json()["errors"][0]["code"] == "unknown_question"

    missing = await client.post(
        f"/api/v1/survey/{token}/respond",
        json={"answers": {}, "consent": CONSENT, "withdrawal_code": WITHDRAWAL_CODE},
        headers={"Idempotency-Key": "018f4a1a-7b3b-7d0e-913a-c5f1c5c1c5c3"},
    )
    assert missing.status_code == 422
    assert missing.json()["errors"][0]["code"] == "required"

    valid = await client.post(
        f"/api/v1/survey/{token}/respond",
        json={
            "answers": {question_id: "Yes"},
            "consent": CONSENT,
            "withdrawal_code": WITHDRAWAL_CODE,
        },
        headers={"Idempotency-Key": "018f4a1a-7b3b-7d0e-913a-c5f1c5c1c5c4"},
    )
    assert valid.status_code == 201


async def test_invalid_active_survey_cannot_be_distributed_or_submitted(client):
    survey_uuid, _ = await _create_invalid_active_survey(client, "Empty Active Survey")

    distribution = await client.post(
        f"/api/v1/surveys/{survey_uuid}/distributions/",
        json={"expires_at": EXPIRY},
    )
    assert distribution.status_code == 409
    assert distribution.json()["message"] == "Survey is not ready for distribution."
    assert distribution.json()["errors"][0]["code"] == "no_sections"

    override = app.dependency_overrides[get_async_session]
    session_generator = override()
    session = await anext(session_generator)
    try:
        distribution = SurveyDistribution(
            survey_id=UUID(survey_uuid),
            token="empty-active-survey-token",
            expires_at=datetime(2099, 1, 1),
        )
        session.add(distribution)
        await session.commit()
    finally:
        await session_generator.aclose()

    public_survey = await client.get("/api/v1/survey/empty-active-survey-token")
    response = await client.post(
        "/api/v1/survey/empty-active-survey-token/respond",
        json={"answers": {}, "consent": CONSENT, "withdrawal_code": WITHDRAWAL_CODE},
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


async def test_restore_inactivates_invalid_active_survey(client):
    _, survey_business_id = await _create_invalid_active_survey(client, "Deleted Empty Survey")

    deleted = await client.request("DELETE", f"/api/v1/surveys/{survey_business_id}", json={})
    assert deleted.status_code == 200

    restored = await client.post(f"/api/v1/surveys/{survey_business_id}/restore", json={})
    assert restored.status_code == 200
    assert restored.json()["data"]["status"] == "Inactive"

    override = app.dependency_overrides[get_async_session]
    session_generator = override()
    session = await anext(session_generator)
    try:
        result = await session.exec(select(Survey).where(Survey.survey_id == survey_business_id))
        assert result.one().is_deleted is False
    finally:
        await session_generator.aclose()
