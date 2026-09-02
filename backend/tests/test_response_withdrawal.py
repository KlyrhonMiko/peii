import secrets
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from sqlmodel import select

from core.config import settings
from core.database import get_async_session
from main import app
from models.audit_log import AuditLog
from models.survey_response import SurveyResponse
from services.response_service import hash_withdrawal_code, response_idempotency_hash

pytestmark = pytest.mark.anyio
EXPIRY = (datetime.now(UTC) + timedelta(days=29)).isoformat()
CONSENT = {"accepted": True, "version": "2026-08-25"}


async def _create_response_fixture(client):
    survey_response = await client.post(
        "/api/v1/surveys/", json={"title": f"Withdrawal {uuid4()}"}
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


async def test_withdrawal_is_atomic_sanitized_and_replay_idempotent(client):
    survey, question_id, token = await _create_response_fixture(client)
    code = secrets.token_urlsafe(32)
    key = str(uuid4())
    submitted = await client.post(
        f"/api/v1/survey/{token}/respond",
        json={
            "answers": {question_id: "private answer"},
            "consent": CONSENT,
            "withdrawal_code": code,
        },
        headers={"Idempotency-Key": key},
    )
    assert submitted.status_code == 201

    session, generator = await _session()
    try:
        response = (await session.exec(select(SurveyResponse))).one()
        response_id = response.id
        assert response.withdrawal_credential_digest == hash_withdrawal_code(code)
        assert response.idempotency_hash == response_idempotency_hash(
            {question_id: "private answer"}, "2026-08-25", code
        )
    finally:
        await generator.aclose()

    withdrawn = await client.post(
        "/api/v1/survey/responses/withdraw", json={"withdrawal_code": code}
    )
    replay = await client.post(
        "/api/v1/survey/responses/withdraw", json={"withdrawal_code": code}
    )
    assert withdrawn.status_code == replay.status_code == 200
    assert withdrawn.json()["data"] == replay.json()["data"] == {"withdrawn": True}

    session, generator = await _session()
    try:
        stored = (await session.exec(select(SurveyResponse))).one()
        assert stored.id == response_id
        assert stored.answers == {}
        assert stored.idempotency_key is None
        assert stored.idempotency_hash is None
        assert stored.consent_version is None
        assert stored.consented_at is None
        assert stored.consent_notice_snapshot is None
        assert stored.withdrawal_credential_digest == hash_withdrawal_code(code)
        assert stored.is_deleted is True
        audits = list(
            (
                await session.exec(
                    select(AuditLog).where(AuditLog.action == "withdraw")
                )
            ).all()
        )
        assert len(audits) == 1
        audit = audits[0]
        serialized = str(audit.changes or {})
        assert audit.performed_by == settings.SYSTEM_ACTOR_ID
        assert audit.ip_address is None
        assert str(response_id) not in serialized
        assert code not in serialized
        assert hash_withdrawal_code(code) not in serialized
        assert "answer" not in serialized.lower()
    finally:
        await generator.aclose()

    survey_read = await client.get(f"/api/v1/surveys/{survey['survey_id']}")
    assert survey_read.json()["data"]["responses_count"] == 0


async def test_withdrawal_rejects_malformed_and_unknown_codes_without_oracle(client):
    survey, question_id, token = await _create_response_fixture(client)
    malformed = await client.post(
        "/api/v1/survey/responses/withdraw", json={"withdrawal_code": "too-short"}
    )
    assert malformed.status_code == 422

    unknown_code = secrets.token_urlsafe(32)
    unknown = await client.post(
        "/api/v1/survey/responses/withdraw", json={"withdrawal_code": unknown_code}
    )
    assert unknown.status_code == 404
    assert unknown.json()["message"] == "Response not found or already withdrawn."

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


async def test_admin_erasure_clears_withdrawal_digest(client):
    survey, question_id, token = await _create_response_fixture(client)
    code = secrets.token_urlsafe(32)
    submitted = await client.post(
        f"/api/v1/survey/{token}/respond",
        json={"answers": {question_id: "answer"}, "consent": CONSENT, "withdrawal_code": code},
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert submitted.status_code == 201
    session, generator = await _session()
    try:
        response_id = (await session.exec(select(SurveyResponse))).one().id
    finally:
        await generator.aclose()

    erased = await client.post(
        f"/api/v1/surveys/{survey['id']}/responses/erase",
        json={
            "scope": "selected",
            "response_ids": [str(response_id)],
            "confirmation": "ERASE_SELECTED_RESPONSES",
        },
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert erased.status_code == 200
    session, generator = await _session()
    try:
        response = (await session.exec(select(SurveyResponse))).one()
        assert response.withdrawal_credential_digest is None
    finally:
        await generator.aclose()
