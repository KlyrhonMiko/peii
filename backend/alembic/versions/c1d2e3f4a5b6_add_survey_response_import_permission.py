"""Seed the survey response import capability for portal roles.

Revision ID: c1d2e3f4a5b6
Revises: bf21a63040a2
Create Date: 2026-09-16
"""

from datetime import datetime
from uuid import UUID

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "c1d2e3f4a5b6"
down_revision = "bf21a63040a2"
branch_labels = None
depends_on = None

SYSTEM_ACTOR_ID = UUID("00000000-0000-0000-0000-000000000001")
IMPORT_PERMISSION_ID = UUID("00000000-0000-0000-0000-000000000223")
ADMIN_ROLE_ID = UUID("00000000-0000-0000-0000-000000000101")
RESEARCHER_ROLE_ID = UUID("00000000-0000-0000-0000-000000000102")
IMPORT_ADMIN_EDGE_ID = UUID("00000000-0000-0000-0000-000000000337")
IMPORT_RESEARCHER_EDGE_ID = UUID("00000000-0000-0000-0000-000000000338")
SEEDED_EDGE_IDS = frozenset({IMPORT_ADMIN_EDGE_ID, IMPORT_RESEARCHER_EDGE_ID})
SEED_TIMESTAMP = datetime(2026, 9, 16)


def upgrade() -> None:
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
                "id": IMPORT_PERMISSION_ID,
                "created_at": SEED_TIMESTAMP,
                "updated_at": SEED_TIMESTAMP,
                "is_deleted": False,
                "performed_by": SYSTEM_ACTOR_ID,
                "code": "survey_responses.import",
                "description": "Import survey responses.",
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
                "id": IMPORT_ADMIN_EDGE_ID,
                "created_at": SEED_TIMESTAMP,
                "updated_at": SEED_TIMESTAMP,
                "is_deleted": False,
                "performed_by": SYSTEM_ACTOR_ID,
                "role_id": ADMIN_ROLE_ID,
                "permission_id": IMPORT_PERMISSION_ID,
            },
            {
                "id": IMPORT_RESEARCHER_EDGE_ID,
                "created_at": SEED_TIMESTAMP,
                "updated_at": SEED_TIMESTAMP,
                "is_deleted": False,
                "performed_by": SYSTEM_ACTOR_ID,
                "role_id": RESEARCHER_ROLE_ID,
                "permission_id": IMPORT_PERMISSION_ID,
            },
        ],
    )


def downgrade() -> None:
    connection = op.get_bind()
    result = connection.execute(
        sa.text("SELECT id FROM role_permissions WHERE permission_id = :permission_id"),
        {"permission_id": str(IMPORT_PERMISSION_ID)},
    )
    edge_ids = {UUID(str(edge_id)) for edge_id in result.scalars()}
    unexpected_edge_ids = edge_ids - SEEDED_EDGE_IDS
    if unexpected_edge_ids:
        raise RuntimeError(
            "Cannot downgrade survey response import permission while custom role grants "
            "exist. Remove those grants first."
        )

    connection.execute(
        sa.text("DELETE FROM role_permissions WHERE permission_id = :permission_id"),
        {"permission_id": str(IMPORT_PERMISSION_ID)},
    )
    connection.execute(
        sa.text("DELETE FROM permissions WHERE id = :permission_id"),
        {"permission_id": str(IMPORT_PERMISSION_ID)},
    )
