from __future__ import annotations

import asyncio
import json
from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from models.audit_log import AuditLog
from models.survey import Survey
from models.survey_response import SurveyResponse
from services import response_retention_service, survey_analytics_service
from tests.integration.fixtures import PostgresTestDatabase

pytestmark = pytest.mark.integration

ACTOR_ID = UUID("40000000-0000-0000-0000-000000000001")
ANALYTICS_SURVEY_ID = UUID("40000000-0000-0000-0000-000000000002")
ANALYTICS_SECTION_ID = UUID("40000000-0000-0000-0000-000000000003")
ANALYTICS_SCALAR_ID = UUID("40000000-0000-0000-0000-000000000004")
ANALYTICS_ARRAY_ID = UUID("40000000-0000-0000-0000-000000000005")
ANALYTICS_MATRIX_ID = UUID("40000000-0000-0000-0000-000000000006")
RETENTION_SURVEY_ID = UUID("40000000-0000-0000-0000-000000000007")
RETENTION_DISTRIBUTION_ID = UUID("40000000-0000-0000-0000-000000000008")
RETENTION_RESPONSE_ID = UUID("40000000-0000-0000-0000-000000000009")
RETENTION_IDEMPOTENCY_KEY = UUID("40000000-0000-0000-0000-000000000010")
RETENTION_CUTOFF = datetime(2026, 8, 27)


def _async_engine(database: PostgresTestDatabase) -> AsyncEngine:
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


def _seed_analytics_fixture(database: PostgresTestDatabase) -> None:
    timestamp = "2026-08-25 00:00:00"
    scalar_id = str(ANALYTICS_SCALAR_ID)
    array_id = str(ANALYTICS_ARRAY_ID)
    matrix_id = str(ANALYTICS_MATRIX_ID)

    with database.engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO surveys "
                "(id, created_at, updated_at, is_deleted, deleted_at, performed_by, survey_id, "
                "title, description, status, target_cohort, responses_count, retention_enabled, "
                "retention_days) VALUES (:id, :ts, :ts, false, NULL, :actor, 'SURV-ANALYTICS', "
                "'PostgreSQL analytics', NULL, 'Closed', NULL, 4, true, 1825)"
            ),
            {"id": str(ANALYTICS_SURVEY_ID), "actor": str(ACTOR_ID), "ts": timestamp},
        )
        connection.execute(
            text(
                "INSERT INTO survey_sections "
                "(id, created_at, updated_at, is_deleted, deleted_at, performed_by, survey_id, "
                "title, description, order_index) VALUES (:id, :ts, :ts, false, NULL, :actor, "
                ":survey, 'Main', NULL, 0)"
            ),
            {
                "id": str(ANALYTICS_SECTION_ID),
                "survey": str(ANALYTICS_SURVEY_ID),
                "actor": str(ACTOR_ID),
                "ts": timestamp,
            },
        )
        questions = [
            (
                ANALYTICS_SCALAR_ID,
                "Scalar",
                "single_choice",
                json.dumps(["A", "B"]),
                None,
            ),
            (
                ANALYTICS_ARRAY_ID,
                "Array",
                "multiple_choice",
                json.dumps(["A", "B"]),
                None,
            ),
            (
                ANALYTICS_MATRIX_ID,
                "Matrix",
                "matrix",
                json.dumps(["Row 1", "Row 2"]),
                json.dumps({"columns": ["Yes", "No"]}),
            ),
        ]
        connection.execute(
            text(
                "INSERT INTO survey_questions "
                "(id, created_at, updated_at, is_deleted, deleted_at, performed_by, survey_id, "
                "section_id, question_text, question_type, options, config, order_index, "
                "is_required) VALUES (:id, :ts, :ts, false, NULL, :actor, :survey, :section, "
                ":question_text, :question_type, :options, :config, :order_index, true)"
            ),
            [
                {
                    "id": str(question_id),
                    "ts": timestamp,
                    "actor": str(ACTOR_ID),
                    "survey": str(ANALYTICS_SURVEY_ID),
                    "section": str(ANALYTICS_SECTION_ID),
                    "question_text": question_text,
                    "question_type": question_type,
                    "options": options,
                    "config": config,
                    "order_index": order_index,
                }
                for order_index, (
                    question_id,
                    question_text,
                    question_type,
                    options,
                    config,
                ) in enumerate(questions)
            ],
        )
        answers = {
            scalar_id: "A",
            array_id: ["A", "B"],
            matrix_id: {"Row 1": "Yes", "Row 2": "Yes"},
        }
        connection.execute(
            text(
                "INSERT INTO survey_responses "
                "(id, created_at, updated_at, is_deleted, deleted_at, performed_by, survey_id, "
                "distribution_id, idempotency_key, idempotency_hash, consent_version, "
                "consented_at, retention_expires_at, withdrawal_credential_digest, "
                "consent_notice_snapshot, answers) VALUES "
                "(:id, :ts, :ts, false, NULL, :actor, :survey, NULL, NULL, NULL, NULL, NULL, "
                ":expires_at, NULL, NULL, CAST(:answers AS jsonb))"
            ),
            [
                {
                    "id": str(UUID(f"40000000-0000-0000-0000-{index:012d}")),
                    "ts": timestamp,
                    "actor": str(ACTOR_ID),
                    "survey": str(ANALYTICS_SURVEY_ID),
                    "expires_at": "2099-01-01 00:00:00",
                    "answers": json.dumps(answers),
                }
                for index in range(11, 15)
            ],
        )


