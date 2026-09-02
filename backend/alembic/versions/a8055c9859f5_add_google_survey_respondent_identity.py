"""add Google survey respondent identity

Revision ID: a8055c9859f5
Revises: d5a4f7c91e2b
Create Date: 2026-09-01 02:49:54.818329
"""

from collections.abc import Iterable
from datetime import datetime
from uuid import UUID

import sqlalchemy as sa
import sqlmodel

from alembic import op

# revision identifiers, used by Alembic.
revision = 'a8055c9859f5'
down_revision = 'd5a4f7c91e2b'
branch_labels = None
depends_on = None

SYSTEM_ACTOR_ID = UUID("00000000-0000-0000-0000-000000000001")
READ_IDENTITY_PERMISSION_ID = UUID("00000000-0000-0000-0000-000000000222")
ADMIN_ROLE_ID = UUID("00000000-0000-0000-0000-000000000101")
RESEARCHER_ROLE_ID = UUID("00000000-0000-0000-0000-000000000102")
READ_IDENTITY_ADMIN_EDGE_ID = UUID("00000000-0000-0000-0000-000000000335")
READ_IDENTITY_RESEARCHER_EDGE_ID = UUID("00000000-0000-0000-0000-000000000336")
SEED_TIMESTAMP = datetime(2026, 9, 1)
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


def _qualified_table(schema: str, table: str) -> str:
    return f"{_quote_identifier(schema)}.{_quote_identifier(table)}"


def _expanded_names(names: Iterable[str]) -> sa.BindParameter:
    return sa.bindparam("names", value=tuple(names), expanding=True)


def _existing_roles(connection: sa.Connection) -> set[str]:
    statement = sa.text("SELECT rolname FROM pg_roles WHERE rolname IN :names").bindparams(
        _expanded_names(TARGET_ROLES)
    )
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


def _table_privileges(connection: sa.Connection) -> tuple[str, ...]:
    server_version = int(
        connection.execute(sa.text("SHOW server_version_num")).scalar_one()
    )
    if server_version >= 150000:
        return (*TABLE_PRIVILEGES, "MAINTAIN")
    return TABLE_PRIVILEGES


