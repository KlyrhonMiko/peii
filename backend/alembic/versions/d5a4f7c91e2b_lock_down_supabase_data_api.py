"""lock down the Supabase Data API surface

Revision ID: d5a4f7c91e2b
Revises: 2bf09a6bc738
Create Date: 2026-08-28
"""

from collections.abc import Iterable

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "d5a4f7c91e2b"
down_revision = "2bf09a6bc738"
branch_labels = None
depends_on = None

PROTECTED_TABLES = (
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
)
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


def _quote_identifier(identifier: str) -> str:
    """Quote a server-resolved identifier without interpolating its contents."""

    return '"' + identifier.replace('"', '""') + '"'


def _qualified_table(schema: str, table: str) -> str:
    return f"{_quote_identifier(schema)}.{_quote_identifier(table)}"


def _expanded_names(names: Iterable[str]) -> sa.BindParameter:
    return sa.bindparam("names", value=tuple(names), expanding=True)


def _existing_roles(connection: sa.Connection) -> set[str]:
    statement = sa.text(
        "SELECT rolname FROM pg_roles WHERE rolname IN :names"
    ).bindparams(_expanded_names(TARGET_ROLES))
    return set(connection.execute(statement).scalars())


def _table_columns(connection: sa.Connection, schema: str, table: str) -> tuple[str, ...]:
    rows = connection.execute(
        sa.text(
            "SELECT a.attname "
            "FROM pg_attribute AS a "
            "JOIN pg_class AS c ON c.oid = a.attrelid "
            "JOIN pg_namespace AS n ON n.oid = c.relnamespace "
            "WHERE n.nspname = :schema_name AND c.relname = :table_name "
            "AND c.relkind IN ('r', 'p') AND a.attnum > 0 AND NOT a.attisdropped "
            "ORDER BY a.attnum"
        ),
        {"schema_name": schema, "table_name": table},
    ).scalars()
    return tuple(rows)


def _table_privileges(connection: sa.Connection) -> tuple[str, ...]:
    server_version = int(
        connection.execute(sa.text("SHOW server_version_num")).scalar_one()
    )
    if server_version >= 150000:
        return (*TABLE_PRIVILEGES, "MAINTAIN")
    return TABLE_PRIVILEGES


def _revoke_column_privileges(
    connection: sa.Connection,
    table: str,
    columns: Iterable[str],
    grantees: Iterable[str],
) -> None:
    for column in columns:
        quoted_column = _quote_identifier(column)
        for grantee in grantees:
            grantee_sql = "PUBLIC" if grantee == "PUBLIC" else _quote_identifier(grantee)
            for privilege in COLUMN_PRIVILEGES:
                connection.execute(
                    sa.text(
                        f"REVOKE {privilege} ({quoted_column}) ON TABLE {table} "
                        f"FROM {grantee_sql}"
                    )
                )


def _assert_targets_exist(connection: sa.Connection, schema: str) -> None:
    statement = sa.text(
        "SELECT c.relname "
        "FROM pg_class AS c "
        "JOIN pg_namespace AS n ON n.oid = c.relnamespace "
        "WHERE n.nspname = :schema_name AND c.relname IN :names "
        "AND c.relkind IN ('r', 'p')"
    ).bindparams(_expanded_names(PROTECTED_TABLES))
    found = set(
        connection.execute(statement, {"schema_name": schema}).scalars()
    )
    missing = set(PROTECTED_TABLES) - found
    if missing:
        missing_names = ", ".join(sorted(missing))
        raise RuntimeError(
            f"Supabase Data API lockdown requires missing tables in {schema!r}: {missing_names}"
        )


def _assert_protected_table_ownership(connection: sa.Connection, schema: str) -> None:
    rows = connection.execute(
        sa.text(
            "SELECT c.relname, pg_get_userbyid(c.relowner), current_user, "
            "c.relowner = (SELECT oid FROM pg_roles WHERE rolname = current_user) "
            "FROM pg_class AS c "
            "JOIN pg_namespace AS n ON n.oid = c.relnamespace "
            "WHERE n.nspname = :schema_name AND c.relname IN :names "
            "AND c.relkind IN ('r', 'p')"
        ).bindparams(_expanded_names(PROTECTED_TABLES)),
        {"schema_name": schema},
    ).all()
    non_owned = tuple(
        f"{row[0]!r} (owner {row[1]!r})" for row in rows if not row[3]
    )
    if non_owned:
        migration_identity = rows[0][2] if rows else "unknown"
        raise RuntimeError(
            "Supabase Data API lockdown requires migration identity "
            f"{migration_identity!r} to own every protected table before "
            "privilege or RLS changes; non-owned tables: "
            + ", ".join(sorted(non_owned))
        )


