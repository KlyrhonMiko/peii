from __future__ import annotations

import asyncio
import json
from uuid import UUID, uuid4

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from schemas.survey import SurveyDelete
from services import survey_consent
from services.response_service import submit_response
from services.survey_service import soft_delete_survey
from tests.integration.fixtures import PostgresTestDatabase, assert_current_schema

pytestmark = pytest.mark.integration

ACTOR_ID = UUID("30000000-0000-0000-0000-000000000001")
SURVEY_ID = UUID("30000000-0000-0000-0000-000000000002")
SECTION_ID = UUID("30000000-0000-0000-0000-000000000003")
QUESTION_ID = UUID("30000000-0000-0000-0000-000000000004")
DISTRIBUTION_ID = UUID("30000000-0000-0000-0000-000000000005")
TOKEN = "integration-concurrency-token"


def _populate_active_survey(database: PostgresTestDatabase) -> None:
    timestamp = "2026-08-25 00:00:00"
    with database.engine.begin() as connection:
        assert_current_schema(connection, database.schema)
        connection.execute(
            text(
                "INSERT INTO users "
                "(id, created_at, updated_at, is_deleted, deleted_at, performed_by, auth_user_id, "
                "email, username, user_id, first_name, last_name, is_active) "
                "VALUES (:id, :ts, :ts, false, NULL, NULL, NULL, 'actor@example.test', "
                "'actor', 'USER-ACTOR', 'Test', 'Actor', true)"
            ),
            {"id": str(ACTOR_ID), "ts": timestamp},
        )
        connection.execute(
            text(
                "INSERT INTO surveys "
                "(id, created_at, updated_at, is_deleted, deleted_at, performed_by, survey_id, "
                "title, "
                "description, status, target_cohort, responses_count) "
                "VALUES (:id, :ts, :ts, false, NULL, :actor, 'SURV-CONCUR', 'Concurrent survey', "
                "NULL, 'Active', NULL, 0)"
            ),
            {"id": str(SURVEY_ID), "actor": str(ACTOR_ID), "ts": timestamp},
        )
        connection.execute(
            text(
                "INSERT INTO survey_sections "
                "(id, created_at, updated_at, is_deleted, deleted_at, performed_by, survey_id, "
                "title, "
                "description, order_index) VALUES (:id, :ts, :ts, false, NULL, :actor, :survey, "
                "'Section', NULL, 0)"
            ),
            {
                "id": str(SECTION_ID),
                "survey": str(SURVEY_ID),
                "actor": str(ACTOR_ID),
                "ts": timestamp,
            },
        )
        connection.execute(
            text(
                "INSERT INTO survey_questions "
                "(id, created_at, updated_at, is_deleted, deleted_at, performed_by, survey_id, "
                "section_id, "
                "question_text, question_type, options, config, order_index, is_required) "
                "VALUES (:id, :ts, :ts, false, NULL, :actor, :survey, :section, 'Continue?', "
                "'single_choice', :options, NULL, 0, true)"
            ),
            {
                "id": str(QUESTION_ID),
                "survey": str(SURVEY_ID),
                "section": str(SECTION_ID),
                "actor": str(ACTOR_ID),
                "options": json.dumps(["yes", "no"]),
                "ts": timestamp,
            },
        )
        connection.execute(
            text(
                "INSERT INTO survey_distributions "
                "(id, created_at, updated_at, is_deleted, deleted_at, performed_by, survey_id, "
                "token, expires_at, revoked_at) VALUES (:id, :ts, :ts, false, NULL, :actor, "
                ":survey, :token, :expires_at, NULL)"
            ),
            {
                "id": str(DISTRIBUTION_ID),
                "survey": str(SURVEY_ID),
                "actor": str(ACTOR_ID),
                "token": TOKEN,
                "expires_at": "2099-01-01 00:00:00",
                "ts": timestamp,
            },
        )


