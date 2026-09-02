import pytest
from sqlalchemy import text

from tests.integration.fixtures import PostgresTestDatabase, attempt_downgrade, migrate_to

pytestmark = pytest.mark.integration

GOOGLE_AUTH_PROOF_TABLE = "google_survey_auth_proofs"
GOOGLE_PERMISSION = "survey_responses.read_identity"
TARGET_ROLES = ("anon", "authenticated", "service_role")
TABLE_PRIVILEGES = (
    "SELECT",
    "INSERT",
    "UPDATE",
    "DELETE",
    "TRUNCATE",
    "REFERENCES",
    "TRIGGER",
)
COLUMN_PRIVILEGES = ("SELECT", "INSERT", "UPDATE", "REFERENCES")


def _migration_state(database: PostgresTestDatabase) -> dict[str, tuple[tuple[object, ...], ...]]:
    with database.engine.connect() as connection:
        state = {
            "revision": (
                (connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one(),),
            ),
            "columns": tuple(
                tuple(row)
                for row in connection.execute(
                    text(
                        "SELECT table_name, column_name, ordinal_position, is_nullable, "
                        "data_type, character_maximum_length "
                        "FROM information_schema.columns "
                        "WHERE table_schema = current_schema() "
                        "AND table_name IN ('google_survey_auth_proofs', 'survey_responses') "
                        "ORDER BY table_name, ordinal_position"
                    )
                ).all()
            ),
            "indexes": tuple(
                tuple(row)
                for row in connection.execute(
                    text(
                        "SELECT tablename, indexname, indexdef FROM pg_indexes "
                        "WHERE schemaname = current_schema() "
                        "AND tablename IN ('google_survey_auth_proofs', 'survey_responses') "
                        "ORDER BY tablename, indexname"
                    )
                ).all()
            ),
            "constraints": tuple(
                tuple(row)
                for row in connection.execute(
                    text(
                        "SELECT tc.table_name, tc.constraint_name, tc.constraint_type, "
                        "pg_get_constraintdef(c.oid) "
                        "FROM information_schema.table_constraints AS tc "
                        "JOIN pg_class AS rel ON rel.relname = tc.table_name "
                        "JOIN pg_namespace AS ns ON ns.oid = rel.relnamespace "
                        "JOIN pg_constraint AS c ON c.conrelid = rel.oid "
                        "AND c.conname = tc.constraint_name "
                        "WHERE tc.table_schema = current_schema() "
                        "AND ns.nspname = current_schema() "
                        "AND tc.table_name IN ('google_survey_auth_proofs', 'survey_responses') "
                        "ORDER BY tc.table_name, tc.constraint_name"
                    )
                ).all()
            ),
            "tables": tuple(
                tuple(row)
                for row in connection.execute(
                    text(
                        "SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity, "
                        "COALESCE(c.relacl::text, '') "
                        "FROM pg_class AS c "
                        "JOIN pg_namespace AS n ON n.oid = c.relnamespace "
                        "WHERE n.nspname = current_schema() "
                        "AND c.relname IN ('google_survey_auth_proofs', 'survey_responses') "
                        "ORDER BY c.relname"
                    )
                ).all()
            ),
            "column_acls": tuple(
                tuple(row)
                for row in connection.execute(
                    text(
                        "SELECT c.relname, a.attname, COALESCE(a.attacl::text, '') "
                        "FROM pg_attribute AS a "
                        "JOIN pg_class AS c ON c.oid = a.attrelid "
                        "JOIN pg_namespace AS n ON n.oid = c.relnamespace "
                        "WHERE n.nspname = current_schema() "
                        "AND c.relname IN ('google_survey_auth_proofs', 'survey_responses') "
                        "AND a.attnum > 0 AND NOT a.attisdropped "
                        "ORDER BY c.relname, a.attnum"
                    )
                ).all()
            ),
            "policies": tuple(
                tuple(row)
                for row in connection.execute(
                    text(
                        "SELECT c.relname, p.polname FROM pg_policy AS p "
                        "JOIN pg_class AS c ON c.oid = p.polrelid "
                        "JOIN pg_namespace AS n ON n.oid = c.relnamespace "
                        "WHERE n.nspname = current_schema() "
                        "AND c.relname IN ('google_survey_auth_proofs', 'survey_responses') "
                        "ORDER BY c.relname, p.polname"
                    )
                ).all()
            ),
            "rbac": tuple(
                tuple(row)
                for row in connection.execute(
                    text(
                        "SELECT p.id::text, p.code, rp.id::text, rp.role_id::text, "
                        "r.name, rp.permission_id::text, rp.is_deleted "
                        "FROM permissions AS p "
                        "LEFT JOIN role_permissions AS rp ON rp.permission_id = p.id "
                        "LEFT JOIN roles AS r ON r.id = rp.role_id "
                        "WHERE p.code = 'survey_responses.read_identity' "
                        "ORDER BY rp.id"
                    )
                ).all()
            ),
            "data": tuple(
                tuple(row)
                for row in connection.execute(
                    text(
                        "SELECT 'proof' AS kind, session_id::text, verified_email, "
                        "expires_at::text FROM google_survey_auth_proofs "
                        "UNION ALL "
                        "SELECT 'response' AS kind, id::text, provider, "
                        "identity_captured_at::text FROM survey_responses "
                        "ORDER BY kind, session_id"
                    )
                ).all()
            ),
        }
    return state