def _assert_postconditions(
    connection: sa.Connection,
    schema: str,
    existing_roles: Iterable[str],
) -> None:
    names_bind = _expanded_names(PROTECTED_TABLES)
    insecure_tables = connection.execute(
        sa.text(
            "SELECT c.relname "
            "FROM pg_class AS c "
            "JOIN pg_namespace AS n ON n.oid = c.relnamespace "
            "WHERE n.nspname = :schema_name AND c.relname IN :names "
            "AND (NOT c.relrowsecurity OR c.relforcerowsecurity)"
        ).bindparams(names_bind),
        {"schema_name": schema},
    ).scalars()
    insecure_table_names = tuple(insecure_tables)
    if insecure_table_names:
        raise RuntimeError(
            "Supabase Data API lockdown RLS postcondition failed for: "
            + ", ".join(sorted(insecure_table_names))
        )

    policies = connection.execute(
        sa.text(
            "SELECT p.polname "
            "FROM pg_policy AS p "
            "JOIN pg_class AS c ON c.oid = p.polrelid "
            "JOIN pg_namespace AS n ON n.oid = c.relnamespace "
            "WHERE n.nspname = :schema_name AND c.relname IN :names"
        ).bindparams(_expanded_names(PROTECTED_TABLES)),
        {"schema_name": schema},
    ).scalars()
    policy_names = tuple(policies)
    if policy_names:
        raise RuntimeError(
            "Supabase Data API lockdown must not leave policies on protected tables: "
            + ", ".join(sorted(policy_names))
        )

    public_table_privileges = connection.execute(
        sa.text(
            "SELECT c.relname, privileges.privilege_type "
            "FROM pg_class AS c "
            "JOIN pg_namespace AS n ON n.oid = c.relnamespace "
            "CROSS JOIN LATERAL aclexplode("
            "COALESCE(c.relacl, acldefault('r', c.relowner))) AS privileges "
            "WHERE n.nspname = :schema_name AND c.relname IN :names "
            "AND privileges.grantee = 0"
        ).bindparams(_expanded_names(PROTECTED_TABLES)),
        {"schema_name": schema},
    ).all()
    if public_table_privileges:
        raise RuntimeError(
            "Supabase Data API lockdown left effective PUBLIC table privileges: "
            + repr(public_table_privileges)
        )

    public_column_privileges = connection.execute(
        sa.text(
            "SELECT c.relname, a.attname, privileges.privilege_type "
            "FROM pg_attribute AS a "
            "JOIN pg_class AS c ON c.oid = a.attrelid "
            "JOIN pg_namespace AS n ON n.oid = c.relnamespace "
            "CROSS JOIN LATERAL aclexplode("
            "COALESCE(a.attacl, acldefault('c', c.relowner))) AS privileges "
            "WHERE n.nspname = :schema_name AND c.relname IN :names "
            "AND a.attnum > 0 AND NOT a.attisdropped AND privileges.grantee = 0"
        ).bindparams(_expanded_names(PROTECTED_TABLES)),
        {"schema_name": schema},
    ).all()
    if public_column_privileges:
        raise RuntimeError(
            "Supabase Data API lockdown left effective PUBLIC column privileges: "
            + repr(public_column_privileges)
        )

    public_schema_create = connection.execute(
        sa.text(
            "SELECT privileges.privilege_type "
            "FROM pg_namespace AS n "
            "CROSS JOIN LATERAL aclexplode("
            "COALESCE(n.nspacl, acldefault('n', n.nspowner))) AS privileges "
            "WHERE n.nspname = :schema_name "
            "AND privileges.grantee = 0 AND privileges.privilege_type = 'CREATE'"
        ),
        {"schema_name": schema},
    ).all()
    if public_schema_create:
        raise RuntimeError(
            "Supabase Data API lockdown left effective PUBLIC schema CREATE privilege."
        )

    table_privilege_check = sa.text(
        "SELECT has_table_privilege("
        ":role_name, format('%I.%I', :schema_name, :table_name), :privilege_name)"
    )
    column_privilege_check = sa.text(
        "SELECT has_column_privilege("
        ":role_name, format('%I.%I', :schema_name, :table_name), "
        ":column_name, :privilege_name)"
    )
    table_privileges = _table_privileges(connection)
    for role in existing_roles:
        schema_create_granted = connection.execute(
            sa.text(
                "SELECT has_schema_privilege(:role_name, :schema_name, 'CREATE')"
            ),
            {"role_name": role, "schema_name": schema},
        ).scalar_one()
        if schema_create_granted:
            raise RuntimeError(
                "Supabase Data API lockdown left effective schema CREATE privilege "
                f"for {role!r} on {schema!r}"
            )

        for table in PROTECTED_TABLES:
            for privilege in table_privileges:
                granted = connection.execute(
                    table_privilege_check,
                    {
                        "role_name": role,
                        "schema_name": schema,
                        "table_name": table,
                        "privilege_name": privilege,
                    },
                ).scalar_one()
                if granted:
                    raise RuntimeError(
                        "Supabase Data API lockdown left effective table privilege "
                        f"{privilege} for {role!r} on {schema!r}.{table!r}"
                    )

            for column in _table_columns(connection, schema, table):
                for privilege in COLUMN_PRIVILEGES:
                    granted = connection.execute(
                        column_privilege_check,
                        {
                            "role_name": role,
                            "schema_name": schema,
                            "table_name": table,
                            "column_name": column,
                            "privilege_name": privilege,
                        },
                    ).scalar_one()
                    if granted:
                        raise RuntimeError(
                            "Supabase Data API lockdown left effective column privilege "
                            f"{privilege} for {role!r} on {schema!r}.{table!r}.{column!r}"
                        )


