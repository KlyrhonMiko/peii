from uuid import UUID

from sqlalchemy import CheckConstraint, Index, UniqueConstraint, text
from sqlmodel import Field

from models.base_model import BaseModel


class SurveySection(BaseModel, table=True):
    __tablename__ = "survey_sections"
    __table_args__ = (
        UniqueConstraint("id", "survey_id", name="uq_survey_sections_id_survey"),
        CheckConstraint("order_index >= 0", name="ck_survey_sections_order_index"),
        Index(
            "uq_survey_sections_active_order",
            "survey_id",
            "order_index",
            unique=True,
            postgresql_where=text("is_deleted = false"),
            sqlite_where=text("is_deleted = 0"),
        ),
    )

    survey_id: UUID = Field(foreign_key="surveys.id", index=True, nullable=False)
    title: str = Field(max_length=255)
    description: str | None = Field(default=None, max_length=3000)
    order_index: int = Field(default=0, nullable=False, index=True)