def _lock_down_google_auth_proof_table(connection: sa.Connection) -> None:
    schema = connection.execute(sa.text("SELECT current_schema()")).scalar_one_or_none()
    if not schema:
        raise RuntimeError("Google survey auth proof lockdown requires a current schema.")

    table_name = "google_survey_auth_proofs"
    table = _qualified_table(schema, table_name)
    existing_roles = _existing_roles(connection)
    columns = _table_columns(connection, schema, table_name)
    grantees = ("PUBLIC", *sorted(existing_roles))

    connection.execute(sa.text(f"REVOKE ALL PRIVILEGES ON TABLE {table} FROM PUBLIC"))
    for role in sorted(existing_roles):
        connection.execute(
            sa.text(
                f"REVOKE ALL PRIVILEGES ON TABLE {table} FROM {_quote_identifier(role)}"
            )
        )
    _revoke_column_privileges(connection, table, columns, grantees)
    connection.execute(sa.text(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY"))

    table_state = connection.execute(
        sa.text(
            "SELECT c.relrowsecurity, c.relforcerowsecurity "
            "FROM pg_class AS c "
            "JOIN pg_namespace AS n ON n.oid = c.relnamespace "
            "WHERE n.nspname = :schema_name AND c.relname = :table_name"
        ),
        {"schema_name": schema, "table_name": table_name},
    ).one()
    if not table_state[0] or table_state[1]:
        raise RuntimeError("Google survey auth proof lockdown RLS postcondition failed.")

    policies = connection.execute(
        sa.text(
            "SELECT p.polname "
            "FROM pg_policy AS p "
            "JOIN pg_class AS c ON c.oid = p.polrelid "
            "JOIN pg_namespace AS n ON n.oid = c.relnamespace "
            "WHERE n.nspname = :schema_name AND c.relname = :table_name"
        ),
        {"schema_name": schema, "table_name": table_name},
    ).all()
    if policies:
        raise RuntimeError("Google survey auth proof lockdown must not create policies.")

    public_privileges = connection.execute(
        sa.text(
            "SELECT privileges.privilege_type "
            "FROM pg_class AS c "
            "JOIN pg_namespace AS n ON n.oid = c.relnamespace "
            "CROSS JOIN LATERAL aclexplode("
            "COALESCE(c.relacl, acldefault('r', c.relowner))) AS privileges "
            "WHERE n.nspname = :schema_name AND c.relname = :table_name "
            "AND privileges.grantee = 0"
        ),
        {"schema_name": schema, "table_name": table_name},
    ).all()
    if public_privileges:
        raise RuntimeError("Google survey auth proof lockdown left PUBLIC table privileges.")

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
        for privilege in table_privileges:
            if connection.execute(
                table_privilege_check,
                {
                    "role_name": role,
                    "schema_name": schema,
                    "table_name": table_name,
                    "privilege_name": privilege,
                },
            ).scalar_one():
                raise RuntimeError(
                    "Google survey auth proof lockdown left effective table privilege "
                    f"{privilege} for {role!r}."
                )
        for column in columns:
            for privilege in COLUMN_PRIVILEGES:
                if connection.execute(
                    column_privilege_check,
                    {
                        "role_name": role,
                        "schema_name": schema,
                        "table_name": table_name,
                        "column_name": column,
                        "privilege_name": privilege,
                    },
                ).scalar_one():
                    raise RuntimeError(
                        "Google survey auth proof lockdown left effective column privilege "
                        f"{privilege} for {role!r}.{column!r}."
                    )


def _seed_read_identity_permission() -> None:
    permission_table = sa.table(
        "permissions",
        sa.column("id", sa.Uuid()),
        sa.column("created_at", sa.DateTime()),
        sa.column("updated_at", sa.DateTime()),
        sa.column("is_deleted", sa.Boolean()),
        sa.column("performed_by", sa.Uuid()),
        sa.column("code", sa.String(length=100)),
        sa.column("description", sa.String(length=255)),
    )
    op.bulk_insert(
        permission_table,
        [
            {
                "id": READ_IDENTITY_PERMISSION_ID,
                "created_at": SEED_TIMESTAMP,
                "updated_at": SEED_TIMESTAMP,
                "is_deleted": False,
                "performed_by": SYSTEM_ACTOR_ID,
                "code": "survey_responses.read_identity",
                "description": "View verified respondent identity snapshots.",
            }
        ],
    )

    role_permission_table = sa.table(
        "role_permissions",
        sa.column("id", sa.Uuid()),
        sa.column("created_at", sa.DateTime()),
        sa.column("updated_at", sa.DateTime()),
        sa.column("is_deleted", sa.Boolean()),
        sa.column("performed_by", sa.Uuid()),
        sa.column("role_id", sa.Uuid()),
        sa.column("permission_id", sa.Uuid()),
    )
    op.bulk_insert(
        role_permission_table,
        [
            {
                "id": READ_IDENTITY_ADMIN_EDGE_ID,
                "created_at": SEED_TIMESTAMP,
                "updated_at": SEED_TIMESTAMP,
                "is_deleted": False,
                "performed_by": SYSTEM_ACTOR_ID,
                "role_id": ADMIN_ROLE_ID,
                "permission_id": READ_IDENTITY_PERMISSION_ID,
            },
            {
                "id": READ_IDENTITY_RESEARCHER_EDGE_ID,
                "created_at": SEED_TIMESTAMP,
                "updated_at": SEED_TIMESTAMP,
                "is_deleted": False,
                "performed_by": SYSTEM_ACTOR_ID,
                "role_id": RESEARCHER_ROLE_ID,
                "permission_id": READ_IDENTITY_PERMISSION_ID,
            },
        ],
    )


def upgrade() -> None:
    # ### commands auto generated by Alembic - please adjust! ###
    op.create_table(
        'google_survey_auth_proofs',
        sa.Column('session_id', sa.Uuid(), nullable=False),
        sa.Column('auth_user_id', sa.Uuid(), nullable=False),
        sa.Column(
            'google_subject_digest',
            sqlmodel.sql.sqltypes.AutoString(length=64),
            nullable=False,
        ),
        sa.Column(
            'verified_email',
            sqlmodel.sql.sqltypes.AutoString(length=320),
            nullable=False,
        ),
        sa.Column(
            'display_name',
            sqlmodel.sql.sqltypes.AutoString(length=255),
            nullable=True,
        ),
        sa.Column('email_verified', sa.Boolean(), nullable=False),
        sa.Column('authenticated_at', sa.DateTime(), nullable=False),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            'expires_at > authenticated_at',
            name='ck_google_survey_auth_proofs_expiry_after_authentication',
        ),
        sa.PrimaryKeyConstraint('session_id'),
    )
    op.create_index(
        op.f('ix_google_survey_auth_proofs_auth_user_id'),
        'google_survey_auth_proofs',
        ['auth_user_id'],
        unique=False,
    )
    op.create_index(
        op.f('ix_google_survey_auth_proofs_expires_at'),
        'google_survey_auth_proofs',
        ['expires_at'],
        unique=False,
    )
    _lock_down_google_auth_proof_table(op.get_bind())
    op.add_column(
        'survey_responses',
        sa.Column('provider', sqlmodel.sql.sqltypes.AutoString(length=32), nullable=True),
    )
    op.add_column(
        'survey_responses', sa.Column('auth_user_id', sa.Uuid(), nullable=True)
    )
    op.add_column(
        'survey_responses',
        sa.Column(
            'respondent_key_digest',
            sqlmodel.sql.sqltypes.AutoString(length=64),
            nullable=True,
        ),
    )
    op.add_column(
        'survey_responses',
        sa.Column('email', sqlmodel.sql.sqltypes.AutoString(length=320), nullable=True),
    )
    op.add_column(
        'survey_responses',
        sa.Column('display_name', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True),
    )
    op.add_column('survey_responses', sa.Column('email_verified', sa.Boolean(), nullable=True))
    op.add_column(
        'survey_responses',
        sa.Column('identity_captured_at', sa.DateTime(), nullable=True),
    )
    op.create_index(
        op.f('ix_survey_responses_auth_user_id'),
        'survey_responses',
        ['auth_user_id'],
        unique=False,
    )
    op.create_index(
        op.f('ix_survey_responses_respondent_key_digest'),
        'survey_responses',
        ['respondent_key_digest'],
        unique=False,
    )
    op.create_unique_constraint(
        'uq_survey_responses_survey_respondent_key',
        'survey_responses',
        ['survey_id', 'respondent_key_digest'],
    )
    op.create_check_constraint(
        'ck_survey_responses_identity_snapshot_coherent',
        'survey_responses',
        "(respondent_key_digest IS NULL AND provider IS NULL AND auth_user_id IS NULL "
        "AND email IS NULL AND display_name IS NULL AND email_verified IS NULL "
        "AND identity_captured_at IS NULL) "
        "OR (respondent_key_digest IS NOT NULL AND provider = 'google' "
        "AND auth_user_id IS NOT NULL AND email IS NOT NULL AND email_verified IS TRUE "
        "AND identity_captured_at IS NOT NULL) "
        "OR (is_deleted IS TRUE AND respondent_key_digest IS NOT NULL "
        "AND provider IS NULL AND auth_user_id IS NULL AND email IS NULL "
        "AND display_name IS NULL AND email_verified IS NULL "
        "AND identity_captured_at IS NULL)",
    )
    _seed_read_identity_permission()
    # ### end Alembic commands ###


def downgrade() -> None:
    raise RuntimeError(
        "Downgrade is intentionally disabled: Google survey respondent identity "
        "and auth-proof migration is fail-closed."
    )
