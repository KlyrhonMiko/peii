from datetime import datetime, timedelta
from hashlib import sha256
from uuid import UUID

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from tests.integration.fixtures import PostgresTestDatabase, migrate_to

pytestmark = pytest.mark.integration

SURVEY_ID = UUID("40000000-0000-0000-0000-000000000001")
RESPONSE_ID = UUID("40000000-0000-0000-0000-000000000002")
DUPLICATE_RESPONSE_ID = UUID("40000000-0000-0000-0000-000000000003")
CREATED_AT = datetime(2021, 1, 2, 3, 4, 5)
WITHDRAWAL_DIGEST = "a" * 64
DISTRIBUTION_ID = UUID("40000000-0000-0000-0000-000000000004")
DISTRIBUTION_TOKEN = "legacy-distribution-token"


def _seed_legacy_survey_and_response(database: PostgresTestDatabase) -> None:
    with database.engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO surveys "
                "(id, created_at, updated_at, is_deleted, deleted_at, performed_by, survey_id, "
                "title, description, status, target_cohort, responses_count) "
                "VALUES (:survey_id, :created_at, :created_at, false, NULL, NULL, "
                "'SURV-MIGRATION', 'Legacy survey', NULL, 'Active', NULL, 1)"
            ),
            {"survey_id": str(SURVEY_ID), "created_at": CREATED_AT},
        )
        connection.execute(
            text(
                "INSERT INTO survey_responses "
                "(id, created_at, updated_at, is_deleted, deleted_at, performed_by, survey_id, "
                "distribution_id, idempotency_key, idempotency_hash, consent_version, "
                "consented_at, consent_notice_snapshot, answers) "
                "VALUES (:response_id, :created_at, :created_at, false, NULL, NULL, "
                ":survey_id, NULL, NULL, NULL, NULL, NULL, NULL, '{\"legacy\": true}')"
            ),
            {
                "response_id": str(RESPONSE_ID),
                "survey_id": str(SURVEY_ID),
                "created_at": CREATED_AT,
            },
        )


def test_phase3_migration_backfills_legacy_rows_and_enforces_new_schema(
    postgres_database_at_revision,
) -> None:
    with postgres_database_at_revision("d1f9bad768ad") as database:
        _seed_legacy_survey_and_response(database)
        migrate_to(database.url, "fb1c93d15474", database.schema)

        with database.engine.connect() as connection:
            survey = connection.execute(
                text(
                    "SELECT retention_enabled, retention_days FROM surveys "
                    "WHERE id = :survey_id"
                ),
                {"survey_id": str(SURVEY_ID)},
            ).one()
            response = connection.execute(
                text(
                    "SELECT retention_expires_at, withdrawal_credential_digest "
                    "FROM survey_responses WHERE id = :response_id"
                ),
                {"response_id": str(RESPONSE_ID)},
            ).one()
            index_names = set(
                connection.execute(
                    text(
                        "SELECT indexname FROM pg_indexes "
                        "WHERE schemaname = current_schema() "
                        "AND tablename = 'survey_responses'"
                    )
                ).scalars()
            )
            constraint_names = set(
                connection.execute(
                    text(
                        "SELECT constraint_name FROM information_schema.table_constraints "
                        "WHERE table_schema = current_schema() "
                        "AND table_name IN ('surveys', 'survey_responses')"
                    )
                ).scalars()
            )

        assert survey.retention_enabled is True
        assert survey.retention_days == 1825
        assert response.retention_expires_at == CREATED_AT + timedelta(days=1825)
        assert response.withdrawal_credential_digest is None
        assert {
            "ix_survey_responses_retention_expires_at",
            "ix_survey_responses_withdrawal_credential_digest",
        } <= index_names
        assert {
            "ck_surveys_retention_days_positive",
            "uq_survey_responses_survey_withdrawal_digest",
        } <= constraint_names

        with pytest.raises(IntegrityError):
            with database.engine.begin() as connection:
                connection.execute(
                    text("UPDATE surveys SET retention_days = 0 WHERE id = :survey_id"),
                    {"survey_id": str(SURVEY_ID)},
                )

        with database.engine.begin() as connection:
            connection.execute(
                text(
                    "UPDATE survey_responses SET withdrawal_credential_digest = :digest "
                    "WHERE id = :response_id"
                ),
                {"digest": WITHDRAWAL_DIGEST, "response_id": str(RESPONSE_ID)},
            )

        with pytest.raises(IntegrityError):
            with database.engine.begin() as connection:
                connection.execute(
                    text(
                        "INSERT INTO survey_responses "
                        "(id, created_at, updated_at, is_deleted, survey_id, answers, "
                        "withdrawal_credential_digest) VALUES (:id, :created_at, :created_at, "
                        "false, :survey_id, '{\"duplicate\": true}', :digest)"
                    ),
                    {
                        "id": str(DUPLICATE_RESPONSE_ID),
                        "created_at": CREATED_AT,
                        "survey_id": str(SURVEY_ID),
                        "digest": WITHDRAWAL_DIGEST,
                    },
                )


