"""add survey retention and withdrawal contract

Revision ID: fb1c93d15474
Revises: d1f9bad768ad
Create Date: 2026-08-26 23:34:40.416876
"""

from datetime import timedelta

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = 'fb1c93d15474'
down_revision = 'd1f9bad768ad'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add nullable columns first so this revision is safe for existing rows.
    op.add_column(
        'survey_responses',
        sa.Column('retention_expires_at', sa.DateTime(), nullable=True),
    )
    op.add_column(
        'survey_responses',
        sa.Column('withdrawal_credential_digest', sa.String(length=64), nullable=True),
    )
    op.create_index(
        op.f('ix_survey_responses_retention_expires_at'),
        'survey_responses',
        ['retention_expires_at'],
        unique=False,
    )
    op.create_index(
        op.f('ix_survey_responses_withdrawal_credential_digest'),
        'survey_responses',
        ['withdrawal_credential_digest'],
        unique=False,
    )
    op.create_unique_constraint(
        'uq_survey_responses_survey_withdrawal_digest',
        'survey_responses',
        ['survey_id', 'withdrawal_credential_digest'],
    )
    op.add_column('surveys', sa.Column('retention_enabled', sa.Boolean(), nullable=True))
    op.add_column('surveys', sa.Column('retention_days', sa.Integer(), nullable=True))

    surveys = sa.table(
        'surveys',
        sa.column('id', sa.Uuid()),
        sa.column('retention_enabled', sa.Boolean()),
        sa.column('retention_days', sa.Integer()),
    )
    op.execute(
        surveys.update().values(retention_enabled=True, retention_days=1825)
    )
    op.alter_column('surveys', 'retention_enabled', nullable=False)
    op.alter_column('surveys', 'retention_days', nullable=False)
    op.create_check_constraint(
        'ck_surveys_retention_days_positive',
        'surveys',
        'retention_days >= 1',
    )

    responses = sa.table(
        'survey_responses',
        sa.column('id', sa.Uuid()),
        sa.column('survey_id', sa.Uuid()),
        sa.column('created_at', sa.DateTime()),
        sa.column('retention_expires_at', sa.DateTime()),
    )
    surveys_for_backfill = sa.table(
        'surveys',
        sa.column('id', sa.Uuid()),
        sa.column('retention_enabled', sa.Boolean()),
        sa.column('retention_days', sa.Integer()),
    )
    rows = op.get_bind().execute(
        sa.select(
            responses.c.id,
            responses.c.created_at,
            surveys_for_backfill.c.retention_enabled,
            surveys_for_backfill.c.retention_days,
        )
        .select_from(
            responses.join(
                surveys_for_backfill,
                responses.c.survey_id == surveys_for_backfill.c.id,
            )
        )
        .where(responses.c.retention_expires_at.is_(None))
    )
    for response_id, created_at, retention_enabled, retention_days in rows:
        expires_at = (
            created_at + timedelta(days=retention_days)
            if retention_enabled and created_at is not None
            else None
        )
        op.execute(
            responses.update()
            .where(responses.c.id == response_id)
            .values(retention_expires_at=expires_at)
        )


def downgrade() -> None:
    op.drop_constraint('ck_surveys_retention_days_positive', 'surveys', type_='check')
    op.drop_column('surveys', 'retention_days')
    op.drop_column('surveys', 'retention_enabled')
    op.drop_constraint(
        'uq_survey_responses_survey_withdrawal_digest',
        'survey_responses',
        type_='unique',
    )
    op.drop_index(
        op.f('ix_survey_responses_withdrawal_credential_digest'),
        table_name='survey_responses',
    )
    op.drop_index(
        op.f('ix_survey_responses_retention_expires_at'),
        table_name='survey_responses',
    )
    op.drop_column('survey_responses', 'withdrawal_credential_digest')
    op.drop_column('survey_responses', 'retention_expires_at')
    # ### end Alembic commands ###