def _seed_retention_fixture(database: PostgresTestDatabase) -> None:
    timestamp = "2026-08-25 00:00:00"
    with database.engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO surveys "
                "(id, created_at, updated_at, is_deleted, deleted_at, performed_by, survey_id, "
                "title, description, status, target_cohort, responses_count, retention_enabled, "
                "retention_days) VALUES (:id, :ts, :ts, false, NULL, :actor, 'SURV-RETENTION', "
                "'Concurrent retention', NULL, 'Closed', NULL, 1, true, 1)"
            ),
            {"id": str(RETENTION_SURVEY_ID), "actor": str(ACTOR_ID), "ts": timestamp},
        )
        connection.execute(
            text(
                "INSERT INTO survey_distributions "
                "(id, created_at, updated_at, is_deleted, deleted_at, performed_by, survey_id, "
                "token, token_digest, token_prefix, expires_at, revoked_at) VALUES "
                "(:id, :ts, :ts, false, NULL, :actor, :survey, 'retention-token', :digest, "
                "'retentio', '2099-01-01 00:00:00', NULL)"
            ),
            {
                "id": str(RETENTION_DISTRIBUTION_ID),
                "ts": timestamp,
                "actor": str(ACTOR_ID),
                "survey": str(RETENTION_SURVEY_ID),
                "digest": "a" * 64,
            },
        )
        connection.execute(
            text(
                "INSERT INTO survey_responses "
                "(id, created_at, updated_at, is_deleted, deleted_at, performed_by, survey_id, "
                "distribution_id, idempotency_key, idempotency_hash, consent_version, "
                "consented_at, retention_expires_at, withdrawal_credential_digest, "
                "consent_notice_snapshot, answers) VALUES "
                "(:id, :ts, :ts, false, NULL, :actor, :survey, :distribution, :idempotency, "
                ":idempotency_hash, '2026-08-25', :consented_at, :expires_at, :withdrawal_digest, "
                "CAST(:snapshot AS jsonb), CAST(:answers AS jsonb))"
            ),
            {
                "id": str(RETENTION_RESPONSE_ID),
                "ts": timestamp,
                "actor": str(ACTOR_ID),
                "survey": str(RETENTION_SURVEY_ID),
                "distribution": str(RETENTION_DISTRIBUTION_ID),
                "idempotency": str(RETENTION_IDEMPOTENCY_KEY),
                "idempotency_hash": "b" * 64,
                "consented_at": timestamp,
                "expires_at": "2026-08-26 00:00:00",
                "withdrawal_digest": "c" * 64,
                "snapshot": json.dumps({"accepted": True, "version": "2026-08-25"}),
                "answers": json.dumps({"private-question": "private answer"}),
            },
        )