def test_distribution_token_migration_backfills_and_drops_plaintext_catalog_entries(
    postgres_database_at_revision,
) -> None:
    with postgres_database_at_revision("fb1c93d15474") as database:
        with database.engine.begin() as connection:
            connection.execute(
                text(
                    "INSERT INTO surveys "
                    "(id, created_at, updated_at, is_deleted, deleted_at, performed_by, survey_id, "
                    "title, description, status, target_cohort, responses_count, "
                    "retention_enabled, retention_days) VALUES "
                    "(:id, :created_at, :created_at, false, NULL, NULL, 'SURV-TOKEN-MIGRATION', "
                    "'Token migration survey', NULL, 'Active', NULL, 0, true, 1825)"
                ),
                {"id": str(SURVEY_ID), "created_at": CREATED_AT},
            )
            connection.execute(
                text(
                    "INSERT INTO survey_distributions "
                    "(id, created_at, updated_at, is_deleted, deleted_at, performed_by, survey_id, "
                    "token, token_digest, token_prefix, expires_at, revoked_at) VALUES "
                    "(:id, :created_at, :created_at, false, NULL, NULL, :survey_id, "
                    ":token, NULL, NULL, '2099-01-01 00:00:00', NULL)"
                ),
                {
                    "id": str(DISTRIBUTION_ID),
                    "created_at": CREATED_AT,
                    "survey_id": str(SURVEY_ID),
                    "token": DISTRIBUTION_TOKEN,
                },
            )

        migrate_to(database.url, "2bf09a6bc738", database.schema)

        with database.engine.connect() as connection:
            distribution = connection.execute(
                text(
                    "SELECT token_digest, token_prefix FROM survey_distributions "
                    "WHERE id = :id"
                ),
                {"id": str(DISTRIBUTION_ID)},
            ).one()
            columns = set(
                connection.execute(
                    text(
                        "SELECT column_name FROM information_schema.columns "
                        "WHERE table_schema = current_schema() "
                        "AND table_name = 'survey_distributions'"
                    )
                ).scalars()
            )
            indexes = set(
                connection.execute(
                    text(
                        "SELECT indexname FROM pg_indexes "
                        "WHERE schemaname = current_schema() "
                        "AND tablename = 'survey_distributions'"
                    )
                ).scalars()
            )
            digest_nullability = connection.execute(
                text(
                    "SELECT is_nullable FROM information_schema.columns "
                    "WHERE table_schema = current_schema() "
                    "AND table_name = 'survey_distributions' "
                    "AND column_name = 'token_digest'"
                )
            ).scalar_one()

    assert distribution.token_digest == sha256(DISTRIBUTION_TOKEN.encode()).hexdigest()
    assert distribution.token_prefix == DISTRIBUTION_TOKEN[:8]
    assert "token" not in columns
    assert "ix_survey_distributions_token" not in indexes
    assert "ix_survey_distributions_token_digest" in indexes
    assert digest_nullability == "NO"
