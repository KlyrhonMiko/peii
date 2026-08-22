"""remove survey versioning

Revision ID: 5b37d61c76ff
Revises: 72bd1300e341
Create Date: 2026-08-22 17:54:16.593444
"""

import sqlalchemy as sa

from alembic import op

revision = "5b37d61c76ff"
down_revision = "72bd1300e341"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Remove version ownership before removing the version columns and table.
    op.drop_constraint(
        "fk_survey_responses_distribution_owner",
        "survey_responses",
        type_="foreignkey",
    )
    op.drop_constraint("fk_survey_responses_version_owner", "survey_responses", type_="foreignkey")
    op.drop_constraint("fk_survey_responses_version_id", "survey_responses", type_="foreignkey")
    op.drop_constraint(
        "fk_survey_distributions_version_owner",
        "survey_distributions",
        type_="foreignkey",
    )
    op.drop_constraint(
        "fk_survey_distributions_version_id", "survey_distributions", type_="foreignkey"
    )
    op.drop_constraint("fk_survey_questions_section_owner", "survey_questions", type_="foreignkey")
    op.drop_constraint("fk_survey_questions_version_id", "survey_questions", type_="foreignkey")
    op.drop_constraint("fk_survey_sections_version_owner", "survey_sections", type_="foreignkey")
    op.drop_constraint("fk_survey_sections_version_id", "survey_sections", type_="foreignkey")

    op.drop_constraint(
        "uq_survey_distributions_owner_reference",
        "survey_distributions",
        type_="unique",
    )
    op.drop_constraint(
        "uq_survey_sections_id_survey_version",
        "survey_sections",
        type_="unique",
    )
    op.drop_index("uq_survey_sections_active_order", table_name="survey_sections")

    op.drop_index("ix_survey_responses_version_id", table_name="survey_responses")
    op.drop_column("survey_responses", "version_id")
    op.drop_index("ix_survey_distributions_version_id", table_name="survey_distributions")
    op.drop_column("survey_distributions", "version_id")
    op.drop_index("ix_survey_questions_version_id", table_name="survey_questions")
    op.drop_column("survey_questions", "version_id")
    op.drop_index("ix_survey_sections_version_id", table_name="survey_sections")
    op.drop_column("survey_sections", "version_id")

    for index_name in (
        "uq_survey_versions_active_published",
        "uq_survey_versions_active_draft",
        "ix_survey_versions_version_id",
        "ix_survey_versions_survey_id",
        "ix_survey_versions_status",
        "ix_survey_versions_published_at",
        "ix_survey_versions_performed_by",
        "ix_survey_versions_is_deleted",
        "ix_survey_versions_id",
    ):
        op.drop_index(index_name, table_name="survey_versions")
    op.drop_table("survey_versions")

    op.create_unique_constraint(
        "uq_survey_sections_id_survey", "survey_sections", ["id", "survey_id"]
    )
    op.create_unique_constraint(
        "uq_survey_distributions_owner_reference",
        "survey_distributions",
        ["id", "survey_id"],
    )
    op.create_foreign_key(
        "fk_survey_questions_section_owner",
        "survey_questions",
        "survey_sections",
        ["section_id", "survey_id"],
        ["id", "survey_id"],
    )
    op.create_foreign_key(
        "fk_survey_responses_distribution_owner",
        "survey_responses",
        "survey_distributions",
        ["distribution_id", "survey_id"],
        ["id", "survey_id"],
    )
    op.create_index(
        "uq_survey_sections_active_order",
        "survey_sections",
        ["survey_id", "order_index"],
        unique=True,
        postgresql_where=sa.text("is_deleted = false"),
        sqlite_where=sa.text("is_deleted = 0"),
    )

    op.drop_constraint("ck_surveys_status", "surveys", type_="check")
    op.execute("UPDATE surveys SET status = 'Inactive' WHERE status = 'Draft'")
    op.create_check_constraint(
        "ck_surveys_status",
        "surveys",
        "status IN ('Inactive', 'Active', 'Closed')",
    )


def downgrade() -> None:
    raise RuntimeError("Survey versioning was intentionally removed and cannot be restored.")