@pytest.mark.anyio
async def test_postgresql_jsonb_analytics_matches_reference_behavior(
    postgres_database: PostgresTestDatabase,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _seed_analytics_fixture(postgres_database)
    async_engine = _async_engine(postgres_database)
    sessions = async_sessionmaker(async_engine, class_=AsyncSession, expire_on_commit=False)
    postgres_calls = 0
    original_postgres_aggregate = survey_analytics_service._aggregate_postgres

    async def spy_postgres_aggregate(
        session: AsyncSession, survey_id: UUID, states: dict[str, Any]
    ) -> None:
        nonlocal postgres_calls
        postgres_calls += 1
        await original_postgres_aggregate(session, survey_id, states)

    monkeypatch.setattr(
        survey_analytics_service,
        "_aggregate_postgres",
        spy_postgres_aggregate,
    )

    try:
        async with sessions() as postgres_session:
            postgres_output = await survey_analytics_service.aggregate_responses(
                postgres_session, ANALYTICS_SURVEY_ID
            )

        monkeypatch.setattr(
            survey_analytics_service,
            "_session_dialect_name",
            lambda _session: "reference",
        )
        async with sessions() as reference_session:
            reference_output = await survey_analytics_service.aggregate_responses(
                reference_session, ANALYTICS_SURVEY_ID
            )
    finally:
        await async_engine.dispose()

    postgres_data = [aggregate.model_dump(mode="json") for aggregate in postgres_output]
    reference_data = [aggregate.model_dump(mode="json") for aggregate in reference_output]
    assert postgres_calls == 1
    assert postgres_data == reference_data
    assert {aggregate["question_type"] for aggregate in postgres_data} == {
        "single_choice",
        "multiple_choice",
        "matrix",
    }

    by_type = {aggregate["question_type"]: aggregate for aggregate in postgres_data}
    assert {cell["value"]: cell["count"] for cell in by_type["single_choice"]["cells"]} == {
        "A": 4,
        "B": 0,
    }
    assert {cell["value"]: cell["count"] for cell in by_type["multiple_choice"]["cells"]} == {
        "A": 4,
        "B": 4,
    }
    assert {
        (cell["row"], cell["value"]): cell["count"]
        for cell in by_type["matrix"]["cells"]
    } == {
        ("Row 1", "Yes"): 4,
        ("Row 1", "No"): 0,
        ("Row 2", "Yes"): 4,
        ("Row 2", "No"): 0,
    }


@pytest.mark.anyio
async def test_concurrent_retention_purges_are_idempotent(
    postgres_database: PostgresTestDatabase,
) -> None:
    _seed_retention_fixture(postgres_database)
    async_engine = _async_engine(postgres_database)
    sessions = async_sessionmaker(async_engine, class_=AsyncSession, expire_on_commit=False)

    async def purge() -> response_retention_service.RetentionPurgeResult:
        async with sessions() as session:
            return await response_retention_service.purge_expired_responses(
                session,
                cutoff=RETENTION_CUTOFF,
                batch_size=1,
            )

    try:
        results = await asyncio.wait_for(asyncio.gather(purge(), purge()), timeout=10)
        assert sorted(result.purged_count for result in results) == [0, 1]
        assert sum(result.batch_count for result in results) == 1

        async with sessions() as rerun_session:
            rerun = await response_retention_service.purge_expired_responses(
                rerun_session,
                cutoff=RETENTION_CUTOFF,
                batch_size=1,
            )
        assert rerun.purged_count == 0
        assert rerun.batch_count == 0

        async with sessions() as inspection_session:
            response = (
                await inspection_session.exec(
                    select(SurveyResponse).where(SurveyResponse.id == RETENTION_RESPONSE_ID)
                )
            ).one()
            survey = (
                await inspection_session.exec(
                    select(Survey).where(Survey.id == RETENTION_SURVEY_ID)
                )
            ).one()
            audits = list(
                (
                    await inspection_session.exec(
                        select(AuditLog).where(
                            AuditLog.action == "retention_purge",
                            AuditLog.resource_id == "SURV-RETENTION",
                        )
                    )
                ).all()
            )
    finally:
        await async_engine.dispose()

    assert response.is_deleted is True
    assert response.answers == {}
    assert response.distribution_id is None
    assert response.idempotency_key is None
    assert response.idempotency_hash is None
    assert response.consent_version is None
    assert response.consented_at is None
    assert response.consent_notice_snapshot is None
    assert response.withdrawal_credential_digest is None
    assert survey.responses_count == 0
    assert len(audits) == 1
    assert audits[0].resource_type == "survey_response_retention"
    assert audits[0].changes is not None
    assert audits[0].changes["purged_count"] == 1