def upgrade() -> None:
    connection = op.get_bind()
    schema = connection.execute(sa.text("SELECT current_schema()")).scalar_one_or_none()
    if not schema:
        raise RuntimeError("Supabase Data API lockdown requires a current schema.")

    _assert_targets_exist(connection, schema)
    _assert_protected_table_ownership(connection, schema)
    existing_roles = _existing_roles(connection)
    grantees = ("PUBLIC", *sorted(existing_roles))

    for table_name in PROTECTED_TABLES:
        table = _qualified_table(schema, table_name)
        columns = _table_columns(connection, schema, table_name)
        connection.execute(sa.text(f"REVOKE ALL PRIVILEGES ON TABLE {table} FROM PUBLIC"))
        for role in sorted(existing_roles):
            connection.execute(
                sa.text(
                    f"REVOKE ALL PRIVILEGES ON TABLE {table} FROM "
                    f"{_quote_identifier(role)}"
                )
            )
        _revoke_column_privileges(connection, table, columns, grantees)
        connection.execute(sa.text(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY"))

    schema_sql = _quote_identifier(schema)
    connection.execute(sa.text(f"REVOKE CREATE ON SCHEMA {schema_sql} FROM PUBLIC"))
    for role in sorted(existing_roles):
        connection.execute(
            sa.text(
                f"REVOKE CREATE ON SCHEMA {schema_sql} FROM {_quote_identifier(role)}"
            )
        )

    owner = connection.execute(sa.text("SELECT current_user")).scalar_one()
    owner_sql = _quote_identifier(owner)
    for object_type in ("TABLES", "SEQUENCES", "FUNCTIONS"):
        connection.execute(
            sa.text(
                f"ALTER DEFAULT PRIVILEGES FOR ROLE {owner_sql} IN SCHEMA {schema_sql} "
                f"REVOKE ALL ON {object_type} FROM PUBLIC"
            )
        )
        for role in sorted(existing_roles):
            connection.execute(
                sa.text(
                    f"ALTER DEFAULT PRIVILEGES FOR ROLE {owner_sql} IN SCHEMA {schema_sql} "
                    f"REVOKE ALL ON {object_type} FROM {_quote_identifier(role)}"
                )
            )

    _assert_postconditions(connection, schema, existing_roles)


def downgrade() -> None:
    raise RuntimeError(
        "Downgrade is intentionally disabled: Supabase Data API lockdown is fail-closed."
    )
