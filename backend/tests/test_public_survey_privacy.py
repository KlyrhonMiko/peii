import hashlib
import json
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from sqlmodel import col, select

from core.database import get_async_session
from main import app
from models.audit_log import AuditLog
from models.survey import Survey
from models.survey_response import SurveyResponse
from services import survey_consent

pytestmark = pytest.mark.anyio
EXPIRY = (datetime.now(UTC) + timedelta(days=29)).isoformat()
WITHDRAWAL_CODE = "A" * 42 + "B"


async def _create_public_survey(client):
    survey_response = await client.post(
        "/api/v1/surveys/", json={"title": f"Privacy Survey {uuid4()}"}
    )
    survey = survey_response.json()["data"]
    section = await client.post(
        f"/api/v1/surveys/{survey['id']}/sections/", json={"title": "Main"}
    )
    question = await client.post(
        f"/api/v1/surveys/{survey['id']}/questions/",
        json={
            "question_text": "Status",
            "question_type": "text",
            "section_id": section.json()["data"]["id"],
        },
    )
    await client.patch(f"/api/v1/surveys/{survey['survey_id']}", json={"status": "Active"})
    distribution = await client.post(
        f"/api/v1/surveys/{survey['id']}/distributions/",
        json={"expires_at": EXPIRY},
    )
    return distribution.json()["data"]["token"], question.json()["data"]["id"]


def _consent(version: str | None = None, accepted: bool = True) -> dict[str, object]:
    return {
        "accepted": accepted,
        "version": version or survey_consent.get_public_consent_policy().version,
    }


async def _stored_response(response_id: UUID | None = None) -> SurveyResponse:
    session_generator = app.dependency_overrides[get_async_session]()
    session = await anext(session_generator)
    try:
        statement = select(SurveyResponse)
        if response_id is not None:
            statement = statement.where(SurveyResponse.id == response_id)
        statement = statement.order_by(col(SurveyResponse.created_at).desc()).limit(1)
        result = await session.exec(statement)
        return result.one()
    finally:
        await session_generator.aclose()


async def _stored_survey(survey_id: UUID) -> Survey:
    session_generator = app.dependency_overrides[get_async_session]()
    session = await anext(session_generator)
    try:
        result = await session.exec(select(Survey).where(Survey.id == survey_id))
        return result.one()
    finally:
        await session_generator.aclose()


