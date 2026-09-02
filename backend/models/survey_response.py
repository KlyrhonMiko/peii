from datetime import datetime
from uuid import UUID

from sqlalchemy import JSON, CheckConstraint, Column, ForeignKeyConstraint, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field

from models.base_model import BaseModel, TimestampedUUIDModel


class SurveyResponse(BaseModel, table=True):
    __tablename__ = "survey_responses"
    __table_args__ = (
        ForeignKeyConstraint(
            ["distribution_id", "survey_id"],
            [
                "survey_distributions.id",
                "survey_distributions.survey_id",
            ],
            name="fk_survey_responses_distribution_survey",
        ),
        UniqueConstraint(
            "distribution_id",
            "idempotency_key",
            name="uq_survey_responses_distribution_idempotency",
        ),
        UniqueConstraint(
            "survey_id",
            "withdrawal_credential_digest",
            name="uq_survey_responses_survey_withdrawal_digest",
        ),
        UniqueConstraint(
            "survey_id",
            "respondent_key_digest",
            name="uq_survey_responses_survey_respondent_key",
        ),
        CheckConstraint(
            "(respondent_key_digest IS NULL AND provider IS NULL AND auth_user_id IS NULL "
            "AND email IS NULL AND display_name IS NULL AND email_verified IS NULL "
            "AND identity_captured_at IS NULL) "
            "OR (respondent_key_digest IS NOT NULL AND provider = 'google' "
            "AND auth_user_id IS NOT NULL AND email IS NOT NULL AND email_verified IS TRUE "
            "AND identity_captured_at IS NOT NULL) "
            "OR (is_deleted IS TRUE AND respondent_key_digest IS NOT NULL "
            "AND provider IS NULL AND auth_user_id IS NULL AND email IS NULL "
            "AND display_name IS NULL AND email_verified IS NULL "
            "AND identity_captured_at IS NULL)",
            name="ck_survey_responses_identity_snapshot_coherent",
        ),
    )

    survey_id: UUID = Field(foreign_key="surveys.id", index=True, nullable=False)
    distribution_id: UUID | None = Field(default=None, index=True, nullable=True)
    idempotency_key: UUID | None = Field(default=None, index=True, nullable=True)
    idempotency_hash: str | None = Field(default=None, max_length=64, nullable=True)
    consent_version: str | None = Field(default=None, max_length=64, nullable=True)
    consented_at: datetime | None = Field(default=None, nullable=True)
    retention_expires_at: datetime | None = Field(
        default=None,
        index=True,
        nullable=True,
    )
    withdrawal_credential_digest: str | None = Field(
        default=None,
        max_length=64,
        index=True,
        nullable=True,
    )
    provider: str | None = Field(default=None, max_length=32, nullable=True)
    auth_user_id: UUID | None = Field(default=None, index=True, nullable=True)
    respondent_key_digest: str | None = Field(
        default=None,
        max_length=64,
        index=True,
        nullable=True,
    )
    email: str | None = Field(default=None, max_length=320, nullable=True)
    display_name: str | None = Field(default=None, max_length=255, nullable=True)
    email_verified: bool | None = Field(default=None, nullable=True)
    identity_captured_at: datetime | None = Field(default=None, nullable=True)
    consent_notice_snapshot: dict[str, object] | None = Field(
        default=None,
        sa_column=Column(JSON().with_variant(JSONB, "postgresql"), nullable=True),
    )
    answers: dict[str, object] = Field(
        sa_column=Column(JSON().with_variant(JSONB, "postgresql"), nullable=False)
    )


class ResponseErasureReceipt(TimestampedUUIDModel, table=True):
    """Durable, non-sensitive idempotency record for a response erasure batch."""

    __tablename__ = "response_erasure_receipts"
    __table_args__ = (
        UniqueConstraint(
            "survey_id",
            "idempotency_key",
            name="uq_response_erasure_receipts_survey_idempotency",
        ),
    )

    survey_id: UUID = Field(foreign_key="surveys.id", index=True, nullable=False)
    idempotency_key: UUID = Field(index=True, nullable=False)
    request_hash: str = Field(max_length=64, nullable=False)
    scope: str = Field(max_length=20, nullable=False)
    requested_count: int = Field(nullable=False)
    erased_count: int = Field(nullable=False)
