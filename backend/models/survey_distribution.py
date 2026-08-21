from datetime import datetime
from uuid import UUID

from sqlalchemy import ForeignKeyConstraint
from sqlmodel import Field

from models.base_model import BaseModel


class SurveyDistribution(BaseModel, table=True):
    __tablename__ = "survey_distributions"
    __table_args__ = (
        ForeignKeyConstraint(
            ["version_id", "survey_id"],
            ["survey_versions.id", "survey_versions.survey_id"],
            name="fk_survey_distributions_version_owner",
        ),
    )

    survey_id: UUID = Field(foreign_key="surveys.id", index=True, nullable=False)
    version_id: UUID = Field(
        foreign_key="survey_versions.id", index=True, nullable=False
    )
    token: str = Field(unique=True, index=True, max_length=64)
    expires_at: datetime | None = Field(default=None, index=True, nullable=True)
    revoked_at: datetime | None = Field(default=None, nullable=True)
