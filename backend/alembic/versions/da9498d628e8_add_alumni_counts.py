"""Add registrar alumni counts, lock them down, and seed their capability.

Revision ID: da9498d628e8
Revises: c2da89bc5ecd
Create Date: 2026-10-11 17:13:51.953914
"""

from datetime import datetime
from uuid import UUID

import sqlalchemy as sa
import sqlmodel

from alembic import op

# revision identifiers, used by Alembic.
revision = "da9498d628e8"
down_revision = "c2da89bc5ecd"
branch_labels = None
depends_on = None

TABLE_NAME = "alumni_counts"
TARGET_ROLES = ("anon", "authenticated", "service_role")
SYSTEM_ACTOR_ID = UUID("00000000-0000-0000-0000-000000000001")
ALUMNI_PERMISSION_ID = UUID("00000000-0000-0000-0000-000000000224")
ADMIN_ROLE_ID = UUID("00000000-0000-0000-0000-000000000101")
ALUMNI_ADMIN_EDGE_ID = UUID("00000000-0000-0000-0000-000000000339")
SEED_TIMESTAMP = datetime(2026, 10, 11)


def _quote_identifier(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


def _lock_down_data_api() -> None:
    """Apply the same policy-free RLS lockdown as the other application tables."""
    connection = op.get_bind()
    if connection.dialect.name != "postgresql":
        return
    schema = connection.execute(sa.text("SELECT current_schema()")).scalar_one()
    table = f"{_quote_identifier(schema)}.{_quote_identifier(TABLE_NAME)}"
    existing_roles = set(
        connection.execute(
            sa.text("SELECT rolname FROM pg_roles WHERE rolname = ANY(:role_names)"),
            {"role_names": list(TARGET_ROLES)},
        ).scalars()
    )
    connection.execute(sa.text(f"REVOKE ALL PRIVILEGES ON TABLE {table} FROM PUBLIC"))
    for role in sorted(existing_roles):
        connection.execute(
            sa.text(f"REVOKE ALL PRIVILEGES ON TABLE {table} FROM {_quote_identifier(role)}")
        )
    connection.execute(sa.text(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY"))

    rls_enabled = connection.execute(
        sa.text(
            "SELECT c.relrowsecurity FROM pg_class AS c "
            "JOIN pg_namespace AS n ON n.oid = c.relnamespace "
            "WHERE n.nspname = :schema_name AND c.relname = :table_name"
        ),
        {"schema_name": schema, "table_name": TABLE_NAME},
    ).scalar_one()
    if not rls_enabled:
        raise RuntimeError("Alumni counts Data API lockdown requires enabled RLS.")
    for role in existing_roles:
        if connection.execute(
            sa.text("SELECT has_table_privilege(:role_name, :table_name, 'SELECT')"),
            {"role_name": role, "table_name": f"{schema}.{TABLE_NAME}"},
        ).scalar_one():
            raise RuntimeError(f"Alumni counts Data API lockdown left SELECT for {role!r}.")


def _seed_permission() -> None:
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
                "id": ALUMNI_PERMISSION_ID,
                "created_at": SEED_TIMESTAMP,
                "updated_at": SEED_TIMESTAMP,
                "is_deleted": False,
                "performed_by": SYSTEM_ACTOR_ID,
                "code": "alumni_counts.manage",
                "description": "View and edit registrar alumni counts.",
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
                "id": ALUMNI_ADMIN_EDGE_ID,
                "created_at": SEED_TIMESTAMP,
                "updated_at": SEED_TIMESTAMP,
                "is_deleted": False,
                "performed_by": SYSTEM_ACTOR_ID,
                "role_id": ADMIN_ROLE_ID,
                "permission_id": ALUMNI_PERMISSION_ID,
            }
        ],
    )


def upgrade() -> None:
    op.create_table(
        TABLE_NAME,
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("is_deleted", sa.Boolean(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.Column("performed_by", sa.Uuid(), nullable=True),
        sa.Column("batch_year", sqlmodel.sql.sqltypes.AutoString(length=4), nullable=False),
        sa.Column(
            "degree_program", sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False
        ),
        sa.Column("total", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "batch_year", "degree_program", name="uq_alumni_counts_batch_degree"
        ),
    )
    op.create_index(op.f("ix_alumni_counts_batch_year"), TABLE_NAME, ["batch_year"], unique=False)
    op.create_index(op.f("ix_alumni_counts_id"), TABLE_NAME, ["id"], unique=False)
    op.create_index(op.f("ix_alumni_counts_is_deleted"), TABLE_NAME, ["is_deleted"], unique=False)
    op.create_index(
        op.f("ix_alumni_counts_performed_by"), TABLE_NAME, ["performed_by"], unique=False
    )
    _lock_down_data_api()
    _seed_permission()


def downgrade() -> None:
    connection = op.get_bind()
    custom_grants = connection.execute(
        sa.text(
            "SELECT count(*) FROM role_permissions "
            "WHERE permission_id = :permission_id AND id <> :seeded_edge_id"
        ),
        {"permission_id": str(ALUMNI_PERMISSION_ID), "seeded_edge_id": str(ALUMNI_ADMIN_EDGE_ID)},
    ).scalar_one()
    if custom_grants:
        raise RuntimeError(
            "Cannot downgrade alumni counts while custom role grants exist. "
            "Remove those grants first."
        )
    connection.execute(
        sa.text("DELETE FROM role_permissions WHERE permission_id = :permission_id"),
        {"permission_id": str(ALUMNI_PERMISSION_ID)},
    )
    connection.execute(
        sa.text("DELETE FROM permissions WHERE id = :permission_id"),
        {"permission_id": str(ALUMNI_PERMISSION_ID)},
    )
    op.drop_index(op.f("ix_alumni_counts_performed_by"), table_name=TABLE_NAME)
    op.drop_index(op.f("ix_alumni_counts_is_deleted"), table_name=TABLE_NAME)
    op.drop_index(op.f("ix_alumni_counts_id"), table_name=TABLE_NAME)
    op.drop_index(op.f("ix_alumni_counts_batch_year"), table_name=TABLE_NAME)
    op.drop_table(TABLE_NAME)
