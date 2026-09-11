import pytest
from sqlalchemy import text

pytestmark = pytest.mark.integration

APP_TABLES = {
    "audit_logs",
    "false_positive_feedbacks",
    "google_survey_auth_proofs",
    "permissions",
    "response_erasure_receipts",
    "role_permissions",
    "roles",
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


def _table_privileges_for_server(server_version: int) -> tuple[str, ...]:
    if server_version >= 170000:
        return (*TABLE_PRIVILEGES, "MAINTAIN")
    return TABLE_PRIVILEGES


def test_final_head_locks_down_every_current_application_table(postgres_connection) -> None:
    table_state = postgres_connection.execute(
        text(
            "SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity "
            "FROM pg_class AS c "
            "JOIN pg_namespace AS n ON n.oid = c.relnamespace "
            "WHERE n.nspname = current_schema() AND c.relname = ANY(:tables) "
            "AND c.relkind IN ('r', 'p')"
        ),
        {"tables": list(APP_TABLES)},
    ).all()
    policies = postgres_connection.execute(
        text(
            "SELECT c.relname, p.polname FROM pg_policy AS p "
            "JOIN pg_class AS c ON c.oid = p.polrelid "
            "JOIN pg_namespace AS n ON n.oid = c.relnamespace "
            "WHERE n.nspname = current_schema() AND c.relname = ANY(:tables)"
        ),
        {"tables": list(APP_TABLES)},
    ).all()
    public_table_grants = postgres_connection.execute(
        text(
            "SELECT c.relname, privileges.privilege_type "
            "FROM pg_class AS c "
            "JOIN pg_namespace AS n ON n.oid = c.relnamespace "
            "CROSS JOIN LATERAL aclexplode("
            "COALESCE(c.relacl, acldefault('r', c.relowner))) AS privileges "
            "WHERE n.nspname = current_schema() AND c.relname = ANY(:tables) "
            "AND privileges.grantee = 0"
        ),
        {"tables": list(APP_TABLES)},
    ).all()
    public_column_grants = postgres_connection.execute(
        text(
            "SELECT c.relname, a.attname, privileges.privilege_type "
            "FROM pg_attribute AS a "
            "JOIN pg_class AS c ON c.oid = a.attrelid "
            "JOIN pg_namespace AS n ON n.oid = c.relnamespace "
            "CROSS JOIN LATERAL aclexplode("
            "COALESCE(a.attacl, acldefault('c', c.relowner))) AS privileges "
            "WHERE n.nspname = current_schema() AND c.relname = ANY(:tables) "
            "AND a.attnum > 0 AND NOT a.attisdropped AND privileges.grantee = 0"
        ),
        {"tables": list(APP_TABLES)},
    ).all()
    columns = postgres_connection.execute(
        text(
            "SELECT table_name, column_name FROM information_schema.columns "
            "WHERE table_schema = current_schema() AND table_name = ANY(:tables)"
        ),
        {"tables": list(APP_TABLES)},
    ).all()
    existing_roles = set(
        postgres_connection.execute(
            text("SELECT rolname FROM pg_roles WHERE rolname = ANY(:roles)"),
            {"roles": list(TARGET_ROLES)},
        ).scalars()
    )
    server_version = int(
        postgres_connection.execute(text("SHOW server_version_num")).scalar_one()
    )

    effective_table_grants = []
    effective_column_grants = []
    for role in existing_roles:
        for table_name in APP_TABLES:
            for privilege in _table_privileges_for_server(server_version):
                if postgres_connection.execute(
                    text(
                        "SELECT has_table_privilege("
                        ":role, format('%I.%I', current_schema(), :table_name), :privilege)"
                    ),
                    {"role": role, "table_name": table_name, "privilege": privilege},
                ).scalar_one():
                    effective_table_grants.append((role, table_name, privilege))
        for table_name, column_name in columns:
            for privilege in COLUMN_PRIVILEGES:
                if postgres_connection.execute(
                    text(
                        "SELECT has_column_privilege("
                        ":role, format('%I.%I', current_schema(), :table_name), "
                        ":column_name, :privilege)"
                    ),
                    {
                        "role": role,
                        "table_name": table_name,
                        "column_name": column_name,
                        "privilege": privilege,
                    },
                ).scalar_one():
                    effective_column_grants.append(
                        (role, table_name, column_name, privilege)
                    )

    assert {row.relname for row in table_state} == APP_TABLES
    assert all(row.relrowsecurity and not row.relforcerowsecurity for row in table_state)
    assert policies == []
    assert public_table_grants == []
    assert public_column_grants == []
    assert effective_table_grants == []
    assert effective_column_grants == []
