"""Add is_template to surveys

Revision ID: b9055c9859f6
Revises: a8055c9859f5
Create Date: 2026-09-02 14:38:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = 'b9055c9859f6'
down_revision: Union[str, None] = 'a8055c9859f5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('surveys', sa.Column('is_template', sa.Boolean(), server_default=sa.text('false'), nullable=False))
    op.create_index(op.f('ix_surveys_is_template'), 'surveys', ['is_template'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_surveys_is_template'), table_name='surveys')
    op.drop_column('surveys', 'is_template')
