"""Lock down false-positive feedbacks in the Supabase Data API.

Revision ID: bf21a63040a2
Revises: b43d56b55144
Create Date: 2026-09-10 23:19:37.714490
"""

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "bf21a63040a2"
down_revision = "b43d56b55144"
branch_labels = None
depends_on = None

TABLE_NAME = "false_positive_feedbacks"
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
    return '"' + identifier.replace('"', '""') + '"'


def _qualified_table(schema: str) -> str:
    return f"{_quote_identifier(schema)}.{_quote_identifier(TABLE_NAME)}"


def _existing_roles(connection: sa.Connection) -> set[str]:
    rows = connection.execute(
        sa.text("SELECT rolname FROM pg_roles WHERE rolname = ANY(:role_names)"),
        {"role_names": list(TARGET_ROLES)},
    ).scalars()
    return set(rows)


def _table_columns(connection: sa.Connection, schema: str) -> tuple[str, ...]:
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
        {"schema_name": schema, "table_name": TABLE_NAME},
    ).scalars()
    return tuple(rows)


def _assert_table_is_owned(connection: sa.Connection, schema: str) -> None:
    row = connection.execute(
        sa.text(
            "SELECT pg_get_userbyid(c.relowner), current_user, "
            "c.relowner = (SELECT oid FROM pg_roles WHERE rolname = current_user) "
            "FROM pg_class AS c "
            "JOIN pg_namespace AS n ON n.oid = c.relnamespace "
            "WHERE n.nspname = :schema_name AND c.relname = :table_name "
            "AND c.relkind IN ('r', 'p')"
        ),
        {"schema_name": schema, "table_name": TABLE_NAME},
    ).one_or_none()
    if row is None:
        raise RuntimeError(
            "False-positive feedback Data API lockdown requires "
            f"{schema!r}.{TABLE_NAME!r} to exist."
        )
    if not row[2]:
        raise RuntimeError(
            "False-positive feedback Data API lockdown requires migration identity "
            f"{row[1]!r} to own {schema!r}.{TABLE_NAME!r} before privilege or RLS changes "
            f"(owner: {row[0]!r})."
        )


def _table_privileges(connection: sa.Connection) -> tuple[str, ...]:
    server_version = int(
        connection.execute(sa.text("SHOW server_version_num")).scalar_one()
    )
    if server_version >= 170000:
        return (*TABLE_PRIVILEGES, "MAINTAIN")
    return TABLE_PRIVILEGES


def _assert_postconditions(
    connection: sa.Connection,
    schema: str,
    existing_roles: set[str],
) -> None:
    table_state = connection.execute(
        sa.text(
            "SELECT c.relrowsecurity, c.relforcerowsecurity "
            "FROM pg_class AS c "
            "JOIN pg_namespace AS n ON n.oid = c.relnamespace "
            "WHERE n.nspname = :schema_name AND c.relname = :table_name "
            "AND c.relkind IN ('r', 'p')"
        ),
        {"schema_name": schema, "table_name": TABLE_NAME},
    ).one()
    if not table_state[0] or table_state[1]:
        raise RuntimeError(
            "False-positive feedback Data API lockdown requires enabled, non-forced RLS."
        )

    policies = connection.execute(
        sa.text(
            "SELECT p.polname FROM pg_policy AS p "
            "JOIN pg_class AS c ON c.oid = p.polrelid "
            "JOIN pg_namespace AS n ON n.oid = c.relnamespace "
            "WHERE n.nspname = :schema_name AND c.relname = :table_name"
        ),
        {"schema_name": schema, "table_name": TABLE_NAME},
    ).scalars()
    if tuple(policies):
        raise RuntimeError("False-positive feedback Data API lockdown must not leave policies.")

    public_table_privileges = connection.execute(
        sa.text(
            "SELECT privileges.privilege_type "
            "FROM pg_class AS c "
            "JOIN pg_namespace AS n ON n.oid = c.relnamespace "
            "CROSS JOIN LATERAL aclexplode("
            "COALESCE(c.relacl, acldefault('r', c.relowner))) AS privileges "
            "WHERE n.nspname = :schema_name AND c.relname = :table_name "
            "AND privileges.grantee = 0"
        ),
        {"schema_name": schema, "table_name": TABLE_NAME},
    ).all()
    if public_table_privileges:
        raise RuntimeError(
            "False-positive feedback Data API lockdown left effective PUBLIC table privileges."
        )

    public_column_privileges = connection.execute(
        sa.text(
            "SELECT a.attname, privileges.privilege_type "
            "FROM pg_attribute AS a "
            "JOIN pg_class AS c ON c.oid = a.attrelid "
            "JOIN pg_namespace AS n ON n.oid = c.relnamespace "
            "CROSS JOIN LATERAL aclexplode("
            "COALESCE(a.attacl, acldefault('c', c.relowner))) AS privileges "
            "WHERE n.nspname = :schema_name AND c.relname = :table_name "
            "AND a.attnum > 0 AND NOT a.attisdropped AND privileges.grantee = 0"
        ),
        {"schema_name": schema, "table_name": TABLE_NAME},
    ).all()
    if public_column_privileges:
        raise RuntimeError(
            "False-positive feedback Data API lockdown left effective PUBLIC column privileges."
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
    for role in existing_roles:
        for privilege in _table_privileges(connection):
            if connection.execute(
                table_privilege_check,
                {
                    "role_name": role,
                    "schema_name": schema,
                    "table_name": TABLE_NAME,
                    "privilege_name": privilege,
                },
            ).scalar_one():
                raise RuntimeError(
                    "False-positive feedback Data API lockdown left effective table "
                    f"privilege {privilege} for {role!r}."
                )
        for column in _table_columns(connection, schema):
            for privilege in COLUMN_PRIVILEGES:
                if connection.execute(
                    column_privilege_check,
                    {
                        "role_name": role,
                        "schema_name": schema,
                        "table_name": TABLE_NAME,
                        "column_name": column,
                        "privilege_name": privilege,
                    },
                ).scalar_one():
                    raise RuntimeError(
                        "False-positive feedback Data API lockdown left effective column "
                        f"privilege {privilege} for {role!r} on {column!r}."
                    )


def upgrade() -> None:
    connection = op.get_bind()
    schema = connection.execute(sa.text("SELECT current_schema()")).scalar_one_or_none()
    if not schema:
        raise RuntimeError("False-positive feedback Data API lockdown requires a current schema.")

    _assert_table_is_owned(connection, schema)
    existing_roles = _existing_roles(connection)
    table = _qualified_table(schema)
    columns = _table_columns(connection, schema)

    connection.execute(sa.text(f"REVOKE ALL PRIVILEGES ON TABLE {table} FROM PUBLIC"))
    for role in sorted(existing_roles):
        connection.execute(
            sa.text(
                f"REVOKE ALL PRIVILEGES ON TABLE {table} FROM {_quote_identifier(role)}"
            )
        )
    for column in columns:
        quoted_column = _quote_identifier(column)
        for grantee in ("PUBLIC", *sorted(existing_roles)):
            grantee_sql = "PUBLIC" if grantee == "PUBLIC" else _quote_identifier(grantee)
            for privilege in COLUMN_PRIVILEGES:
                connection.execute(
                    sa.text(
                        f"REVOKE {privilege} ({quoted_column}) ON TABLE {table} "
                        f"FROM {grantee_sql}"
                    )
                )
    connection.execute(sa.text(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY"))

    _assert_postconditions(connection, schema, existing_roles)


def downgrade() -> None:
    raise RuntimeError(
        "Downgrade is intentionally disabled: false-positive feedback lockdown is fail-closed."
    )
