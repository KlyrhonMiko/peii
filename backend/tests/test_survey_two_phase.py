import secrets
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

import pytest
from sqlmodel import select

from core.database import get_async_session
from core.deps import GoogleSurveyRespondent, get_google_survey_respondent
from main import app
from models.audit_log import AuditLog
from models.survey_response import SurveyResponse

pytestmark = pytest.mark.anyio
EXPIRY = (datetime.now(UTC) + timedelta(days=29)).isoformat()
CONSENT = {"accepted": True, "version": "2026-08-25"}


RESPONDENT = GoogleSurveyRespondent(
    auth_user_id=UUID("00000000-0000-0000-0000-000000000101"),
    session_id=UUID("00000000-0000-0000-0000-000000000102"),
    subject_digest="stable-two-phase-subject",
    email="two-phase@example.com",
    display_name="Two Phase Respondent",
    email_verified=True,
)


def _use_stable_respondent() -> None:
    async def override() -> GoogleSurveyRespondent:
        return RESPONDENT

    app.dependency_overrides[get_google_survey_respondent] = override


async def _create_two_phase_survey(client) -> tuple[str, dict[str, str], dict[str, str]]:
    survey_response = await client.post(
        "/api/v1/surveys/", json={"title": f"Two phase {uuid4()}"}
    )
    survey = survey_response.json()["data"]
    phase_sections: dict[int, str] = {}
    for phase in (1, 2):
        section_response = await client.post(
            f"/api/v1/surveys/{survey['id']}/sections/",
            json={"title": f"Phase {phase}"},
        )
        phase_sections[phase] = section_response.json()["data"]["id"]

    phase_questions: dict[int, dict[str, str]] = {1: {}, 2: {}}
    for phase in (1, 2):
        for label in ("first", "second"):
            question_response = await client.post(
                f"/api/v1/surveys/{survey['id']}/questions/",
                json={
                    "question_text": f"Phase {phase} {label}",
                    "question_type": "text",
                    "section_id": phase_sections[phase],
                    "config": {"survey_phase": phase},
                },
            )
            assert question_response.status_code == 201
            phase_questions[phase][label] = question_response.json()["data"]["id"]

    activated = await client.patch(
        f"/api/v1/surveys/{survey['survey_id']}", json={"status": "Active"}
    )
    assert activated.status_code == 200
    return survey["survey_id"], phase_questions[1], phase_questions[2]


def _answers(question_ids: dict[str, str], value: str) -> dict[str, str]:
    return {question_id: f"{value}-{name}" for name, question_id in question_ids.items()}


def _submit_payload(answers: dict[str, str]) -> dict[str, Any]:
    return {
        "answers": answers,
        "consent": CONSENT,
        "withdrawal_code": secrets.token_urlsafe(32),
    }


async def _stored_response() -> SurveyResponse:
    generator = app.dependency_overrides[get_async_session]()
    session = await anext(generator)
    try:
        return (await session.exec(select(SurveyResponse))).one()
    finally:
        await generator.aclose()


async def _response_audit_actions(response_id: UUID) -> set[str]:
    generator = app.dependency_overrides[get_async_session]()
    session = await anext(generator)
    try:
        audits = await session.exec(
            select(AuditLog).where(AuditLog.resource_id == str(response_id))
        )
        return {audit.action for audit in audits.all()}
    finally:
        await generator.aclose()


