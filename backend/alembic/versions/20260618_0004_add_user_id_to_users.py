"""add user_id to users

Revision ID: 20260618_0004
Revises: 20260616_0003
Create Date: 2026-06-18 00:00:00
"""

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "20260618_0004"
down_revision = "20260616_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("user_id", sa.String(length=20), nullable=True))
    op.execute(
        "UPDATE users SET user_id = 'USER-' || upper(substr(md5(random()::text), 1, 6)) "
        "WHERE user_id IS NULL"
    )
    op.alter_column("users", "user_id", nullable=False)
    op.create_index(op.f("ix_users_user_id"), "users", ["user_id"], unique=True)


def downgrade() -> None:
    op.drop_index(op.f("ix_users_user_id"), table_name="users")
    op.drop_column("users", "user_id")
