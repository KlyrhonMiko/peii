"""Drop survey_distributions

Revision ID: f88b9c1d0000
Revises: b9055c9859f6
Create Date: 2026-09-02 15:38:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'f88b9c1d0000'
down_revision: Union[str, None] = 'b9055c9859f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Remove distribution_id from survey_responses
    op.drop_constraint('uq_survey_responses_distribution_idempotency', 'survey_responses', type_='unique')
    op.drop_constraint('fk_survey_responses_distribution_survey', 'survey_responses', type_='foreignkey')
    op.drop_index('ix_survey_responses_distribution_id', table_name='survey_responses')
    op.drop_column('survey_responses', 'distribution_id')
    
    # Create the new constraint
    op.create_unique_constraint('uq_survey_responses_survey_idempotency', 'survey_responses', ['survey_id', 'idempotency_key'])

    # Drop survey_distributions table
    op.drop_index('ix_survey_distributions_survey_id', table_name='survey_distributions')
    op.drop_table('survey_distributions')


def downgrade() -> None:
    pass