async def test_two_phase_get_progression_and_withdrawal(client):
    _use_stable_respondent()
    token, phase1, phase2 = await _create_two_phase_survey(client)

    initial = await client.get(f"/api/v1/survey/{token}")
    assert initial.status_code == 200
    assert initial.json()["data"]["collection_state"] == "phase1"
    assert initial.json()["data"]["submission_phase"] == 1
    assert {question["id"] for question in initial.json()["data"]["questions"]} == set(
        phase1.values()
    )

    withdrawal_code = secrets.token_urlsafe(32)
    submitted = await client.post(
        f"/api/v1/survey/{token}/respond",
        json={**_submit_payload(_answers(phase1, "p1")), "withdrawal_code": withdrawal_code},
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert submitted.status_code == 201

    follow_up = await client.get(f"/api/v1/survey/{token}")
    assert follow_up.json()["data"]["collection_state"] == "phase2"
    assert follow_up.json()["data"]["submission_phase"] == 2
    assert {question["id"] for question in follow_up.json()["data"]["questions"]} == set(
        phase2.values()
    )

    completed = await client.patch(
        f"/api/v1/survey/{token}/respond",
        json={"answers": _answers(phase2, "p2")},
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert completed.status_code == 200
    completed_get = await client.get(f"/api/v1/survey/{token}")
    assert completed_get.json()["data"]["collection_state"] == "completed"
    assert completed_get.json()["data"]["submission_phase"] is None
    assert completed_get.json()["data"]["sections"] == []
    assert completed_get.json()["data"]["questions"] == []

    withdrawn = await client.post(
        "/api/v1/survey/responses/withdraw", json={"withdrawal_code": withdrawal_code}
    )
    assert withdrawn.status_code == 200
    withdrawn_get = await client.get(f"/api/v1/survey/{token}")
    assert withdrawn_get.json()["data"]["collection_state"] == "withdrawn"
    assert withdrawn_get.json()["data"]["submission_phase"] is None
    assert withdrawn_get.json()["data"]["sections"] == []

    rejected_follow_up = await client.patch(
        f"/api/v1/survey/{token}/respond",
        json={"answers": _answers(phase2, "p2-retry")},
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert rejected_follow_up.status_code == 409
    assert rejected_follow_up.json()["errors"] == {"code": "withdrawn"}


async def test_two_phase_post_creates_one_row_and_patch_preserves_response_data(client):
    _use_stable_respondent()
    token, phase1, phase2 = await _create_two_phase_survey(client)
    withdrawal_code = secrets.token_urlsafe(32)
    phase1_answers = _answers(phase1, "p1")
    first_key = str(uuid4())
    submitted = await client.post(
        f"/api/v1/survey/{token}/respond",
        json={**_submit_payload(phase1_answers), "withdrawal_code": withdrawal_code},
        headers={"Idempotency-Key": first_key},
    )
    assert submitted.status_code == 201
    before = await _stored_response()
    created_at = before.created_at
    identity = (before.provider, before.auth_user_id, before.respondent_key_digest)
    consent = (before.consent_version, before.consented_at, before.consent_notice_snapshot)

    phase2_answers = _answers(phase2, "p2")
    second_key = str(uuid4())
    patched = await client.patch(
        f"/api/v1/survey/{token}/respond",
        json={"answers": phase2_answers},
        headers={"Idempotency-Key": second_key},
    )
    assert patched.status_code == 200
    after = await _stored_response()
    assert after.answers == {**phase1_answers, **phase2_answers}
    assert after.created_at == created_at
    assert (after.provider, after.auth_user_id, after.respondent_key_digest) == identity
    assert (after.consent_version, after.consented_at, after.consent_notice_snapshot) == consent
    assert after.idempotency_key == UUID(second_key)
    assert after.updated_at >= before.updated_at
    assert {"phase1_submitted", "phase2_submitted"}.issubset(
        await _response_audit_actions(after.id)
    )

    replay = await client.patch(
        f"/api/v1/survey/{token}/respond",
        json={"answers": phase2_answers},
        headers={"Idempotency-Key": second_key},
    )
    conflict = await client.patch(
        f"/api/v1/survey/{token}/respond",
        json={"answers": {**phase2_answers, next(iter(phase2.values())): "changed"}},
        headers={"Idempotency-Key": second_key},
    )
    assert replay.status_code == 200
    assert conflict.status_code == 409
    assert conflict.json()["errors"] == {"code": "idempotency_conflict"}

    survey = (
        await client.get("/api/v1/surveys/?search=Two phase")
    ).json()["data"]
    assert len(survey) == 1
    assert survey[0]["responses_count"] == 1


async def test_two_phase_rejects_cross_phase_ids_and_invalid_states(client):
    _use_stable_respondent()
    token, phase1, phase2 = await _create_two_phase_survey(client)

    before_phase1 = await client.patch(
        f"/api/v1/survey/{token}/respond",
        json={"answers": _answers(phase2, "p2")},
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert before_phase1.status_code == 409

    wrong_post = await client.post(
        f"/api/v1/survey/{token}/respond",
        json=_submit_payload(_answers(phase2, "wrong")),
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert wrong_post.status_code == 422

    submitted = await client.post(
        f"/api/v1/survey/{token}/respond",
        json=_submit_payload(_answers(phase1, "p1")),
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert submitted.status_code == 201
    wrong_patch = await client.patch(
        f"/api/v1/survey/{token}/respond",
        json={"answers": _answers(phase1, "wrong")},
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert wrong_patch.status_code == 422

    completed = await client.patch(
        f"/api/v1/survey/{token}/respond",
        json={"answers": _answers(phase2, "p2")},
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert completed.status_code == 200
    already_completed = await client.patch(
        f"/api/v1/survey/{token}/respond",
        json={"answers": _answers(phase2, "p2-new")},
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert already_completed.status_code == 409


async def test_legacy_survey_keeps_single_phase_get_and_rejects_follow_up(client):
    survey_response = await client.post(
        "/api/v1/surveys/", json={"title": f"Legacy {uuid4()}"}
    )
    survey = survey_response.json()["data"]
    section = await client.post(
        f"/api/v1/surveys/{survey['id']}/sections/", json={"title": "Main"}
    )
    question = await client.post(
        f"/api/v1/surveys/{survey['id']}/questions/",
        json={
            "question_text": "Legacy answer",
            "question_type": "text",
            "section_id": section.json()["data"]["id"],
        },
    )
    await client.patch(
        f"/api/v1/surveys/{survey['survey_id']}", json={"status": "Active"}
    )
    public = await client.get(f"/api/v1/survey/{survey['survey_id']}")
    assert public.status_code == 200
    assert public.json()["data"]["collection_state"] is None
    assert len(public.json()["data"]["questions"]) == 1

    follow_up = await client.patch(
        f"/api/v1/survey/{survey['survey_id']}/respond",
        json={"answers": {question.json()["data"]["id"]: "answer"}},
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert follow_up.status_code == 409
