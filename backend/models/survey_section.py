from uuid import UUID

from sqlmodel import Field

from models.base_model import BaseModel


class SurveySection(BaseModel, table=True):
    __tablename__ = "survey_sections"

    survey_id: UUID = Field(foreign_key="surveys.id", index=True, nullable=False)
    title: str = Field(max_length=255)
    description: str | None = Field(default=None, max_length=1000)
    order_index: int = Field(default=0, nullable=False, index=True)
