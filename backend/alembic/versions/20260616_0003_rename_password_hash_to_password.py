"""rename password hash column to password

Revision ID: 20260616_0003
Revises: 20260616_0002
Create Date: 2026-06-16 00:50:00
"""

from alembic import op


# revision identifiers, used by Alembic.
revision = "20260616_0003"
down_revision = "20260616_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("users", "password_hash", new_column_name="password")


def downgrade() -> None:
    op.alter_column("users", "password", new_column_name="password_hash")
