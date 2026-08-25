from datetime import datetime
from uuid import UUID

from sqlalchemy import JSON, Column, ForeignKeyConstraint, UniqueConstraint
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
    )

    survey_id: UUID = Field(foreign_key="surveys.id", index=True, nullable=False)
    distribution_id: UUID | None = Field(default=None, index=True, nullable=True)
    idempotency_key: UUID | None = Field(default=None, index=True, nullable=True)
    idempotency_hash: str | None = Field(default=None, max_length=64, nullable=True)
    consent_version: str | None = Field(default=None, max_length=64, nullable=True)
    consented_at: datetime | None = Field(default=None, nullable=True)
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