def _seed_legacy_response(database: PostgresTestDatabase) -> None:
    with database.engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO surveys "
                "(id, created_at, updated_at, is_deleted, deleted_at, performed_by, survey_id, "
                "title, description, status, target_cohort, responses_count, "
                "retention_enabled, retention_days) VALUES "
                "('50000000-0000-0000-0000-000000000001', '2021-01-02 03:04:05', "
                "'2021-01-02 03:04:05', false, NULL, NULL, 'SURV-GOOGLE-MIGRATION', "
                "'Google migration survey', NULL, 'Active', NULL, 1, true, 1825)"
            )
        )
        connection.execute(
            text(
                "INSERT INTO survey_responses "
                "(id, created_at, updated_at, is_deleted, deleted_at, performed_by, survey_id, "
                "distribution_id, idempotency_key, idempotency_hash, consent_version, "
                "consented_at, retention_expires_at, withdrawal_credential_digest, "
                "consent_notice_snapshot, answers) VALUES "
                "('50000000-0000-0000-0000-000000000002', '2021-01-02 03:04:05', "
                "'2021-01-02 03:04:05', false, NULL, NULL, "
                "'50000000-0000-0000-0000-000000000001', NULL, NULL, NULL, NULL, NULL, "
                "'2026-01-02 03:04:05', NULL, NULL, '{\"legacy\": true}')"
            )
        )


