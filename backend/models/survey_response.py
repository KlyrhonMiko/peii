from uuid import UUID

from sqlmodel import Field

from models.base_model import BaseModel


class SurveyResponse(BaseModel, table=True):
    __tablename__ = "survey_responses"

    survey_id: UUID = Field(foreign_key="surveys.id", index=True, nullable=False)
    distribution_id: UUID | None = Field(
        foreign_key="survey_distributions.id", default=None, nullable=True
    )
    alumni_token: str = Field(max_length=64, index=True)
    answers: str = Field(max_length=10000)
