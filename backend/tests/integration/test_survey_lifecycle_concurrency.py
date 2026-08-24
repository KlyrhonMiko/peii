from __future__ import annotations

import asyncio
import json
from uuid import UUID

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlmodel.ext.asyncio.session import AsyncSession

from schemas.survey import SurveyDelete
from services.response_service import submit_response
from services.survey_service import soft_delete_survey
from tests.integration.fixtures import PostgresTestDatabase, migrate_to

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
                ":survey, :token, NULL, NULL)"
            ),
            {
                "id": str(DISTRIBUTION_ID),
                "survey": str(SURVEY_ID),
                "actor": str(ACTOR_ID),
                "token": TOKEN,
                "ts": timestamp,
            },
        )


@pytest.mark.anyio
async def test_submit_and_archive_linearize_without_deadlock(
    postgres_database: PostgresTestDatabase,
) -> None:
    # The fixture creates an isolated schema at the legacy revision; move this
    # test's schema to the application head before exercising real services.
    migrate_to(postgres_database.url, "20260825_0001")
    _populate_active_survey(postgres_database)

    async_url = postgres_database.url.replace("postgresql+psycopg2://", "postgresql+asyncpg://")
    async_engine = create_async_engine(
        async_url,
        connect_args={"statement_cache_size": 0, "prepared_statement_cache_size": 0},
    )
    sessions = async_sessionmaker(async_engine, class_=AsyncSession, expire_on_commit=False)

    async def submit() -> object:
        async with sessions() as session:
            try:
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
                return await soft_delete_survey(
                    session, "SURV-CONCUR", SurveyDelete(), ACTOR_ID
                )
            except Exception as exc:  # A submit may linearize first; archive must still win.
                return exc

    try:
        submit_result, archive_result = await asyncio.wait_for(
            asyncio.gather(submit(), archive()), timeout=10
        )
    finally:
        await async_engine.dispose()

    assert not isinstance(submit_result, asyncio.TimeoutError)
    assert not isinstance(archive_result, asyncio.TimeoutError)
    assert not isinstance(archive_result, Exception)

    with postgres_database.engine.connect() as connection:
        state = connection.execute(
            text(
                "SELECT is_deleted, status, responses_count FROM surveys "
                "WHERE id = CAST(:id AS uuid)"
            ),
            {"id": str(SURVEY_ID)},
        ).one()
        response_count = connection.execute(
            text("SELECT count(*) FROM survey_responses WHERE survey_id = CAST(:id AS uuid)"),
            {"id": str(SURVEY_ID)},
        ).scalar_one()
        revoked_count = connection.execute(
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
