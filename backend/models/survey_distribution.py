from datetime import datetime
from uuid import UUID

from sqlalchemy import UniqueConstraint
from sqlmodel import Field

from models.base_model import BaseModel


class SurveyDistribution(BaseModel, table=True):
    __tablename__ = "survey_distributions"
    __table_args__ = (
        UniqueConstraint("id", "survey_id", name="uq_survey_distributions_id_survey"),
    )

    survey_id: UUID = Field(foreign_key="surveys.id", index=True, nullable=False)
    token_digest: str = Field(index=True, unique=True, max_length=64, nullable=False)
    token_prefix: str | None = Field(default=None, index=True, max_length=8, nullable=True)
    expires_at: datetime | None = Field(default=None, index=True, nullable=True)
    revoked_at: datetime | None = Field(default=None, nullable=True)
