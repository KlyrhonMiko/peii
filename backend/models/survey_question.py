from uuid import UUID

from sqlalchemy import String
from sqlmodel import Column, Field

from models.base_model import BaseModel
from models.question_type import QuestionType


class SurveyQuestion(BaseModel, table=True):
    __tablename__ = "survey_questions"

    survey_id: UUID = Field(foreign_key="surveys.id", index=True, nullable=False)
    section_id: UUID | None = Field(
        default=None, foreign_key="survey_sections.id", index=True
    )
    question_text: str = Field(max_length=500)
    question_type: QuestionType = Field(sa_column=Column(String(20)))
    options: str | None = Field(default=None, max_length=2000)
    config: str | None = Field(default=None, max_length=2000)
    order_index: int = Field(default=0, nullable=False, index=True)
    is_required: bool = Field(default=True, nullable=False)
