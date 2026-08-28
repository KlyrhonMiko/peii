import pytest
from sqlalchemy import text

from tests.integration.fixtures import migrate_to

pytestmark = pytest.mark.integration

EXPECTED_TABLES = {
    "alembic_version",
    "audit_logs",
    "permissions",
    "response_erasure_receipts",
    "role_permissions",
    "roles",
    "survey_distributions",
    "survey_questions",
    "survey_responses",
    "survey_sections",
    "surveys",
    "user_roles",
    "users",
}
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


def _existing_target_roles(connection) -> set[str]:
    return set(
        connection.execute(
            text("SELECT rolname FROM pg_roles WHERE rolname = ANY(:role_names)"),
            {"role_names": list(TARGET_ROLES)},
        ).scalars()
    )


def test_supabase_data_api_lockdown_enforces_rls_and_denies_effective_privileges(
    postgres_database_at_revision,
) -> None:
    with postgres_database_at_revision("2bf09a6bc738") as database:
        with database.engine.connect() as connection:
            null_column_acl_rows = connection.execute(
                text(
                    "SELECT count(*) "
                    "FROM pg_attribute AS a "
                    "JOIN pg_class AS c ON c.oid = a.attrelid "
                    "JOIN pg_namespace AS n ON n.oid = c.relnamespace "
                    "LEFT JOIN LATERAL aclexplode("
                    "COALESCE(a.attacl, acldefault('c', c.relowner))) AS privileges "
                    "ON TRUE "
                    "WHERE n.nspname = current_schema() "
                    "AND c.relname = ANY(:tables) AND a.attacl IS NULL"
                ),
                {"tables": list(EXPECTED_TABLES)},
            ).scalar_one()

        migrate_to(database.url, "d5a4f7c91e2b", database.schema)

        with database.engine.connect() as connection:
            table_state = connection.execute(
                text(
                    "SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity "
                    "FROM pg_class AS c "
                    "JOIN pg_namespace AS n ON n.oid = c.relnamespace "
                    "WHERE n.nspname = current_schema() AND c.relname = ANY(:tables) "
                    "ORDER BY c.relname"
                ),
                {"tables": list(EXPECTED_TABLES)},
            ).all()
            policies = connection.execute(
                text(
                    "SELECT p.polname "
                    "FROM pg_policy AS p "
                    "JOIN pg_class AS c ON c.oid = p.polrelid "
                    "JOIN pg_namespace AS n ON n.oid = c.relnamespace "
                    "WHERE n.nspname = current_schema() AND c.relname = ANY(:tables)"
                ),
                {"tables": list(EXPECTED_TABLES)},
            ).all()
            public_grants = connection.execute(
                text(
                    "SELECT c.relname, privileges.privilege_type "
                    "FROM pg_class AS c "
                    "JOIN pg_namespace AS n ON n.oid = c.relnamespace "
                    "CROSS JOIN LATERAL aclexplode(" 
                    "COALESCE(c.relacl, acldefault('r', c.relowner))) AS privileges "
                    "WHERE n.nspname = current_schema() "
                    "AND c.relname = ANY(:tables) AND privileges.grantee = 0"
                ),
                {"tables": list(EXPECTED_TABLES)},
            ).all()
            target_roles = _existing_target_roles(connection)
            schema_create_grants = connection.execute(
                text(
                    "SELECT privileges.privilege_type "
                    "FROM pg_namespace AS n "
                    "CROSS JOIN LATERAL aclexplode(" 
                    "COALESCE(n.nspacl, acldefault('n', n.nspowner))) AS privileges "
                    "WHERE n.nspname = current_schema() "
                    "AND privileges.grantee = 0 AND privileges.privilege_type = 'CREATE'"
                )
            ).all()
            default_grants = connection.execute(
                text(
                    "SELECT d.defaclobjtype, privileges.privilege_type "
                    "FROM pg_default_acl AS d "
                    "JOIN pg_namespace AS n ON n.oid = d.defaclnamespace "
                    "CROSS JOIN LATERAL aclexplode(d.defaclacl) AS privileges "
                    "WHERE n.nspname = current_schema() "
                    "AND d.defaclrole = (SELECT oid FROM pg_roles "
                    "WHERE rolname = current_user) "
                    "AND d.defaclobjtype IN ('r', 'S', 'f') "
                    "AND (privileges.grantee = 0 OR privileges.grantee IN "
                    "(SELECT oid FROM pg_roles WHERE rolname = ANY(:roles)))"
                ),
                {"roles": list(TARGET_ROLES)},
            ).all()
            columns = connection.execute(
                text(
                    "SELECT table_name, column_name "
                    "FROM information_schema.columns "
                    "WHERE table_schema = current_schema() "
                    "AND table_name = ANY(:tables)"
                ),
                {"tables": list(EXPECTED_TABLES)},
            ).all()

            effective_table_grants = []
            effective_column_grants = []
            for role in target_roles:
                for table_name in EXPECTED_TABLES:
                    for privilege in TABLE_PRIVILEGES:
                        granted = connection.execute(
                            text(
                                "SELECT has_table_privilege(" 
                                ":role_name, format('%I.%I', current_schema(), "
                                ":table_name), :privilege)"
                            ),
                            {
                                "role_name": role,
                                "table_name": table_name,
                                "privilege": privilege,
                            },
                        ).scalar_one()
                        if granted:
                            effective_table_grants.append((role, table_name, privilege))
                for table_name, column_name in columns:
                    for privilege in COLUMN_PRIVILEGES:
                        granted = connection.execute(
                            text(
                                "SELECT has_column_privilege(" 
                                ":role_name, format('%I.%I', current_schema(), "
                                ":table_name), :column_name, :privilege)"
                            ),
                            {
                                "role_name": role,
                                "table_name": table_name,
                                "column_name": column_name,
                                "privilege": privilege,
                            },
                        ).scalar_one()
                        if granted:
                            effective_column_grants.append(
                                (role, table_name, column_name, privilege)
                            )
            effective_schema_grants = [
                role
                for role in target_roles
                if connection.execute(
                    text("SELECT has_schema_privilege(:role, current_schema(), 'CREATE')"),
                    {"role": role},
                ).scalar_one()
            ]

    assert {row.relname for row in table_state} == EXPECTED_TABLES
    assert null_column_acl_rows > 0
    assert all(row.relrowsecurity and not row.relforcerowsecurity for row in table_state)
    assert policies == []
    assert public_grants == []
    assert schema_create_grants == []
    assert default_grants == []
    assert effective_schema_grants == []
    assert effective_table_grants == []
    assert effective_column_grants == []