@pytest.mark.anyio
async def test_submit_and_archive_linearize_without_deadlock(
    postgres_database: PostgresTestDatabase,
) -> None:
    _populate_active_survey(postgres_database)

    async_url = postgres_database.url.set(drivername="postgresql+asyncpg")
    async_engine = create_async_engine(
        async_url,
        connect_args={
            "server_settings": {"search_path": postgres_database.schema},
            "statement_cache_size": 0,
            "prepared_statement_cache_size": 0,
            "prepared_statement_name_func": lambda: f"__asyncpg_{uuid4()}__",
        },
    )
    sessions = async_sessionmaker(async_engine, class_=AsyncSession, expire_on_commit=False)

    async def submit() -> object:
        async with sessions() as session:
            try:
                await _assert_async_current_schema(session, postgres_database.schema)
                response, replayed = await submit_response(
                    session,
                    TOKEN,
                    {str(QUESTION_ID): "yes"},
                    ACTOR_ID,
                )
                return response.id, replayed
            except Exception as exc:  # The archive may linearize first by design.
                return exc

    async def archive() -> object:
        async with sessions() as session:
            try:
                await _assert_async_current_schema(session, postgres_database.schema)
                return await soft_delete_survey(
                    session, "SURV-CONCUR", SurveyDelete(), ACTOR_ID
                )
            except Exception as exc:  # A submit may linearize first; archive must still win.
                return exc

    try:
        async with async_engine.connect() as async_connection:
            result = await async_connection.execute(text("SELECT current_schema()"))
            assert result.scalar_one_or_none() == postgres_database.schema
        submit_result, archive_result = await asyncio.wait_for(
            asyncio.gather(submit(), archive()), timeout=10
        )
    finally:
        await async_engine.dispose()

    assert not isinstance(submit_result, asyncio.TimeoutError)
    assert not isinstance(archive_result, asyncio.TimeoutError)
    assert not isinstance(archive_result, Exception)

    with postgres_database.engine.connect() as sync_connection:
        assert_current_schema(sync_connection, postgres_database.schema)
        state = sync_connection.execute(
            text(
                "SELECT is_deleted, status, responses_count FROM surveys "
                "WHERE id = CAST(:id AS uuid)"
            ),
            {"id": str(SURVEY_ID)},
        ).one()
        response_count = sync_connection.execute(
            text("SELECT count(*) FROM survey_responses WHERE survey_id = CAST(:id AS uuid)"),
            {"id": str(SURVEY_ID)},
        ).scalar_one()
        revoked_count = sync_connection.execute(
            text(
                "SELECT count(*) FROM survey_distributions "
                "WHERE id = CAST(:id AS uuid) AND revoked_at IS NOT NULL"
            ),
            {"id": str(DISTRIBUTION_ID)},
        ).scalar_one()

    assert state.is_deleted is True
    assert state.status == "Active"
    assert state.responses_count == response_count
    assert revoked_count == 1
    assert response_count in {0, 1}
    if response_count == 1:
        assert not isinstance(submit_result, Exception)
    else:
        assert isinstance(submit_result, Exception)


async def _assert_async_current_schema(session: AsyncSession, expected_schema: str) -> None:
    result = await session.exec(select(text("current_schema()")))
    assert result.one() == expected_schema


@pytest.mark.anyio
async def test_concurrent_idempotent_submissions_persist_one_response_and_audit_pair(
    postgres_database: PostgresTestDatabase,
) -> None:
    _populate_active_survey(postgres_database)
    consent_policy = survey_consent.get_public_consent_policy()
    idempotency_key = uuid4()
    answers: dict[str, object] = {str(QUESTION_ID): "yes"}

    async_url = postgres_database.url.set(drivername="postgresql+asyncpg")
    async_engine = create_async_engine(
        async_url,
        connect_args={
            "server_settings": {"search_path": postgres_database.schema},
            "statement_cache_size": 0,
            "prepared_statement_cache_size": 0,
            "prepared_statement_name_func": lambda: f"__asyncpg_{uuid4()}__",
        },
    )
    sessions = async_sessionmaker(async_engine, class_=AsyncSession, expire_on_commit=False)

    async def submit() -> tuple[UUID, bool]:
        async with sessions() as session:
            await _assert_async_current_schema(session, postgres_database.schema)
            response, replayed = await submit_response(
                session,
                TOKEN,
                answers,
                ACTOR_ID,
                idempotency_key=idempotency_key,
            )
            return response.id, replayed

    try:
        results = await asyncio.wait_for(
            asyncio.gather(submit(), submit()),
            timeout=10,
        )
    finally:
        await async_engine.dispose()

    response_ids = {response_id for response_id, _replayed in results}
    assert len(response_ids) == 1
    assert sorted(replayed for _response_id, replayed in results) == [False, True]
    response_id = response_ids.pop()

    with postgres_database.engine.connect() as connection:
        assert_current_schema(connection, postgres_database.schema)
        survey_state = connection.execute(
            text(
                "SELECT responses_count FROM surveys "
                "WHERE id = CAST(:id AS uuid)"
            ),
            {"id": str(SURVEY_ID)},
        ).scalar_one()
        response_rows = connection.execute(
            text(
                "SELECT id, consent_version, consent_notice_snapshot "
                "FROM survey_responses WHERE survey_id = CAST(:id AS uuid)"
            ),
            {"id": str(SURVEY_ID)},
        ).mappings().all()
        audit_rows = connection.execute(
            text(
                "SELECT action, resource_type, resource_id, changes, ip_address "
                "FROM audit_logs WHERE "
                "(resource_type = 'survey_response' AND action = 'create') OR "
                "(resource_type = 'survey' AND action = 'response_submitted')"
            )
        ).mappings().all()

    assert survey_state == 1
    assert len(response_rows) == 1
    assert str(response_rows[0]["id"]) == str(response_id)
    assert response_rows[0]["consent_version"] == consent_policy.version
    assert response_rows[0]["consent_notice_snapshot"] == consent_policy.model_dump(mode="json")

    assert len(audit_rows) == 2
    audits_by_kind = {
        (row["resource_type"], row["action"]): row for row in audit_rows
    }
    assert set(audits_by_kind) == {
        ("survey_response", "create"),
        ("survey", "response_submitted"),
    }
    assert audits_by_kind[("survey_response", "create")]["resource_id"] == str(response_id)
    assert audits_by_kind[("survey_response", "create")]["changes"] == {
        "distribution_id": str(DISTRIBUTION_ID)
    }
    assert audits_by_kind[("survey", "response_submitted")]["resource_id"] == "SURV-CONCUR"
    assert audits_by_kind[("survey", "response_submitted")]["changes"] == {
        "response_id": str(response_id)
    }
    assert all(row["ip_address"] is None for row in audit_rows)
