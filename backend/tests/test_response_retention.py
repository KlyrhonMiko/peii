import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from sqlmodel import select

from core.database import get_async_session
from main import app
from models.audit_log import AuditLog
from models.google_survey_auth_proof import GoogleSurveyAuthProof
from models.survey import Survey
from models.survey_response import SurveyResponse
from services import response_retention_service

pytestmark = pytest.mark.anyio
EXPIRY = (datetime.now(UTC) + timedelta(days=29)).isoformat()
CONSENT = {"accepted": True, "version": "2026-08-25"}


async def _create_fixture(client, *, retention_enabled: bool = True, retention_days: int = 1825):
    survey_response = await client.post(
        "/api/v1/surveys/",
        json={
            "title": f"Retention {uuid4()}",
            "retention_enabled": retention_enabled,
            "retention_days": retention_days,
        },
    )
    survey = survey_response.json()["data"]
    section = await client.post(
        f"/api/v1/surveys/{survey['id']}/sections/", json={"title": "Main"}
    )
    question = await client.post(
        f"/api/v1/surveys/{survey['id']}/questions/",
        json={
            "question_text": "Answer",
            "question_type": "text",
            "section_id": section.json()["data"]["id"],
        },
    )
    activated = await client.patch(
        f"/api/v1/surveys/{survey['survey_id']}", json={"status": "Active"}
    )
    assert activated.status_code == 200
    return survey, question.json()["data"]["id"], survey["survey_id"]


async def _session():
    generator = app.dependency_overrides[get_async_session]()
    return await anext(generator), generator


