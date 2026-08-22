from uuid import UUID

from sqlalchemy import JSON, Column, ForeignKeyConstraint, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field

from models.base_model import BaseModel


class SurveyResponse(BaseModel, table=True):
    __tablename__ = "survey_responses"
    __table_args__ = (
        ForeignKeyConstraint(
            ["distribution_id", "survey_id"],
            [
                "survey_distributions.id",
                "survey_distributions.survey_id",
            ],
            name="fk_survey_responses_distribution_owner",
        ),
        UniqueConstraint(
            "distribution_id",
            "idempotency_key",
            name="uq_survey_responses_distribution_idempotency",
        ),
    )

    survey_id: UUID = Field(foreign_key="surveys.id", index=True, nullable=False)
    distribution_id: UUID | None = Field(
        default=None, index=True, nullable=True
    )
    idempotency_key: UUID | None = Field(default=None, index=True, nullable=True)
    idempotency_hash: str | None = Field(default=None, max_length=64, nullable=True)
    answers: dict[str, object] = Field(
        sa_column=Column(JSON().with_variant(JSONB, "postgresql"), nullable=False)
    )