async def test_public_consent_contract_and_evidence_are_server_owned(client):
    token, question_id = await _create_public_survey(client)

    public = await client.get(f"/api/v1/survey/{token}")
    assert public.status_code == 200
    assert public.headers["cache-control"] == "private, no-store, max-age=0"
    assert public.headers["referrer-policy"] == "no-referrer"
    assert public.headers["x-robots-tag"] == "noindex, nofollow, noarchive"
    assert public.headers["x-frame-options"] == "DENY"
    contract = survey_consent.get_public_consent_policy().model_dump(mode="json")
    assert public.json()["data"]["consent"] == contract

    response = await client.post(
        f"/api/v1/survey/{token}/respond",
        json={
            "answers": {question_id: "Employed"},
            "consent": _consent(),
            "withdrawal_code": WITHDRAWAL_CODE,
        },
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert response.status_code == 201
    assert response.json()["data"] == {"accepted": True}

    stored = await _stored_response()
    assert stored.consent_version == contract["version"]
    assert stored.consented_at is not None
    assert stored.consent_notice_snapshot == contract


@pytest.mark.parametrize(
    ("consent", "status"),
    [
        (None, 422),
        ({"accepted": False, "version": "20260825_v1"}, 422),
        ({"accepted": True, "version": "old-version"}, 409),
    ],
)
async def test_public_response_requires_current_accepted_consent(client, consent, status):
    token, question_id = await _create_public_survey(client)
    payload = {
        "answers": {question_id: "Employed"},
        "withdrawal_code": WITHDRAWAL_CODE,
    }
    if consent is not None:
        payload["consent"] = consent

    response = await client.post(
        f"/api/v1/survey/{token}/respond",
        json=payload,
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert response.status_code == status
    if status == 409:
        assert response.json()["errors"] == {"code": "stale_consent"}


async def test_public_response_replay_is_minimal_and_audit_is_private(client):
    token, question_id = await _create_public_survey(client)
    key = str(uuid4())
    payload = {
        "answers": {question_id: "Employed"},
        "consent": _consent(),
        "withdrawal_code": WITHDRAWAL_CODE,
    }
    first = await client.post(
        f"/api/v1/survey/{token}/respond",
        json=payload,
        headers={"Idempotency-Key": key, "X-Request-ID": "token-shaped-caller-id"},
    )
    replay = await client.post(
        f"/api/v1/survey/{token}/respond",
        json=payload,
        headers={"Idempotency-Key": key, "X-Request-ID": "token-shaped-caller-id"},
    )

    assert first.status_code == 201
    assert replay.status_code == 200
    assert replay.json()["data"] == {"accepted": True}

    response_id = (await client.get("/api/v1/audit-logs/?resource_type=survey_response")).json()[
        "data"
    ][-1]["resource_id"]
    session_generator = app.dependency_overrides[get_async_session]()
    session = await anext(session_generator)
    try:
        audits = list(
            (
                await session.exec(
                    select(AuditLog).where(AuditLog.resource_id == response_id)
                )
            ).all()
        )
    finally:
        await session_generator.aclose()

    assert audits
    for audit in audits:
        assert audit.request_id != "token-shaped-caller-id"
        assert audit.ip_address is None
        serialized = str(audit.changes or {}).lower()
        assert "answer" not in serialized
        assert "token" not in serialized
        assert "idempotency" not in serialized
        assert "notice" not in serialized


async def test_legacy_replay_records_consent_without_binding_attacker_code(client):
    token, question_id = await _create_public_survey(client)
    key = str(uuid4())
    answers: dict[str, object] = {question_id: "Employed"}
    attacker_code = "B" * 42 + "C"
    payload = {
        "answers": answers,
        "consent": _consent(),
        "withdrawal_code": WITHDRAWAL_CODE,
    }
    first = await client.post(
        f"/api/v1/survey/{token}/respond", json=payload, headers={"Idempotency-Key": key}
    )
    assert first.status_code == 201
    stored_before = await _stored_response()

    session_generator = app.dependency_overrides[get_async_session]()
    session = await anext(session_generator)
    try:
        legacy_hash = hashlib.sha256(
            json.dumps(payload["answers"], sort_keys=True, separators=(",", ":")).encode()
        ).hexdigest()
        stored_before.idempotency_hash = legacy_hash
        stored_before.consent_version = None
        stored_before.consented_at = None
        stored_before.consent_notice_snapshot = None
        stored_before.withdrawal_credential_digest = None
        session.add(stored_before)
        await session.commit()
    finally:
        await session_generator.aclose()

    replay_payload = {**payload, "withdrawal_code": attacker_code}
    replay = await client.post(
        f"/api/v1/survey/{token}/respond",
        json=replay_payload,
        headers={"Idempotency-Key": key},
    )
    assert replay.status_code == 200
    replay_again = await client.post(
        f"/api/v1/survey/{token}/respond",
        json=replay_payload,
        headers={"Idempotency-Key": key},
    )
    assert replay_again.status_code == 200

    stored_after = await _stored_response(stored_before.id)
    policy = survey_consent.get_public_consent_policy()
    expected_hash = hashlib.sha256(
        json.dumps(answers, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    assert stored_after.idempotency_hash == expected_hash
    assert stored_after.withdrawal_credential_digest is None
    assert stored_after.consent_version == policy.version
    assert stored_after.consented_at is not None
    assert stored_after.consent_notice_snapshot == policy.model_dump(mode="json")

    attacker_withdrawal = await client.post(
        "/api/v1/survey/responses/withdraw", json={"withdrawal_code": attacker_code}
    )
    assert attacker_withdrawal.status_code == 404
    assert attacker_withdrawal.json()["message"] == "Response not found or already withdrawn."

    response_list = await client.get(
        f"/api/v1/surveys/{stored_after.survey_id}/responses/"
    )
    assert response_list.status_code == 200
    assert response_list.json()["meta"]["pagination"]["total"] == 1
    survey = await _stored_survey(stored_after.survey_id)
    assert survey.responses_count == 1

    audits = await client.get(
        "/api/v1/audit-logs/",
        params={
            "resource_type": "survey_response",
            "resource_id": str(stored_after.id),
            "action": "consent_recorded_on_legacy_replay",
        },
    )
    assert audits.status_code == 200
    assert len(audits.json()["data"]) == 1
    audit = audits.json()["data"][0]
    assert audit["ip_address"] is None
    assert audit["changes"] is None


async def test_partial_legacy_consent_evidence_fails_closed_with_safe_code(client):
    token, question_id = await _create_public_survey(client)
    key = str(uuid4())
    payload = {
        "answers": {question_id: "Employed"},
        "consent": _consent(),
        "withdrawal_code": WITHDRAWAL_CODE,
    }
    first = await client.post(
        f"/api/v1/survey/{token}/respond", json=payload, headers={"Idempotency-Key": key}
    )
    assert first.status_code == 201
    stored = await _stored_response()

    session_generator = app.dependency_overrides[get_async_session]()
    session = await anext(session_generator)
    try:
        stored.idempotency_hash = hashlib.sha256(
            json.dumps(payload["answers"], sort_keys=True, separators=(",", ":")).encode()
        ).hexdigest()
        stored.consent_version = None
        session.add(stored)
        await session.commit()
    finally:
        await session_generator.aclose()

    replay = await client.post(
        f"/api/v1/survey/{token}/respond", json=payload, headers={"Idempotency-Key": key}
    )
    assert replay.status_code == 409
    assert replay.json()["errors"] == {"code": "invalid_consent_evidence"}


async def test_complete_consent_evidence_legacy_replay_preserves_legacy_hash(client):
    token, question_id = await _create_public_survey(client)
    key = str(uuid4())
    answers: dict[str, object] = {question_id: "Employed"}
    payload = {
        "answers": answers,
        "consent": _consent(),
        "withdrawal_code": WITHDRAWAL_CODE,
    }
    first = await client.post(
        f"/api/v1/survey/{token}/respond", json=payload, headers={"Idempotency-Key": key}
    )
    assert first.status_code == 201
    stored = await _stored_response()
    response_id = stored.id
    original_withdrawal_digest = stored.withdrawal_credential_digest

    session_generator = app.dependency_overrides[get_async_session]()
    session = await anext(session_generator)
    try:
        legacy_hash = hashlib.sha256(
            json.dumps(payload["answers"], sort_keys=True, separators=(",", ":")).encode()
        ).hexdigest()
        stored.idempotency_hash = legacy_hash
        session.add(stored)
        await session.commit()
    finally:
        await session_generator.aclose()

    replay = await client.post(
        f"/api/v1/survey/{token}/respond", json=payload, headers={"Idempotency-Key": key}
    )
    assert replay.status_code == 200
    preserved = await _stored_response(response_id)
    assert preserved.idempotency_hash == legacy_hash
    assert preserved.withdrawal_credential_digest == original_withdrawal_digest
    assert preserved.consent_version is not None
    assert preserved.consented_at is not None
    assert preserved.consent_notice_snapshot is not None
