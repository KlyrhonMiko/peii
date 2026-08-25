"""expand distribution security

Revision ID: f77a807cf2f9
Revises: 20260825_v1
Create Date: 2026-08-25 16:55:25.541484
"""

import hashlib

import sqlalchemy as sa
from sqlalchemy import Text
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision = 'f77a807cf2f9'
down_revision = '20260825_v1'
branch_labels = None
depends_on = None


def _backfill_token_security(connection: sa.Connection) -> None:
    """Hash existing distribution tokens without exposing their plaintext values."""
    distributions = sa.table(
        "survey_distributions",
        sa.column("id", sa.Uuid()),
        sa.column("token", sa.String(length=64)),
        sa.column("token_digest", sa.String(length=64)),
        sa.column("token_prefix", sa.String(length=8)),
    )
    rows = connection.execute(
        sa.select(distributions.c.id, distributions.c.token)
        .where(distributions.c.token_digest.is_(None))
        .order_by(distributions.c.id)
    )
    for distribution_id, token in rows:
        digest = hashlib.sha256(token.encode("utf-8")).hexdigest()
        connection.execute(
            sa.update(distributions)
            .where(distributions.c.id == distribution_id)
            .values(token_digest=digest, token_prefix=token[:8])
        )


def upgrade() -> None:
    # The canonical 20260825_v1 baseline already makes expires_at non-null; no
    # expiry remediation is required for that baseline.
    op.add_column(
        "survey_distributions",
        sa.Column("token_digest", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "survey_distributions",
        sa.Column("token_prefix", sa.String(length=8), nullable=True),
    )
    _backfill_token_security(op.get_bind())
    # PostgreSQL unique indexes permit multiple NULLs, so this enforces uniqueness
    # only for populated digests while keeping the compatibility column nullable.
    op.create_index(
        "ix_survey_distributions_token_digest",
        "survey_distributions",
        ["token_digest"],
        unique=True,
    )
    op.create_index(
        "ix_survey_distributions_token_prefix",
        "survey_distributions",
        ["token_prefix"],
        unique=False,
    )
    op.add_column(
        "survey_responses",
        sa.Column("consent_version", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "survey_responses",
        sa.Column("consented_at", sa.DateTime(), nullable=True),
    )
    op.add_column(
        "survey_responses",
        sa.Column(
            "consent_notice_snapshot",
            sa.JSON().with_variant(postgresql.JSONB(astext_type=Text()), "postgresql"),
            nullable=True,
        ),
    )
    # Rolling deployment gate: retain plaintext token and do not add the destructive
    # remove-plaintext revision until every application instance supports digest reads.


def downgrade() -> None:
    op.drop_column("survey_responses", "consent_notice_snapshot")
    op.drop_column("survey_responses", "consented_at")
    op.drop_column("survey_responses", "consent_version")
    op.drop_index("ix_survey_distributions_token_prefix", table_name="survey_distributions")
    op.drop_index("ix_survey_distributions_token_digest", table_name="survey_distributions")
    op.drop_column("survey_distributions", "token_prefix")
    op.drop_column("survey_distributions", "token_digest")
