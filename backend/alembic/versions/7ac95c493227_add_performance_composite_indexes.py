"""add performance composite indexes

Revision ID: 7ac95c493227
Revises: a6c42481a0d9
Create Date: 2026-09-04 09:48:00.014973
"""

from alembic import op

# revision identifiers, used by Alembic.
revision = '7ac95c493227'
down_revision = 'a6c42481a0d9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index('ix_audit_logs_created_at', 'audit_logs', ['created_at'], unique=False)
    op.create_index(
        'ix_false_positive_feedbacks_response_question',
        'false_positive_feedbacks',
        ['response_id', 'question_id'],
        unique=False,
    )
    op.create_index(
        'ix_survey_responses_survey_active_created',
        'survey_responses',
        ['survey_id', 'is_deleted', 'created_at'],
        unique=False,
    )
    op.create_index('ix_surveys_created_at', 'surveys', ['created_at'], unique=False)
    op.create_index('ix_users_created_at', 'users', ['created_at'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_users_created_at', table_name='users')
    op.drop_index('ix_surveys_created_at', table_name='surveys')
    op.drop_index('ix_survey_responses_survey_active_created', table_name='survey_responses')
    op.drop_index(
        'ix_false_positive_feedbacks_response_question', table_name='false_positive_feedbacks'
    )
    op.drop_index('ix_audit_logs_created_at', table_name='audit_logs')
