from __future__ import annotations

import asyncio
from uuid import UUID, uuid4

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlmodel.ext.asyncio.session import AsyncSession

from core.auth import AuthClaims
from core.config import settings
from models.google_survey_auth_proof import GoogleSurveyAuthProof
from services import google_survey_auth_service
from tests.integration.fixtures import PostgresTestDatabase

pytestmark = pytest.mark.integration

AUTH_USER_ID = UUID("70000000-0000-0000-0000-000000000001")
SESSION_ID = UUID("70000000-0000-0000-0000-000000000002")
GOOGLE_SUBJECT = "google-concurrent-subject"


def _async_engine(database: PostgresTestDatabase):
    async_url = database.url.set(drivername="postgresql+asyncpg")
    return create_async_engine(
        async_url,
        connect_args={
            "server_settings": {"search_path": database.schema},
            "statement_cache_size": 0,
            "prepared_statement_cache_size": 0,
            "prepared_statement_name_func": lambda: f"__asyncpg_{uuid4()}__",
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


@pytest.mark.anyio
async def test_concurrent_first_attestations_share_one_same_identity_proof_and_audit(
    postgres_database: PostgresTestDatabase,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    google_barrier = asyncio.Barrier(2)
    supabase_barrier = asyncio.Barrier(2)
    commit_barrier = asyncio.Barrier(2)

    async def fetch_google_payloads(_provider_token: str):
        await google_barrier.wait()
        return (
            {"aud": settings.GOOGLE_OAUTH_CLIENT_ID},
            {
                "sub": GOOGLE_SUBJECT,
                "email": "Respondent@Example.com",
                "email_verified": True,
                "name": "Concurrent Respondent",
            },
        )

    async def fetch_supabase_user(_claims: AuthClaims):
        await supabase_barrier.wait()
        return {
            "id": str(AUTH_USER_ID),
            "identities": [
                {"provider": "google", "identity_data": {"sub": GOOGLE_SUBJECT}}
            ],
        }

    original_commit_with_audit = google_survey_auth_service.commit_with_audit

    async def synchronized_commit(session: AsyncSession, events) -> None:
        await commit_barrier.wait()
        await original_commit_with_audit(session, events)

    monkeypatch.setattr(
        google_survey_auth_service, "_fetch_google_payloads", fetch_google_payloads
    )
    monkeypatch.setattr(
        google_survey_auth_service, "_fetch_supabase_user", fetch_supabase_user
    )
    monkeypatch.setattr(
        google_survey_auth_service, "commit_with_audit", synchronized_commit
    )

    async_engine = _async_engine(postgres_database)
    sessions = async_sessionmaker(async_engine, class_=AsyncSession, expire_on_commit=False)

    async def attest() -> GoogleSurveyAuthProof:
        async with sessions() as session:
            return await google_survey_auth_service.attest_google_survey_session(
                session, _claims(), "google-access-token"
            )

    try:
        results = await asyncio.wait_for(asyncio.gather(attest(), attest()), timeout=10)
    finally:
        await async_engine.dispose()

    assert all(result.session_id == SESSION_ID for result in results)
    assert all(result.auth_user_id == AUTH_USER_ID for result in results)
    assert all(result.verified_email == "respondent@example.com" for result in results)

    with postgres_database.engine.connect() as connection:
        proof_rows = connection.execute(
            text(
                "SELECT session_id, auth_user_id, google_subject_digest, verified_email "
                "FROM google_survey_auth_proofs"
            )
        ).all()
        audit_rows = connection.execute(
            text(
                "SELECT action, resource_type, resource_id, changes "
                "FROM audit_logs WHERE resource_type = 'google_survey_auth_proof'"
            )
        ).all()

    assert len(proof_rows) == 1
    assert proof_rows[0].session_id == SESSION_ID
    assert proof_rows[0].auth_user_id == AUTH_USER_ID
    assert proof_rows[0].google_subject_digest == (
        google_survey_auth_service.google_subject_digest(GOOGLE_SUBJECT)
    )
    assert proof_rows[0].verified_email == "respondent@example.com"
    assert len(audit_rows) == 1
    assert audit_rows[0].action == "attest"
    assert audit_rows[0].resource_id == (
        google_survey_auth_service.google_session_proof_resource_id(SESSION_ID)
    )
    assert audit_rows[0].changes == {"attested": True}
