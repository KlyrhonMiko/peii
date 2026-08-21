from uuid import UUID

from sqlalchemy import ForeignKeyConstraint
from sqlmodel import Field

from models.base_model import BaseModel


class SurveyResponse(BaseModel, table=True):
    __tablename__ = "survey_responses"
    __table_args__ = (
        ForeignKeyConstraint(
            ["version_id", "survey_id"],
            ["survey_versions.id", "survey_versions.survey_id"],
            name="fk_survey_responses_version_owner",
        ),
    )

    survey_id: UUID = Field(foreign_key="surveys.id", index=True, nullable=False)
    version_id: UUID = Field(
        foreign_key="survey_versions.id", index=True, nullable=False
    )
    distribution_id: UUID | None = Field(
        foreign_key="survey_distributions.id", default=None, nullable=True
    )
    answers: str = Field(max_length=10000)
