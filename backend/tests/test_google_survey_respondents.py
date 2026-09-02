import secrets
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

import httpx
import pytest
from sqlalchemy.exc import IntegrityError
from sqlmodel import select

from core import rate_limit
from core.auth import AuthClaims, verify_bearer_token
from core.config import settings
from core.database import get_async_session
from core.deps import (
    GoogleSurveyRespondent,
    Principal,
    get_current_principal,
    get_google_survey_respondent,
)
from core.exceptions import RateLimitExceeded
from main import app
from models.audit_log import AuditLog
from models.google_survey_auth_proof import GoogleSurveyAuthProof
from models.survey_response import SurveyResponse
from models.user import User
from services import google_survey_auth_service

pytestmark = pytest.mark.anyio

AUTH_USER_ID = UUID("00000000-0000-0000-0000-000000000101")
SESSION_ID = UUID("00000000-0000-0000-0000-000000000102")
GOOGLE_SUBJECT = "google-subject-never-persisted"
CONSENT = {"accepted": True, "version": "2026-08-25"}


class FakeGoogleClient:
    def __init__(
        self,
        *,
        audience: str = settings.GOOGLE_OAUTH_CLIENT_ID,
        subject: str = GOOGLE_SUBJECT,
        email: str = "Respondent@Example.com",
        invalid_tokens: set[str] | None = None,
    ) -> None:
        self.audience = audience
        self.subject = subject
        self.email = email
        self.invalid_tokens = invalid_tokens or set()
        self.calls: list[tuple[str, dict[str, object]]] = []

    async def __aenter__(self) -> FakeGoogleClient:
        return self

    async def __aexit__(self, *_args: object) -> None:
        return None

    async def get(
        self,
        url: str,
        *,
        params: dict[str, str] | None = None,
        headers: dict[str, str] | None = None,
    ) -> httpx.Response:
        self.calls.append((url, {"params": params, "headers": headers}))
        if url == google_survey_auth_service.GOOGLE_TOKENINFO_URL:
            if params is not None and params.get("access_token") in self.invalid_tokens:
                return httpx.Response(401)
            return httpx.Response(200, json={"aud": self.audience})
        if url == google_survey_auth_service.GOOGLE_USERINFO_URL:
            return httpx.Response(
                200,
                json={
                    "sub": self.subject,
                    "email": self.email,
                    "email_verified": True,
                    "name": "  Respondent\nName\x00 ",
                },
            )
        return httpx.Response(
            200,
            json={
                "id": str(AUTH_USER_ID),
                "identities": [
                    {
                        "provider": "google",
                        "identity_data": {"sub": GOOGLE_SUBJECT},
                    }
                ],
            },
        )


def _claims() -> AuthClaims:
    return AuthClaims(
        subject=AUTH_USER_ID,
        access_token="supabase-bearer",
        session_id=SESSION_ID,
        amr=("oauth",),
        is_anonymous=False,
    )


async def _session() -> tuple[Any, Any]:
    generator = app.dependency_overrides[get_async_session]()
    return await anext(generator), generator


