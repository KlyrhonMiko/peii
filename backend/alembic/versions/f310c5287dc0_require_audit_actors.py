"""require audit actors

Revision ID: f310c5287dc0
Revises: 6f8d7931d7ad
Create Date: 2026-08-23 17:45:33.482121
"""

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "f310c5287dc0"
down_revision = "6f8d7931d7ad"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Migrations must be deterministic, so use the documented default system actor
    # rather than reading deployment-time settings.
    op.execute(
        "UPDATE audit_logs "
        "SET performed_by = '00000000-0000-0000-0000-000000000001' "
        "WHERE performed_by IS NULL"
    )
    op.alter_column(
        "audit_logs",
        "performed_by",
        existing_type=sa.UUID(),
        nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "audit_logs",
        "performed_by",
        existing_type=sa.UUID(),
        nullable=True,
    )
