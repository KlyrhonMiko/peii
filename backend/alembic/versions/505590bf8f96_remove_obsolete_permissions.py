"""remove obsolete permissions

Revision ID: 505590bf8f96
Revises: f310c5287dc0
Create Date: 2026-08-24 10:39:40.240012
"""

from typing import Any

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = '505590bf8f96'
down_revision = 'f310c5287dc0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    obsolete_codes = ("analytics.read", "survey_responses.read_aggregates")
    bind = op.get_bind()
    permission_ids: Any = sa.select(sa.column("id")).select_from(
        sa.table("permissions", sa.column("id"), sa.column("code"))
    ).where(sa.column("code").in_(obsolete_codes))
    bind.execute(
        sa.delete(sa.table("role_permissions", sa.column("permission_id"))).where(
            sa.column("permission_id").in_(permission_ids)
        )
    )
    bind.execute(
        sa.delete(sa.table("permissions", sa.column("code"))).where(
            sa.column("code").in_(obsolete_codes)
        )
    )


def downgrade() -> None:
    # The catalog seed is the source of truth; removed unused permissions are not restored.
    pass
