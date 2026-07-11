from uuid import UUID

from sqlmodel import Field

from models.base_model import BaseModel


class SurveyDistribution(BaseModel, table=True):
    __tablename__ = "survey_distributions"

    survey_id: UUID = Field(foreign_key="surveys.id", index=True, nullable=False)
    token: str = Field(unique=True, index=True, max_length=64)
    is_active: bool = Field(default=True, nullable=False)
