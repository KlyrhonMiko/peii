from sqlalchemy import CheckConstraint
from sqlmodel import Field

from models.base_model import BaseModel


class Survey(BaseModel, table=True):
    __tablename__ = "surveys"
    __table_args__ = (
        CheckConstraint(
            "status IN ('Inactive', 'Active', 'Closed')",
            name="ck_surveys_status",
        ),
    )

    survey_id: str = Field(unique=True, index=True, max_length=20)
    title: str = Field(max_length=255)
    description: str | None = Field(default=None, max_length=3000)
    status: str = Field(default="Inactive", max_length=20, index=True)
    target_cohort: str | None = Field(default=None, max_length=100)
    responses_count: int = Field(default=0, nullable=False)
