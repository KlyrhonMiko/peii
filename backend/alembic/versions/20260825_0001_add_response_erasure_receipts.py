"""add response erasure receipts

Revision ID: 20260825_0001
Revises: 20260825_0002
Create Date: 2026-08-25
"""

import sqlalchemy as sa
import sqlmodel

from alembic import op

revision = "20260825_0001"
down_revision = "20260825_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Generated-style table definition for ResponseErasureReceipt.
    op.create_table(
        "response_erasure_receipts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("is_deleted", sa.Boolean(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.Column("performed_by", sa.Uuid(), nullable=True),
        sa.Column("survey_id", sa.Uuid(), nullable=False),
        sa.Column("idempotency_key", sa.Uuid(), nullable=False),
        sa.Column("request_hash", sqlmodel.sql.sqltypes.AutoString(length=64), nullable=False),
        sa.Column("scope", sqlmodel.sql.sqltypes.AutoString(length=20), nullable=False),
        sa.Column("requested_count", sa.Integer(), nullable=False),
        sa.Column("erased_count", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["survey_id"], ["surveys.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "survey_id",
            "idempotency_key",
            name="uq_response_erasure_receipts_survey_idempotency",
        ),
    )
    op.create_index(
        op.f("ix_response_erasure_receipts_id"),
        "response_erasure_receipts",
        ["id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_response_erasure_receipts_is_deleted"),
        "response_erasure_receipts",
        ["is_deleted"],
        unique=False,
    )
    op.create_index(
        op.f("ix_response_erasure_receipts_performed_by"),
        "response_erasure_receipts",
        ["performed_by"],
        unique=False,
    )
    op.create_index(
        op.f("ix_response_erasure_receipts_survey_id"),
        "response_erasure_receipts",
        ["survey_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_response_erasure_receipts_idempotency_key"),
        "response_erasure_receipts",
        ["idempotency_key"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_response_erasure_receipts_idempotency_key"),
        table_name="response_erasure_receipts",
    )
    op.drop_index(
        op.f("ix_response_erasure_receipts_survey_id"),
        table_name="response_erasure_receipts",
    )
    op.drop_index(
        op.f("ix_response_erasure_receipts_performed_by"),
        table_name="response_erasure_receipts",
    )
    op.drop_index(
        op.f("ix_response_erasure_receipts_is_deleted"),
        table_name="response_erasure_receipts",
    )
    op.drop_index(
        op.f("ix_response_erasure_receipts_id"),
        table_name="response_erasure_receipts",
    )
    op.drop_table("response_erasure_receipts")