async def _create_active_survey(client) -> tuple[dict[str, Any], str, str]:
    survey_response = await client.post(
        "/api/v1/surveys/", json={"title": f"Google identity {uuid4()}"}
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
    distribution = await client.post(
        f"/api/v1/surveys/{survey['id']}/distributions/",
        json={"expires_at": (datetime.now(UTC) + timedelta(days=29)).isoformat()},
    )
    assert distribution.status_code == 201
    return survey, question.json()["data"]["id"], distribution.json()["data"]["token"]


def _respondent(
    *,
    auth_user_id: UUID = AUTH_USER_ID,
    subject_digest: str = "subject-digest",
    email: str = "respondent@example.com",
) -> GoogleSurveyRespondent:
    return GoogleSurveyRespondent(
        auth_user_id=auth_user_id,
        session_id=SESSION_ID,
        subject_digest=subject_digest,
        email=email,
        display_name="Respondent Name",
        email_verified=True,
    )


def _override_respondent(respondent: GoogleSurveyRespondent) -> None:
    async def override() -> GoogleSurveyRespondent:
        return respondent

    app.dependency_overrides[get_google_survey_respondent] = override


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


class FakeUniqueViolation(Exception):
    constraint_name = "google_survey_auth_proofs_pkey"


class FakeOtherIntegrityViolation(Exception):
    constraint_name = "some_other_constraint"


async def _seed_racing_proof(session) -> None:
    authenticated_at = google_survey_auth_service.utc_now()
    session.add(
        GoogleSurveyAuthProof(
            session_id=SESSION_ID,
            auth_user_id=AUTH_USER_ID,
            google_subject_digest=google_survey_auth_service.google_subject_digest(
                GOOGLE_SUBJECT
            ),
            verified_email="respondent@example.com",
            display_name="Respondent Name",
            email_verified=True,
            authenticated_at=authenticated_at,
            expires_at=authenticated_at
            + timedelta(seconds=settings.SURVEY_GOOGLE_SESSION_MAX_AGE_SECONDS),
        )
    )
    await session.commit()


async def test_attestation_requires_three_way_google_supabase_session_binding(
    client, monkeypatch
):
    fake_client = FakeGoogleClient()
    monkeypatch.setattr(
        google_survey_auth_service.httpx,
        "AsyncClient",
        lambda **_kwargs: fake_client,
    )

    async def claims_override() -> AuthClaims:
        return _claims()

    app.dependency_overrides[verify_bearer_token] = claims_override
    response = await client.post(
        "/api/v1/auth/survey/google/attest",
        json={"provider_token": "google-access-token"},
    )

    assert response.status_code == 200
    assert response.json()["data"] == {"attested": True}
    session, generator = await _session()
    try:
        proof = (await session.exec(select(GoogleSurveyAuthProof))).one()
        audit = (await session.exec(select(AuditLog))).one()
    finally:
        await generator.aclose()
    assert proof.session_id == SESSION_ID
    assert proof.auth_user_id == AUTH_USER_ID
    assert proof.google_subject_digest == google_survey_auth_service.google_subject_digest(
        GOOGLE_SUBJECT
    )
    assert GOOGLE_SUBJECT not in proof.google_subject_digest
    assert proof.verified_email == "respondent@example.com"
    assert proof.display_name == "Respondent Name"
    assert proof.email_verified is True
    assert proof.expires_at > proof.authenticated_at
    assert audit.performed_by == settings.SYSTEM_ACTOR_ID
    assert audit.resource_id == (
        google_survey_auth_service.google_session_proof_resource_id(SESSION_ID)
    )
    assert audit.changes == {"attested": True}
    audit_fields = str(
        {
            "action": audit.action,
            "resource_type": audit.resource_type,
            "resource_id": audit.resource_id,
            "performed_by": audit.performed_by,
            "request_id": audit.request_id,
            "changes": audit.changes,
            "ip_address": audit.ip_address,
            "created_at": audit.created_at,
        }
    )
    for sensitive_value in (
        str(AUTH_USER_ID),
        str(SESSION_ID),
        "google-access-token",
        "supabase-bearer",
        GOOGLE_SUBJECT,
        "Respondent@Example.com",
        "respondent@example.com",
    ):
        assert sensitive_value not in audit_fields


async def test_repeated_attestation_reuses_verified_proof_without_audit_write(
    client, monkeypatch
):
    fake_client = FakeGoogleClient()
    monkeypatch.setattr(
        google_survey_auth_service.httpx,
        "AsyncClient",
        lambda **_kwargs: fake_client,
    )

    async def claims_override() -> AuthClaims:
        return _claims()

    app.dependency_overrides[verify_bearer_token] = claims_override
    first = await client.post(
        "/api/v1/auth/survey/google/attest",
        json={"provider_token": "google-access-token"},
    )
    assert first.status_code == 200

    session, generator = await _session()
    try:
        stored = (await session.exec(select(GoogleSurveyAuthProof))).one()
        first_authenticated_at = stored.authenticated_at
    finally:
        await generator.aclose()

    second = await client.post(
        "/api/v1/auth/survey/google/attest",
        json={"provider_token": "google-access-token"},
    )
    assert second.status_code == 200

    session, generator = await _session()
    try:
        stored = (await session.exec(select(GoogleSurveyAuthProof))).one()
        audits = list(
            (
                await session.exec(
                    select(AuditLog).where(
                        AuditLog.resource_type == "google_survey_auth_proof"
                    )
                )
            ).all()
        )
    finally:
        await generator.aclose()

    assert stored.authenticated_at == first_authenticated_at
    assert len(audits) == 1
    # The current provider token is still checked at the Google boundary. The
    # already-proven Supabase session does not need another user lookup.
    assert len(fake_client.calls) == 5


async def test_existing_proof_rejects_verified_token_with_email_mismatch(client, monkeypatch):
    fake_client = FakeGoogleClient()
    monkeypatch.setattr(
        google_survey_auth_service.httpx,
        "AsyncClient",
        lambda **_kwargs: fake_client,
    )

    async def claims_override() -> AuthClaims:
        return _claims()

    app.dependency_overrides[verify_bearer_token] = claims_override
    first = await client.post(
        "/api/v1/auth/survey/google/attest",
        json={"provider_token": "google-access-token"},
    )
    assert first.status_code == 200

    fake_client.email = "another@example.com"
    rejected = await client.post(
        "/api/v1/auth/survey/google/attest",
        json={"provider_token": "google-access-token"},
    )

    assert rejected.status_code == 401
    session, generator = await _session()
    try:
        assert len((await session.exec(select(GoogleSurveyAuthProof))).all()) == 1
        assert len(
            (
                await session.exec(
                    select(AuditLog).where(
                        AuditLog.resource_type == "google_survey_auth_proof"
                    )
                )
            ).all()
        ) == 1
    finally:
        await generator.aclose()


async def test_same_identity_proof_insert_race_reuses_the_winner(
    client, monkeypatch
):
    fake_client = FakeGoogleClient()
    monkeypatch.setattr(
        google_survey_auth_service.httpx,
        "AsyncClient",
        lambda **_kwargs: fake_client,
    )

    async def race_commit(session, _events) -> None:
        await session.rollback()
        await _seed_racing_proof(session)
        raise IntegrityError("duplicate proof", {}, FakeUniqueViolation())

    monkeypatch.setattr(
        google_survey_auth_service,
        "commit_with_audit",
        race_commit,
    )

    session, generator = await _session()
    try:
        proof = await google_survey_auth_service.attest_google_survey_session(
            session, _claims(), "google-access-token"
        )
    finally:
        await generator.aclose()

    assert proof.session_id == SESSION_ID
    assert proof.auth_user_id == AUTH_USER_ID
    assert proof.verified_email == "respondent@example.com"


async def test_unrelated_proof_commit_integrity_error_is_not_swallowed(client, monkeypatch):
    fake_client = FakeGoogleClient()
    monkeypatch.setattr(
        google_survey_auth_service.httpx,
        "AsyncClient",
        lambda **_kwargs: fake_client,
    )

    async def unrelated_failure(session, _events) -> None:
        await session.rollback()
        raise IntegrityError("unrelated constraint", {}, FakeOtherIntegrityViolation())

    monkeypatch.setattr(
        google_survey_auth_service,
        "commit_with_audit",
        unrelated_failure,
    )

    session, generator = await _session()
    try:
        with pytest.raises(IntegrityError, match="unrelated constraint"):
            await google_survey_auth_service.attest_google_survey_session(
                session, _claims(), "google-access-token"
            )
    finally:
        await generator.aclose()


async def test_existing_proof_never_accepts_an_unverified_provider_token(
    client, monkeypatch
):
    fake_client = FakeGoogleClient(invalid_tokens={"attacker-token"})
    monkeypatch.setattr(
        google_survey_auth_service.httpx,
        "AsyncClient",
        lambda **_kwargs: fake_client,
    )

    async def claims_override() -> AuthClaims:
        return _claims()

    app.dependency_overrides[verify_bearer_token] = claims_override
    first = await client.post(
        "/api/v1/auth/survey/google/attest",
        json={"provider_token": "google-access-token"},
    )
    assert first.status_code == 200

    rejected = await client.post(
        "/api/v1/auth/survey/google/attest",
        json={"provider_token": "attacker-token"},
    )

    assert rejected.status_code == 401
    session, generator = await _session()
    try:
        assert len((await session.exec(select(GoogleSurveyAuthProof))).all()) == 1
        assert len(
            (
                await session.exec(
                    select(AuditLog).where(
                        AuditLog.resource_type == "google_survey_auth_proof"
                    )
                )
            ).all()
        ) == 1
    finally:
        await generator.aclose()


async def test_google_attestation_rate_limit_rejects_before_outbound_or_mutation(
    client, monkeypatch
):
    async def claims_override() -> AuthClaims:
        return _claims()

    async def reject_rate_limit(_policy, _identifiers, **_kwargs) -> None:
        raise RateLimitExceeded(23)

    async def fail_if_attested(*_args, **_kwargs):
        raise AssertionError("attestation service must not run after rate limiting")

    app.dependency_overrides[verify_bearer_token] = claims_override
    monkeypatch.setattr(rate_limit, "enforce_rate_limit", reject_rate_limit)
    monkeypatch.setattr(
        google_survey_auth_service,
        "attest_google_survey_session",
        fail_if_attested,
    )

    response = await client.post(
        "/api/v1/auth/survey/google/attest",
        json={"provider_token": "google-access-token"},
    )

    assert response.status_code == 429
    assert response.headers["Retry-After"] == "23"
    session, generator = await _session()
    try:
        assert (await session.exec(select(GoogleSurveyAuthProof))).all() == []
    finally:
        await generator.aclose()


async def test_attestation_rejects_wrong_google_audience_without_persisting_proof(
    client, monkeypatch
):
    fake_client = FakeGoogleClient(audience="another-client")
    monkeypatch.setattr(
        google_survey_auth_service.httpx,
        "AsyncClient",
        lambda **_kwargs: fake_client,
    )

    async def claims_override() -> AuthClaims:
        return _claims()

    app.dependency_overrides[verify_bearer_token] = claims_override
    response = await client.post(
        "/api/v1/auth/survey/google/attest",
        json={"provider_token": "google-access-token"},
    )

    assert response.status_code == 401
    assert response.json()["errors"] == {"code": "google_attestation_failed"}
    session, generator = await _session()
    try:
        assert (await session.exec(select(GoogleSurveyAuthProof))).all() == []
    finally:
        await generator.aclose()


async def test_google_respondent_loads_without_a_local_portal_user(client, monkeypatch):
    fake_client = FakeGoogleClient()
    monkeypatch.setattr(
        google_survey_auth_service.httpx,
        "AsyncClient",
        lambda **_kwargs: fake_client,
    )
    session, generator = await _session()
    try:
        proof = await google_survey_auth_service.attest_google_survey_session(
            session, _claims(), "google-access-token"
        )
    finally:
        await generator.aclose()
    session, generator = await _session()
    try:
        respondent = await google_survey_auth_service.load_valid_google_proof(session, _claims())
    finally:
        await generator.aclose()

    assert proof.auth_user_id == AUTH_USER_ID
    assert respondent.google_subject_digest != GOOGLE_SUBJECT
    assert respondent.verified_email == "respondent@example.com"


async def test_public_survey_routes_reject_missing_bearer(client):
    app.dependency_overrides.pop(get_google_survey_respondent, None)

    response = await client.get("/api/v1/survey/invalid-token")

    assert response.status_code == 401
    assert response.json()["data"] is None
    assert response.json()["meta"]["request_id"]


async def test_portal_principal_rejects_oauth_claims_without_touching_local_users(client):
    app.dependency_overrides.pop(get_current_principal, None)

    async def claims_override() -> AuthClaims:
        return _claims()

    app.dependency_overrides[verify_bearer_token] = claims_override
    response = await client.get("/api/v1/auth/me")

    assert response.status_code == 401
    assert response.json()["message"] == "Authentication is not available for this account."


async def test_google_identity_is_deduplicated_across_distributions_and_replay_is_safe(client):
    _override_respondent(_respondent())
    survey, question_id, token = await _create_active_survey(client)
    idempotency_key = str(uuid4())
    withdrawal_code = secrets.token_urlsafe(32)
    payload = {
        "answers": {question_id: "first"},
        "consent": CONSENT,
        "withdrawal_code": withdrawal_code,
    }
    first = await client.post(
        f"/api/v1/survey/{token}/respond",
        json=payload,
        headers={"Idempotency-Key": idempotency_key},
    )
    assert first.status_code == 201
    replay = await client.post(
        f"/api/v1/survey/{token}/respond",
        json=payload,
        headers={"Idempotency-Key": idempotency_key},
    )
    assert replay.status_code == 200

    distribution = await client.post(
        f"/api/v1/surveys/{survey['id']}/distributions/",
        json={"expires_at": (datetime.now(UTC) + timedelta(days=29)).isoformat()},
    )
    second_token = distribution.json()["data"]["token"]
    duplicate = await client.post(
        f"/api/v1/survey/{second_token}/respond",
        json={
            "answers": {question_id: "second"},
            "consent": CONSENT,
            "withdrawal_code": secrets.token_urlsafe(32),
        },
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert duplicate.status_code == 409
    assert duplicate.json()["errors"] == {"code": "already_submitted"}

    session, generator = await _session()
    try:
        responses = (await session.exec(select(SurveyResponse))).all()
    finally:
        await generator.aclose()
    assert len(responses) == 1
    assert responses[0].provider == "google"
    assert responses[0].auth_user_id == AUTH_USER_ID
    assert responses[0].email == "respondent@example.com"
    assert responses[0].email_verified is True
    assert responses[0].respondent_key_digest is not None


async def test_same_idempotency_key_cannot_be_replayed_by_another_identity(client):
    _override_respondent(_respondent())
    _survey, question_id, token = await _create_active_survey(client)
    key = str(uuid4())
    payload = {
        "answers": {question_id: "answer"},
        "consent": CONSENT,
        "withdrawal_code": secrets.token_urlsafe(32),
    }
    first = await client.post(
        f"/api/v1/survey/{token}/respond", json=payload, headers={"Idempotency-Key": key}
    )
    assert first.status_code == 201

    _override_respondent(
        _respondent(
            auth_user_id=UUID("00000000-0000-0000-0000-000000000103"),
            subject_digest="different-subject-digest",
            email="another@example.com",
        )
    )
    replay = await client.post(
        f"/api/v1/survey/{token}/respond", json=payload, headers={"Idempotency-Key": key}
    )

    assert replay.status_code == 409
    assert replay.json()["errors"] == {"code": "idempotency_conflict"}


async def test_identity_endpoint_requires_both_permissions_and_raw_contract_stays_identity_free(
    client,
):
    _override_respondent(_respondent())
    survey, question_id, token = await _create_active_survey(client)
    submitted = await client.post(
        f"/api/v1/survey/{token}/respond",
        json={
            "answers": {question_id: "private"},
            "consent": CONSENT,
            "withdrawal_code": secrets.token_urlsafe(32),
        },
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert submitted.status_code == 201

    _override_permissions("survey_responses.read_raw")
    denied = await client.get(f"/api/v1/surveys/{survey['id']}/responses/identity")
    assert denied.status_code == 403

    _override_permissions("survey_responses.read_raw", "survey_responses.read_identity")
    raw = await client.get(f"/api/v1/surveys/{survey['id']}/responses/")
    identity = await client.get(f"/api/v1/surveys/{survey['id']}/responses/identity")
    assert raw.status_code == identity.status_code == 200
    assert "email" not in raw.json()["data"][0]
    assert identity.json()["data"][0]["email"] == "respondent@example.com"
    assert identity.json()["data"][0]["provider"] == "google"
    assert identity.json()["data"][0]["identity_available"] is True
    assert "auth_user_id" not in identity.json()["data"][0]
    assert "respondent_key_digest" not in identity.json()["data"][0]


async def test_withdrawal_tombstones_direct_identity_but_keeps_dedupe_digest(
    client,
):
    _override_respondent(_respondent())
    survey, question_id, token = await _create_active_survey(client)
    withdrawal_code = secrets.token_urlsafe(32)
    submitted = await client.post(
        f"/api/v1/survey/{token}/respond",
        json={
            "answers": {question_id: "private"},
            "consent": CONSENT,
            "withdrawal_code": withdrawal_code,
        },
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert submitted.status_code == 201
    session, generator = await _session()
    try:
        digest = (await session.exec(select(SurveyResponse))).one().respondent_key_digest
    finally:
        await generator.aclose()

    withdrawn = await client.post(
        "/api/v1/survey/responses/withdraw", json={"withdrawal_code": withdrawal_code}
    )
    assert withdrawn.status_code == 200
    session, generator = await _session()
    try:
        response = (await session.exec(select(SurveyResponse))).one()
        assert response.provider is None
        assert response.auth_user_id is None
        assert response.email is None
        assert response.display_name is None
        assert response.email_verified is None
        assert response.identity_captured_at is None
        assert response.respondent_key_digest == digest
    finally:
        await generator.aclose()


async def test_administrative_erasure_clears_identity_and_dedupe_digest(client):
    _override_respondent(_respondent())
    survey, question_id, token = await _create_active_survey(client)
    submitted = await client.post(
        f"/api/v1/survey/{token}/respond",
        json={
            "answers": {question_id: "private"},
            "consent": CONSENT,
            "withdrawal_code": secrets.token_urlsafe(32),
        },
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert submitted.status_code == 201
    session, generator = await _session()
    try:
        response_id = (await session.exec(select(SurveyResponse))).one().id
    finally:
        await generator.aclose()

    _override_permissions("survey_responses.erase")
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
        assert response.respondent_key_digest is None
        assert response.email is None
        assert response.provider is None
    finally:
        await generator.aclose()
