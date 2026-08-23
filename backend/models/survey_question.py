from uuid import UUID

from sqlalchemy import Boolean, CheckConstraint, ForeignKeyConstraint, Index, String, text
from sqlmodel import Column, Field

from models.base_model import BaseModel
from models.question_type import QuestionType


class SurveyQuestion(BaseModel, table=True):
    __tablename__ = "survey_questions"
    __table_args__ = (
        ForeignKeyConstraint(
            ["section_id", "survey_id"],
            ["survey_sections.id", "survey_sections.survey_id"],
            name="fk_survey_questions_section_owner",
        ),
        CheckConstraint("order_index >= 0", name="ck_survey_questions_order_index"),
        Index(
            "uq_survey_questions_active_section_order",
            "section_id",
            "order_index",
            unique=True,
            postgresql_where=text("is_deleted = false"),
            sqlite_where=text("is_deleted = 0"),
        ),
    )

    survey_id: UUID = Field(foreign_key="surveys.id", index=True, nullable=False)
    section_id: UUID = Field(foreign_key="survey_sections.id", index=True, nullable=False)
    question_text: str = Field(max_length=500)
    question_type: QuestionType = Field(sa_column=Column(String(20), nullable=False))
    options: str | None = Field(default=None, max_length=2000)
    config: str | None = Field(default=None, max_length=2000)
    order_index: int = Field(default=0, nullable=False, index=True)
    is_required: bool = Field(
        default=True,
        sa_column=Column(Boolean, nullable=False, server_default=text("true")),
    )
