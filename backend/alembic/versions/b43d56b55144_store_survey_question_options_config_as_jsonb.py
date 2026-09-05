"""Store survey question options/config as JSONB.

Stores ``survey_questions.options`` and ``survey_questions.config`` as JSONB
instead of JSON-encoded text so reads and writes no longer pay ser/de str
round-trips at the database boundary. Existing rows are converted in place
via the ``::jsonb`` cast; valid JSON text rows convert cleanly and NULLs are
preserved.

Revision ID: b43d56b55144
Revises: 7ac95c493227
Create Date: 2026-09-04
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision = 'b43d56b55144'
down_revision = '7ac95c493227'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        'survey_questions',
        'options',
        existing_type=sa.String(length=2000),
        type_=postgresql.JSONB(astext_type=sa.Text()),
        existing_nullable=True,
        postgresql_using='options::jsonb',
    )
    op.alter_column(
        'survey_questions',
        'config',
        existing_type=sa.String(length=2000),
        type_=postgresql.JSONB(astext_type=sa.Text()),
        existing_nullable=True,
        postgresql_using='config::jsonb',
    )


def downgrade() -> None:
    op.alter_column(
        'survey_questions',
        'options',
        existing_type=postgresql.JSONB(astext_type=sa.Text()),
        type_=sa.String(length=2000),
        existing_nullable=True,
        postgresql_using='options::text',
    )
    op.alter_column(
        'survey_questions',
        'config',
        existing_type=postgresql.JSONB(astext_type=sa.Text()),
        type_=sa.String(length=2000),
        existing_nullable=True,
        postgresql_using='config::text',
    )