def test_google_identity_revision_preserves_legacy_rows_and_locks_down_new_table(
    postgres_database_at_revision,
) -> None:
    with postgres_database_at_revision("d5a4f7c91e2b") as database:
        _seed_legacy_response(database)
        migrate_to(database.url, "a8055c9859f5", database.schema)

        with database.engine.connect() as connection:
            columns = connection.execute(
                text(
                    "SELECT column_name, is_nullable, character_maximum_length "
                    "FROM information_schema.columns "
                    "WHERE table_schema = current_schema() AND table_name = :table "
                    "ORDER BY ordinal_position"
                ),
                {"table": GOOGLE_AUTH_PROOF_TABLE},
            ).all()
            response_columns = set(
                connection.execute(
                    text(
                        "SELECT column_name FROM information_schema.columns "
                        "WHERE table_schema = current_schema() "
                        "AND table_name = 'survey_responses'"
                    )
                ).scalars()
            )
            indexes = set(
                connection.execute(
                    text(
                        "SELECT indexname FROM pg_indexes "
                        "WHERE schemaname = current_schema() "
                        "AND tablename IN ('google_survey_auth_proofs', 'survey_responses')"
                    )
                ).scalars()
            )
            constraints = set(
                connection.execute(
                    text(
                        "SELECT constraint_name FROM information_schema.table_constraints "
                        "WHERE table_schema = current_schema() "
                        "AND table_name IN ('google_survey_auth_proofs', 'survey_responses')"
                    )
                ).scalars()
            )
            legacy_identity = connection.execute(
                text(
                    "SELECT provider, auth_user_id, respondent_key_digest, email, "
                    "display_name, email_verified, identity_captured_at "
                    "FROM survey_responses "
                    "WHERE id = '50000000-0000-0000-0000-000000000002'"
                )
            ).one()
            rls_state = connection.execute(
                text(
                    "SELECT c.relrowsecurity, c.relforcerowsecurity "
                    "FROM pg_class AS c JOIN pg_namespace AS n ON n.oid = c.relnamespace "
                    "WHERE n.nspname = current_schema() AND c.relname = :table"
                ),
                {"table": GOOGLE_AUTH_PROOF_TABLE},
            ).one()
            policies = connection.execute(
                text(
                    "SELECT p.polname FROM pg_policy AS p "
                    "JOIN pg_class AS c ON c.oid = p.polrelid "
                    "JOIN pg_namespace AS n ON n.oid = c.relnamespace "
                    "WHERE n.nspname = current_schema() AND c.relname = :table"
                ),
                {"table": GOOGLE_AUTH_PROOF_TABLE},
            ).all()
            public_grants = connection.execute(
                text(
                    "SELECT privileges.privilege_type FROM pg_class AS c "
                    "JOIN pg_namespace AS n ON n.oid = c.relnamespace "
                    "CROSS JOIN LATERAL aclexplode("
                    "COALESCE(c.relacl, acldefault('r', c.relowner))) AS privileges "
                    "WHERE n.nspname = current_schema() AND c.relname = :table "
                    "AND privileges.grantee = 0"
                ),
                {"table": GOOGLE_AUTH_PROOF_TABLE},
            ).all()
            target_roles = set(
                connection.execute(
                    text("SELECT rolname FROM pg_roles WHERE rolname = ANY(:role_names)"),
                    {"role_names": list(TARGET_ROLES)},
                ).scalars()
            )
            proof_column_names = [row.column_name for row in columns]
            effective_table_grants = [
                (role, privilege)
                for role in target_roles
                for privilege in TABLE_PRIVILEGES
                if connection.execute(
                    text(
                        "SELECT has_table_privilege("
                        ":role_name, format('%I.%I', current_schema(), :table), "
                        ":privilege)"
                    ),
                    {
                        "role_name": role,
                        "table": GOOGLE_AUTH_PROOF_TABLE,
                        "privilege": privilege,
                    },
                ).scalar_one()
            ]
            effective_column_grants = [
                (role, column, privilege)
                for role in target_roles
                for column in proof_column_names
                for privilege in COLUMN_PRIVILEGES
                if connection.execute(
                    text(
                        "SELECT has_column_privilege("
                        ":role_name, format('%I.%I', current_schema(), :table), "
                        ":column_name, :privilege)"
                    ),
                    {
                        "role_name": role,
                        "table": GOOGLE_AUTH_PROOF_TABLE,
                        "column_name": column,
                        "privilege": privilege,
                    },
                ).scalar_one()
            ]
            permission_rows = connection.execute(
                text(
                    "SELECT r.name, p.code FROM role_permissions rp "
                    "JOIN roles r ON r.id = rp.role_id "
                    "JOIN permissions p ON p.id = rp.permission_id "
                    "WHERE p.code = :code AND rp.is_deleted = false"
                ),
                {"code": GOOGLE_PERMISSION},
            ).all()

    assert [
        (row.column_name, row.is_nullable, row.character_maximum_length) for row in columns
    ] == [
        ("session_id", "NO", None),
        ("auth_user_id", "NO", None),
        ("google_subject_digest", "NO", 64),
        ("verified_email", "NO", 320),
        ("display_name", "YES", 255),
        ("email_verified", "NO", None),
        ("authenticated_at", "NO", None),
        ("expires_at", "NO", None),
    ]
    assert {
        "provider",
        "auth_user_id",
        "respondent_key_digest",
        "email",
        "display_name",
        "email_verified",
        "identity_captured_at",
    } <= response_columns
    assert {
        "ix_google_survey_auth_proofs_auth_user_id",
        "ix_google_survey_auth_proofs_expires_at",
        "ix_survey_responses_auth_user_id",
        "ix_survey_responses_respondent_key_digest",
    } <= indexes
    assert {
        "ck_google_survey_auth_proofs_expiry_after_authentication",
        "ck_survey_responses_identity_snapshot_coherent",
        "uq_survey_responses_survey_respondent_key",
    } <= constraints
    assert all(value is None for value in legacy_identity)
    assert rls_state.relrowsecurity is True
    assert rls_state.relforcerowsecurity is False
    assert policies == []
    assert public_grants == []
    assert effective_table_grants == []
    assert effective_column_grants == []
    assert {role for role, code in permission_rows if code == GOOGLE_PERMISSION} == {
        "admin",
        "researcher",
    }


def test_google_identity_downgrade_refuses_without_mutating_revision_schema_or_rbac(
    postgres_database_at_revision,
) -> None:
    with postgres_database_at_revision("d5a4f7c91e2b") as database:
        _seed_legacy_response(database)
        migrate_to(database.url, "a8055c9859f5", database.schema)

        with database.engine.begin() as connection:
            connection.execute(
                text(
                    "INSERT INTO google_survey_auth_proofs "
                    "(session_id, auth_user_id, google_subject_digest, verified_email, "
                    "display_name, email_verified, authenticated_at, expires_at) VALUES "
                    "('60000000-0000-0000-0000-000000000001', "
                    "'60000000-0000-0000-0000-000000000002', repeat('a', 64), "
                    "'respondent@example.com', 'Respondent', true, "
                    "'2026-09-01 00:00:00', '2026-09-01 00:05:00')"
                )
            )

        before = _migration_state(database)
        diagnostics = attempt_downgrade(database.url, "d5a4f7c91e2b", database.schema)
        after = _migration_state(database)

    assert "fail-closed" in diagnostics
    assert after == before
