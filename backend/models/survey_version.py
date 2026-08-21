from datetime import datetime
from uuid import UUID

from sqlalchemy import CheckConstraint, Index, UniqueConstraint, text
from sqlmodel import Field

from models.base_model import BaseModel


class SurveyVersion(BaseModel, table=True):
    __tablename__ = "survey_versions"
    __table_args__ = (
        UniqueConstraint("id", "survey_id", name="uq_survey_versions_id_survey"),
        UniqueConstraint(
            "survey_id",
            "version_number",
            name="uq_survey_versions_number",
        ),
        CheckConstraint(
            "status IN ('draft', 'published', 'superseded')",
            name="ck_survey_versions_status",
        ),
        CheckConstraint(
            "structure_revision >= 0",
            name="ck_survey_versions_structure_revision",
        ),
        Index(
            "uq_survey_versions_active_draft",
            "survey_id",
            unique=True,
            postgresql_where=text("status = 'draft' AND is_deleted = false"),
            sqlite_where=text("status = 'draft' AND is_deleted = 0"),
        ),
        Index(
            "uq_survey_versions_active_published",
            "survey_id",
            unique=True,
            postgresql_where=text("status = 'published' AND is_deleted = false"),
            sqlite_where=text("status = 'published' AND is_deleted = 0"),
        ),
    )

    survey_id: UUID = Field(foreign_key="surveys.id", index=True, nullable=False)
    version_id: str = Field(unique=True, index=True, max_length=24)
    version_number: int = Field(default=1, nullable=False)
    status: str = Field(default="draft", max_length=20, index=True)
    structure_revision: int = Field(default=0, nullable=False)
    published_at: datetime | None = Field(default=None, nullable=True, index=True)
