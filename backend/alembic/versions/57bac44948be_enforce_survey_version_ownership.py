"""enforce survey version ownership

Revision ID: 57bac44948be
Revises: 253b93362366
Create Date: 2026-08-21 13:53:14.775957
"""

from alembic import op

# revision identifiers, used by Alembic.
revision = '57bac44948be'
down_revision = '253b93362366'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_foreign_key(
        "fk_survey_distributions_version_owner",
        "survey_distributions",
        "survey_versions",
        ["version_id", "survey_id"],
        ["id", "survey_id"],
    )
    op.create_foreign_key(
        "fk_survey_responses_version_owner",
        "survey_responses",
        "survey_versions",
        ["version_id", "survey_id"],
        ["id", "survey_id"],
    )
    op.create_foreign_key(
        "fk_survey_sections_version_owner",
        "survey_sections",
        "survey_versions",
        ["version_id", "survey_id"],
        ["id", "survey_id"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_survey_sections_version_owner",
        "survey_sections",
        type_="foreignkey",
    )
    op.drop_constraint(
        "fk_survey_responses_version_owner",
        "survey_responses",
        type_="foreignkey",
    )
    op.drop_constraint(
        "fk_survey_distributions_version_owner",
        "survey_distributions",
        type_="foreignkey",
    )