async def _submit(client, token: str, question_id: str, answer: str) -> str:
    code = secrets.token_urlsafe(32)
    response = await client.post(
        f"/api/v1/survey/{token}/respond",
        json={
            "answers": {question_id: answer},
            "consent": CONSENT,
            "withdrawal_code": code,
        },
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert response.status_code == 201
    return code


async def test_submission_deadlines_enabled_and_disabled_are_set_once(client):
    enabled_survey, enabled_question, enabled_token = await _create_fixture(
        client, retention_days=2
    )
    before = datetime.now(UTC).replace(tzinfo=None)
    await _submit(client, enabled_token, enabled_question, "enabled")
    after = datetime.now(UTC).replace(tzinfo=None)

    disabled_survey, disabled_question, disabled_token = await _create_fixture(
        client, retention_enabled=False
    )
    await _submit(client, disabled_token, disabled_question, "disabled")

    session, generator = await _session()
    try:
        responses = list((await session.exec(select(SurveyResponse))).all())
        enabled_response = next(
            r for r in responses if r.survey_id == UUID(enabled_survey["id"])
        )
        disabled_response = next(
            r for r in responses if r.survey_id == UUID(disabled_survey["id"])
        )
        assert enabled_response.retention_expires_at is not None
        assert before + timedelta(days=2) <= enabled_response.retention_expires_at
        assert enabled_response.retention_expires_at <= after + timedelta(days=2)
        assert disabled_response.retention_expires_at is None
    finally:
        await generator.aclose()


async def test_retention_policy_is_immutable_after_live_or_tombstoned_response(client):
    survey, question_id, token = await _create_fixture(client, retention_days=3)
    code = await _submit(client, token, question_id, "answer")
    changed = await client.patch(
        f"/api/v1/surveys/{survey['survey_id']}", json={"retention_days": 4}
    )
    assert changed.status_code == 409
    assert changed.json()["errors"] == {"code": "retention_policy_immutable"}

    withdrawn = await client.post(
        "/api/v1/survey/responses/withdraw", json={"withdrawal_code": code}
    )
    assert withdrawn.status_code == 200
    changed_after_tombstone = await client.patch(
        f"/api/v1/surveys/{survey['survey_id']}", json={"retention_enabled": False}
    )
    assert changed_after_tombstone.status_code == 409


async def test_retention_purges_due_rows_in_batches_and_is_idempotent(client):
    survey, question_id, token = await _create_fixture(client, retention_days=1)
    await _submit(client, token, question_id, "due")
    await _submit(client, token, question_id, "future")
    due_cutoff = datetime.now(UTC).replace(tzinfo=None)

    session, generator = await _session()
    try:
        responses = list((await session.exec(select(SurveyResponse))).all())
        due = next(r for r in responses if r.answers[question_id] == "due")
        future = next(r for r in responses if r.answers[question_id] == "future")
        due.retention_expires_at = due_cutoff - timedelta(seconds=1)
        future.retention_expires_at = due_cutoff + timedelta(days=1)
        session.add_all([due, future])
        await session.commit()

        first = await response_retention_service.purge_expired_responses(
            session, cutoff=due_cutoff, batch_size=1
        )
        second = await response_retention_service.purge_expired_responses(
            session, cutoff=due_cutoff, batch_size=1
        )
        assert first.purged_count == 1
        assert first.batch_count == 1
        assert second.purged_count == 0
        assert session.in_transaction() is False

        rows = list((await session.exec(select(SurveyResponse))).all())
        due_after = next(r for r in rows if r.id == due.id)
        future_after = next(r for r in rows if r.id == future.id)
        assert due_after.is_deleted is True
        assert due_after.answers == {}
        assert due_after.withdrawal_credential_digest is None
        assert future_after.is_deleted is False
        assert future_after.answers[question_id] == "future"
        audits = list(
            (
                await session.exec(
                    select(AuditLog).where(AuditLog.action == "retention_purge")
                )
            ).all()
        )
        assert len(audits) == 1
        assert audits[0].resource_id == survey["survey_id"]
        refreshed_survey = (
            await session.exec(select(Survey).where(Survey.id == UUID(survey["id"])))
        ).one()
        assert refreshed_survey.responses_count == 1
    finally:
        await generator.aclose()


async def test_retention_purges_archived_surveys_and_dry_run_does_not_mutate(client):
    survey, question_id, token = await _create_fixture(client, retention_days=1)
    await _submit(client, token, question_id, "archived")
    archived = await client.request(
        "DELETE", f"/api/v1/surveys/{survey['survey_id']}", json={}
    )
    assert archived.status_code == 200

    session, generator = await _session()
    try:
        response = (await session.exec(select(SurveyResponse))).one()
        response_id = response.id
        response.retention_expires_at = datetime(2020, 1, 1)
        session.add(response)
        await session.commit()
        dry_run = await response_retention_service.purge_expired_responses(
            session, cutoff=datetime(2021, 1, 1), dry_run=True
        )
        assert dry_run.purged_count == 1
        stored_before_purge = (
            await session.exec(select(SurveyResponse).where(SurveyResponse.id == response_id))
        ).one()
        assert stored_before_purge.is_deleted is False
        await session.rollback()
        assert session.in_transaction() is False
        result = await response_retention_service.purge_expired_responses(
            session, cutoff=datetime(2021, 1, 1)
        )
        assert result.purged_count == 1
        assert (await session.exec(select(SurveyResponse))).one().is_deleted is True
    finally:
        await generator.aclose()


async def test_retention_purges_expired_google_auth_proofs_with_audit(client):
    _survey, _question_id, _token = await _create_fixture(client, retention_days=1)
    cutoff = datetime(2021, 1, 1)
    expired_session_id = UUID("00000000-0000-0000-0000-000000000201")
    future_session_id = UUID("00000000-0000-0000-0000-000000000202")

    session, generator = await _session()
    try:
        session.add_all(
            [
                GoogleSurveyAuthProof(
                    session_id=expired_session_id,
                    auth_user_id=UUID("00000000-0000-0000-0000-000000000211"),
                    google_subject_digest="expired-subject-digest",
                    verified_email="expired@example.com",
                    email_verified=True,
                    authenticated_at=datetime(2020, 1, 1),
                    expires_at=datetime(2020, 1, 2),
                ),
                GoogleSurveyAuthProof(
                    session_id=future_session_id,
                    auth_user_id=UUID("00000000-0000-0000-0000-000000000212"),
                    google_subject_digest="future-subject-digest",
                    verified_email="future@example.com",
                    email_verified=True,
                    authenticated_at=datetime(2020, 1, 1),
                    expires_at=datetime(2022, 1, 2),
                ),
            ]
        )
        await session.commit()

        result = await response_retention_service.purge_expired_responses(
            session, cutoff=cutoff
        )

        assert result.proof_purged_count == 1
        proofs = list((await session.exec(select(GoogleSurveyAuthProof))).all())
        assert [proof.session_id for proof in proofs] == [future_session_id]
        audits = list(
            (
                await session.exec(
                    select(AuditLog).where(
                        AuditLog.resource_type == "google_survey_auth_proof_retention"
                    )
                )
            ).all()
        )
        assert len(audits) == 1
        assert audits[0].changes == {"purged_count": 1, "cutoff": "2021-01-01 00:00:00"}
    finally:
        await generator.aclose()


async def test_retention_audit_failure_rolls_back_tombstone(client, monkeypatch):
    survey, question_id, token = await _create_fixture(client, retention_days=1)
    await _submit(client, token, question_id, "rollback")
    session, generator = await _session()
    try:
        response = (await session.exec(select(SurveyResponse))).one()
        response.retention_expires_at = datetime(2020, 1, 1)
        session.add(response)
        await session.commit()

        async def fail_after_rollback(_session, _events):
            await _session.rollback()
            raise RuntimeError("audit failure")

        monkeypatch.setattr(response_retention_service, "commit_with_audit", fail_after_rollback)
        with pytest.raises(RuntimeError, match="audit failure"):
            await response_retention_service.purge_expired_responses(
                session, cutoff=datetime(2021, 1, 1)
            )
        stored = (await session.exec(select(SurveyResponse))).one()
        assert stored.is_deleted is False
        assert stored.answers[question_id] == "rollback"
        await session.rollback()
        assert session.in_transaction() is False
    finally:
        await generator.aclose()
