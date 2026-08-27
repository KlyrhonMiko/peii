"""remove plaintext distribution tokens

Revision ID: 2bf09a6bc738
Revises: fb1c93d15474
Create Date: 2026-08-27 18:45:22.676209
"""

import hashlib

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "2bf09a6bc738"
down_revision = "fb1c93d15474"
branch_labels = None
depends_on = None


def upgrade() -> None:
    distributions = sa.table(
        "survey_distributions",
        sa.column("id", sa.Uuid()),
        sa.column("token", sa.String(length=64)),
        sa.column("token_digest", sa.String(length=64)),
        sa.column("token_prefix", sa.String(length=8)),
    )
    connection = op.get_bind()
    rows = connection.execute(
        sa.select(
            distributions.c.id,
            distributions.c.token,
            distributions.c.token_digest,
            distributions.c.token_prefix,
        ).order_by(distributions.c.id)
    )
    for distribution_id, token, token_digest, token_prefix in rows:
        if token is None:
            raise RuntimeError("Existing distribution row has no plaintext token to digest.")
        expected_digest = hashlib.sha256(token.encode("utf-8")).hexdigest()
        expected_prefix = token[:8]
        if token_digest is not None and token_digest != expected_digest:
            raise RuntimeError("Existing distribution token digest does not match its token.")
        if token_prefix is not None and token_prefix != expected_prefix:
            raise RuntimeError("Existing distribution token prefix does not match its token.")
        if token_digest is None or token_prefix is None:
            connection.execute(
                sa.update(distributions)
                .where(distributions.c.id == distribution_id)
                .values(
                    token_digest=expected_digest,
                    token_prefix=expected_prefix,
                )
            )

    remaining_nulls = connection.execute(
        sa.select(sa.func.count())
        .select_from(distributions)
        .where(distributions.c.token_digest.is_(None))
    ).scalar_one()
    if remaining_nulls:
        raise RuntimeError("Existing distribution rows could not be backfilled with token digests.")

    op.alter_column(
        "survey_distributions",
        "token_digest",
        existing_type=sa.VARCHAR(length=64),
        nullable=False,
    )
    op.drop_index(op.f("ix_survey_distributions_token"), table_name="survey_distributions")
    op.drop_column("survey_distributions", "token")


def downgrade() -> None:
    raise RuntimeError(
        "Downgrade is irreversible: plaintext distribution tokens cannot be reconstructed."
    )
