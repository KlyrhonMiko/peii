"""create survey tables

Revision ID: f95484540958
Revises: 174808c53bc0
Create Date: 2026-07-11 14:16:33.946141
"""

import sqlalchemy as sa
import sqlmodel
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision = 'f95484540958'
down_revision = '174808c53bc0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('surveys',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('is_deleted', sa.Boolean(), nullable=False),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.Column('performed_by', sa.Uuid(), nullable=True),
        sa.Column('survey_id', sqlmodel.sql.sqltypes.AutoString(length=20), nullable=False),
        sa.Column('title', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column('description', sqlmodel.sql.sqltypes.AutoString(length=1000), nullable=True),
        sa.Column('status', sqlmodel.sql.sqltypes.AutoString(length=20), nullable=False),
        sa.Column('target_cohort', sqlmodel.sql.sqltypes.AutoString(length=100), nullable=True),
        sa.Column('responses_count', sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_surveys_id'), 'surveys', ['id'], unique=False)
    op.create_index(op.f('ix_surveys_is_deleted'), 'surveys', ['is_deleted'], unique=False)
    op.create_index(op.f('ix_surveys_performed_by'), 'surveys', ['performed_by'], unique=False)
    op.create_index(op.f('ix_surveys_status'), 'surveys', ['status'], unique=False)
    op.create_index(op.f('ix_surveys_survey_id'), 'surveys', ['survey_id'], unique=True)

    op.create_table('survey_distributions',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('is_deleted', sa.Boolean(), nullable=False),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.Column('performed_by', sa.Uuid(), nullable=True),
        sa.Column('survey_id', sa.Uuid(), nullable=False),
        sa.Column('token', sqlmodel.sql.sqltypes.AutoString(length=64), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(['survey_id'], ['surveys.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        op.f('ix_survey_distributions_id'), 'survey_distributions', ['id'], unique=False,
    )
    op.create_index(
        op.f('ix_survey_distributions_is_deleted'),
        'survey_distributions', ['is_deleted'], unique=False,
    )
    op.create_index(
        op.f('ix_survey_distributions_performed_by'),
        'survey_distributions', ['performed_by'], unique=False,
    )
    op.create_index(
        op.f('ix_survey_distributions_survey_id'),
        'survey_distributions', ['survey_id'], unique=False,
    )
    op.create_index(
        op.f('ix_survey_distributions_token'), 'survey_distributions', ['token'], unique=True,
    )

    op.create_table('survey_questions',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('is_deleted', sa.Boolean(), nullable=False),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.Column('performed_by', sa.Uuid(), nullable=True),
        sa.Column('survey_id', sa.Uuid(), nullable=False),
        sa.Column('question_text', sqlmodel.sql.sqltypes.AutoString(length=500), nullable=False),
        sa.Column('question_type', sqlmodel.sql.sqltypes.AutoString(length=20), nullable=False),
        sa.Column('options', sqlmodel.sql.sqltypes.AutoString(length=2000), nullable=True),
        sa.Column('order_index', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['survey_id'], ['surveys.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        op.f('ix_survey_questions_id'), 'survey_questions', ['id'], unique=False,
    )
    op.create_index(
        op.f('ix_survey_questions_is_deleted'),
        'survey_questions', ['is_deleted'], unique=False,
    )
    op.create_index(
        op.f('ix_survey_questions_order_index'),
        'survey_questions', ['order_index'], unique=False,
    )
    op.create_index(
        op.f('ix_survey_questions_performed_by'),
        'survey_questions', ['performed_by'], unique=False,
    )
    op.create_index(
        op.f('ix_survey_questions_survey_id'),
        'survey_questions', ['survey_id'], unique=False,
    )

    op.create_table('survey_responses',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('is_deleted', sa.Boolean(), nullable=False),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.Column('performed_by', sa.Uuid(), nullable=True),
        sa.Column('survey_id', sa.Uuid(), nullable=False),
        sa.Column('distribution_id', sa.Uuid(), nullable=True),
        sa.Column('alumni_token', sqlmodel.sql.sqltypes.AutoString(length=64), nullable=False),
        sa.Column('answers', sqlmodel.sql.sqltypes.AutoString(length=10000), nullable=False),
        sa.ForeignKeyConstraint(['distribution_id'], ['survey_distributions.id']),
        sa.ForeignKeyConstraint(['survey_id'], ['surveys.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        op.f('ix_survey_responses_alumni_token'),
        'survey_responses', ['alumni_token'], unique=False,
    )
    op.create_index(
        op.f('ix_survey_responses_id'), 'survey_responses', ['id'], unique=False,
    )
    op.create_index(
        op.f('ix_survey_responses_is_deleted'),
        'survey_responses', ['is_deleted'], unique=False,
    )
    op.create_index(
        op.f('ix_survey_responses_performed_by'),
        'survey_responses', ['performed_by'], unique=False,
    )
    op.create_index(
        op.f('ix_survey_responses_survey_id'),
        'survey_responses', ['survey_id'], unique=False,
    )

    op.alter_column('users', 'created_at',
        existing_type=postgresql.TIMESTAMP(timezone=True),
        type_=sa.DateTime(),
        existing_nullable=False)
    op.alter_column('users', 'updated_at',
        existing_type=postgresql.TIMESTAMP(timezone=True),
        type_=sa.DateTime(),
        existing_nullable=False)
    op.alter_column('users', 'deleted_at',
        existing_type=postgresql.TIMESTAMP(timezone=True),
        type_=sa.DateTime(),
        existing_nullable=True)


def downgrade() -> None:
    op.alter_column('users', 'deleted_at',
        existing_type=sa.DateTime(),
        type_=postgresql.TIMESTAMP(timezone=True),
        existing_nullable=True)
    op.alter_column('users', 'updated_at',
        existing_type=sa.DateTime(),
        type_=postgresql.TIMESTAMP(timezone=True),
        existing_nullable=False)
    op.alter_column('users', 'created_at',
        existing_type=sa.DateTime(),
        type_=postgresql.TIMESTAMP(timezone=True),
        existing_nullable=False)

    op.drop_index(
        op.f('ix_survey_responses_survey_id'), table_name='survey_responses',
    )
    op.drop_index(
        op.f('ix_survey_responses_performed_by'), table_name='survey_responses',
    )
    op.drop_index(
        op.f('ix_survey_responses_is_deleted'), table_name='survey_responses',
    )
    op.drop_index(
        op.f('ix_survey_responses_id'), table_name='survey_responses',
    )
    op.drop_index(
        op.f('ix_survey_responses_alumni_token'), table_name='survey_responses',
    )
    op.drop_table('survey_responses')

    op.drop_index(
        op.f('ix_survey_questions_survey_id'), table_name='survey_questions',
    )
    op.drop_index(
        op.f('ix_survey_questions_performed_by'), table_name='survey_questions',
    )
    op.drop_index(
        op.f('ix_survey_questions_order_index'), table_name='survey_questions',
    )
    op.drop_index(
        op.f('ix_survey_questions_is_deleted'), table_name='survey_questions',
    )
    op.drop_index(
        op.f('ix_survey_questions_id'), table_name='survey_questions',
    )
    op.drop_table('survey_questions')

    op.drop_index(
        op.f('ix_survey_distributions_token'), table_name='survey_distributions',
    )
    op.drop_index(
        op.f('ix_survey_distributions_survey_id'), table_name='survey_distributions',
    )
    op.drop_index(
        op.f('ix_survey_distributions_performed_by'), table_name='survey_distributions',
    )
    op.drop_index(
        op.f('ix_survey_distributions_is_deleted'), table_name='survey_distributions',
    )
    op.drop_index(
        op.f('ix_survey_distributions_id'), table_name='survey_distributions',
    )
    op.drop_table('survey_distributions')

    op.drop_index(
        op.f('ix_surveys_survey_id'), table_name='surveys',
    )
    op.drop_index(
        op.f('ix_surveys_status'), table_name='surveys',
    )
    op.drop_index(
        op.f('ix_surveys_performed_by'), table_name='surveys',
    )
    op.drop_index(
        op.f('ix_surveys_is_deleted'), table_name='surveys',
    )
    op.drop_index(
        op.f('ix_surveys_id'), table_name='surveys',
    )
    op.drop_table('surveys')
