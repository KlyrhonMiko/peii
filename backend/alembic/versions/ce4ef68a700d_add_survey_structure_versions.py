"""add survey structure versions and ownership constraints

Revision ID: ce4ef68a700d
Revises: 662aa45ec720
Create Date: 2026-08-21 13:28:21.928906
"""

from uuid import uuid4

import sqlalchemy as sa

from alembic import op

revision = "ce4ef68a700d"
down_revision = "662aa45ec720"
branch_labels = None
depends_on = None


def _version_id() -> str:
    return f"VER-{uuid4().hex[:16].upper()}"


def upgrade() -> None:
    op.create_table(
        "survey_versions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("is_deleted", sa.Boolean(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.Column("performed_by", sa.Uuid(), nullable=True),
        sa.Column("survey_id", sa.Uuid(), nullable=False),
        sa.Column("version_id", sa.String(length=24), nullable=False),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("structure_revision", sa.Integer(), nullable=False),
        sa.Column("published_at", sa.DateTime(), nullable=True),
        sa.CheckConstraint(
            "status IN ('draft', 'published', 'superseded')",
            name="ck_survey_versions_status",
        ),
        sa.CheckConstraint(
            "structure_revision >= 0",
            name="ck_survey_versions_structure_revision",
        ),
        sa.ForeignKeyConstraint(["survey_id"], ["surveys.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("id", "survey_id", name="uq_survey_versions_id_survey"),
        sa.UniqueConstraint(
            "survey_id", "version_number", name="uq_survey_versions_number"
        ),
    )
    op.create_index("ix_survey_versions_id", "survey_versions", ["id"])
    op.create_index("ix_survey_versions_is_deleted", "survey_versions", ["is_deleted"])
    op.create_index("ix_survey_versions_performed_by", "survey_versions", ["performed_by"])
    op.create_index("ix_survey_versions_published_at", "survey_versions", ["published_at"])
    op.create_index("ix_survey_versions_status", "survey_versions", ["status"])
    op.create_index("ix_survey_versions_survey_id", "survey_versions", ["survey_id"])
    op.create_index("ix_survey_versions_version_id", "survey_versions", ["version_id"], unique=True)

    op.add_column("survey_sections", sa.Column("version_id", sa.Uuid(), nullable=True))
    op.add_column("survey_questions", sa.Column("version_id", sa.Uuid(), nullable=True))
    op.add_column("survey_distributions", sa.Column("version_id", sa.Uuid(), nullable=True))
    op.add_column("survey_responses", sa.Column("version_id", sa.Uuid(), nullable=True))

    conn = op.get_bind()
    surveys = conn.execute(sa.text("SELECT id, status FROM surveys")).fetchall()
    version_by_survey = {}
    for survey_id, survey_status in surveys:
        version_uuid = uuid4()
        version_by_survey[survey_id] = version_uuid
        version_state = "published" if survey_status in ("Active", "Closed") else "draft"
        conn.execute(
            sa.text(
                "INSERT INTO survey_versions "
                "(id, created_at, updated_at, is_deleted, survey_id, version_id, "
                "version_number, status, structure_revision) "
                "VALUES (:id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, false, :survey_id, "
                ":version_id, 1, :status, 0)"
            ),
            {
                "id": version_uuid,
                "survey_id": survey_id,
                "version_id": _version_id(),
                "status": version_state,
            },
        )

    # Repair missing and cross-survey section references before enforcing ownership.
    for survey_id, version_uuid in version_by_survey.items():
        invalid_questions = conn.execute(
            sa.text(
                "SELECT q.id FROM survey_questions q "
                "LEFT JOIN survey_sections s ON s.id = q.section_id "
                "WHERE q.survey_id = :survey_id AND "
                "(q.section_id IS NULL OR s.id IS NULL OR s.survey_id <> :survey_id "
                "OR (q.is_deleted = false AND s.is_deleted = true))"
            ),
            {"survey_id": survey_id},
        ).fetchall()
        if invalid_questions:
            section_uuid = uuid4()
            conn.execute(
                sa.text(
                    "INSERT INTO survey_sections "
                    "(id, created_at, updated_at, is_deleted, survey_id, version_id, "
                    "title, description, order_index) VALUES "
                    "(:id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, false, :survey_id, "
                    ":version_id, 'Recovered Questions', NULL, 999999)"
                ),
                {
                    "id": section_uuid,
                    "survey_id": survey_id,
                    "version_id": version_uuid,
                },
            )
            conn.execute(
                sa.text(
                    "UPDATE survey_questions SET section_id = :section_id "
                    "WHERE id IN (SELECT q.id FROM survey_questions q "
                    "LEFT JOIN survey_sections s ON s.id = q.section_id "
                    "WHERE q.survey_id = :survey_id AND "
                    "(q.section_id IS NULL OR s.id IS NULL OR s.survey_id <> :survey_id "
                    "OR (q.is_deleted = false AND s.is_deleted = true)))"
                ),
                {"section_id": section_uuid, "survey_id": survey_id},
            )

        conn.execute(
            sa.text(
                "UPDATE survey_sections SET version_id = :version_id "
                "WHERE survey_id = :survey_id AND version_id IS NULL"
            ),
            {"survey_id": survey_id, "version_id": version_uuid},
        )
        conn.execute(
            sa.text(
                "UPDATE survey_questions SET version_id = :version_id "
                "WHERE survey_id = :survey_id AND version_id IS NULL"
            ),
            {"survey_id": survey_id, "version_id": version_uuid},
        )
        conn.execute(
            sa.text(
                "UPDATE survey_distributions SET version_id = :version_id "
                "WHERE survey_id = :survey_id AND version_id IS NULL"
            ),
            {"survey_id": survey_id, "version_id": version_uuid},
        )
        conn.execute(
            sa.text(
                "UPDATE survey_responses SET version_id = :version_id "
                "WHERE survey_id = :survey_id AND version_id IS NULL"
            ),
            {"survey_id": survey_id, "version_id": version_uuid},
        )

    conn.execute(
        sa.text("UPDATE survey_questions SET question_type = 'text' WHERE question_type IS NULL")
    )
    conn.execute(
        sa.text(
            "WITH ranked AS (SELECT id, ROW_NUMBER() OVER "
            "(PARTITION BY version_id ORDER BY order_index, created_at, id) - 1 AS new_order "
            "FROM survey_sections WHERE is_deleted = false) "
            "UPDATE survey_sections s SET order_index = ranked.new_order "
            "FROM ranked WHERE s.id = ranked.id"
        )
    )
    conn.execute(
        sa.text(
            "WITH ranked AS (SELECT id, ROW_NUMBER() OVER "
            "(PARTITION BY section_id ORDER BY order_index, created_at, id) - 1 AS new_order "
            "FROM survey_questions WHERE is_deleted = false) "
            "UPDATE survey_questions q SET order_index = ranked.new_order "
            "FROM ranked WHERE q.id = ranked.id"
        )
    )

    op.alter_column("survey_sections", "version_id", nullable=False)
    op.alter_column("survey_questions", "version_id", nullable=False)
    op.alter_column("survey_questions", "section_id", nullable=False)
    op.alter_column("survey_questions", "question_type", nullable=False)
    op.alter_column("survey_distributions", "version_id", nullable=False)
    op.alter_column("survey_responses", "version_id", nullable=False)

    op.create_index("ix_survey_sections_version_id", "survey_sections", ["version_id"])
    op.create_index("ix_survey_questions_version_id", "survey_questions", ["version_id"])
    op.create_index("ix_survey_distributions_version_id", "survey_distributions", ["version_id"])
    op.create_index("ix_survey_responses_version_id", "survey_responses", ["version_id"])
    op.create_unique_constraint(
        "uq_survey_sections_id_survey_version",
        "survey_sections",
        ["id", "survey_id", "version_id"],
    )
    op.create_foreign_key(
        "fk_survey_sections_version_id",
        "survey_sections",
        "survey_versions",
        ["version_id"],
        ["id"],
    )
    op.create_foreign_key(
        "fk_survey_questions_version_id",
        "survey_questions",
        "survey_versions",
        ["version_id"],
        ["id"],
    )
    op.create_foreign_key(
        "fk_survey_questions_section_owner",
        "survey_questions",
        "survey_sections",
        ["section_id", "survey_id", "version_id"],
        ["id", "survey_id", "version_id"],
    )
    op.create_foreign_key(
        "fk_survey_distributions_version_id",
        "survey_distributions",
        "survey_versions",
        ["version_id"],
        ["id"],
    )
    op.create_foreign_key(
        "fk_survey_responses_version_id",
        "survey_responses",
        "survey_versions",
        ["version_id"],
        ["id"],
    )
    op.create_check_constraint(
        "ck_survey_sections_order_index",
        "survey_sections",
        "order_index >= 0",
    )
    op.create_check_constraint(
        "ck_survey_questions_order_index",
        "survey_questions",
        "order_index >= 0",
    )
    op.create_index(
        "uq_survey_sections_active_order",
        "survey_sections",
        ["version_id", "order_index"],
        unique=True,
        postgresql_where=sa.text("is_deleted = false"),
    )
    op.create_index(
        "uq_survey_questions_active_section_order",
        "survey_questions",
        ["section_id", "order_index"],
        unique=True,
        postgresql_where=sa.text("is_deleted = false"),
    )


def downgrade() -> None:
    op.drop_index("uq_survey_questions_active_section_order", table_name="survey_questions")
    op.drop_index("uq_survey_sections_active_order", table_name="survey_sections")
    op.drop_constraint("ck_survey_questions_order_index", "survey_questions", type_="check")
    op.drop_constraint("ck_survey_sections_order_index", "survey_sections", type_="check")
    op.drop_constraint("fk_survey_responses_version_id", "survey_responses", type_="foreignkey")
    op.drop_constraint(
        "fk_survey_distributions_version_id",
        "survey_distributions",
        type_="foreignkey",
    )
    op.drop_constraint("fk_survey_questions_section_owner", "survey_questions", type_="foreignkey")
    op.drop_constraint("fk_survey_questions_version_id", "survey_questions", type_="foreignkey")
    op.drop_constraint("fk_survey_sections_version_id", "survey_sections", type_="foreignkey")
    op.drop_constraint("uq_survey_sections_id_survey_version", "survey_sections", type_="unique")
    op.drop_index("ix_survey_responses_version_id", table_name="survey_responses")
    op.drop_index("ix_survey_distributions_version_id", table_name="survey_distributions")
    op.drop_index("ix_survey_questions_version_id", table_name="survey_questions")
    op.drop_index("ix_survey_sections_version_id", table_name="survey_sections")
    op.drop_column("survey_responses", "version_id")
    op.drop_column("survey_distributions", "version_id")
    op.drop_column("survey_questions", "version_id")
    op.drop_column("survey_sections", "version_id")
    op.drop_index("ix_survey_versions_version_id", table_name="survey_versions")
    op.drop_index("ix_survey_versions_survey_id", table_name="survey_versions")
    op.drop_index("ix_survey_versions_status", table_name="survey_versions")
    op.drop_index("ix_survey_versions_published_at", table_name="survey_versions")
    op.drop_index("ix_survey_versions_performed_by", table_name="survey_versions")
    op.drop_index("ix_survey_versions_is_deleted", table_name="survey_versions")
    op.drop_index("ix_survey_versions_id", table_name="survey_versions")
    op.drop_table("survey_versions")
