"""improve survey distribution lifecycle

Revision ID: 662aa45ec720
Revises: f5ffd2f1a00b
Create Date: 2026-08-21 12:33:11.484547
"""

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = '662aa45ec720'
down_revision = 'f5ffd2f1a00b'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('survey_distributions', sa.Column('expires_at', sa.DateTime(), nullable=True))
    op.add_column('survey_distributions', sa.Column('revoked_at', sa.DateTime(), nullable=True))
    op.create_index(
        op.f('ix_survey_distributions_expires_at'),
        'survey_distributions',
        ['expires_at'],
        unique=False,
    )
    op.execute(
        "UPDATE survey_distributions "
        "SET revoked_at = updated_at "
        "WHERE is_active = false AND revoked_at IS NULL"
    )
    op.drop_column('survey_distributions', 'is_active')
    op.drop_index(op.f('ix_survey_responses_alumni_token'), table_name='survey_responses')
    op.drop_column('survey_responses', 'alumni_token')
    op.create_check_constraint(
        'ck_surveys_status',
        'surveys',
        "status IN ('Draft', 'Active', 'Closed')",
    )


def downgrade() -> None:
    op.drop_constraint('ck_surveys_status', 'surveys', type_='check')
    op.add_column(
        'survey_responses',
        sa.Column('alumni_token', sa.VARCHAR(length=64), nullable=True),
    )
    op.create_index(
        op.f('ix_survey_responses_alumni_token'),
        'survey_responses',
        ['alumni_token'],
        unique=False,
    )
    op.add_column('survey_distributions', sa.Column('is_active', sa.BOOLEAN(), nullable=True))
    op.execute(
        "UPDATE survey_distributions "
        "SET is_active = CASE WHEN revoked_at IS NULL "
        "AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP) "
        "THEN true ELSE false END"
    )
    op.alter_column('survey_distributions', 'is_active', nullable=False)
    op.drop_index(op.f('ix_survey_distributions_expires_at'), table_name='survey_distributions')
    op.drop_column('survey_distributions', 'revoked_at')
    op.drop_column('survey_distributions', 'expires_at')
