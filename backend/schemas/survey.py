from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from schemas.common import ListQueryParams


class SurveyBaseSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class SurveyBase(SurveyBaseSchema):
    title: str
    description: str | None = None
    status: str = "Draft"
    target_cohort: str | None = None


class SurveyCreate(SurveyBase):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "title": "Class of 2025 Exit Survey",
                "description": "Exit survey for the graduating class of 2025.",
                "target_cohort": "Class of 2025",
                "performed_by": "018f4a1a-7b3b-7d0e-913a-c5f1c5c1c5c2",
            }
        }
    )

    performed_by: UUID | None = None


class SurveyUpdate(SurveyBaseSchema):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "title": "Class of 2025 Mid-Year Check-in",
                "status": "Active",
                "performed_by": "018f4a1a-7b3b-7d0e-913a-c5f1c5c1c5c2",
            }
        }
    )

    title: str | None = None
    description: str | None = None
    status: str | None = None
    target_cohort: str | None = None
    performed_by: UUID | None = None


class SurveyRead(SurveyBase):
    model_config = ConfigDict(
        from_attributes=True,
        json_schema_extra={
            "example": {
                "title": "Class of 2025 Exit Survey",
                "description": "Exit survey for the graduating class of 2025.",
                "status": "Active",
                "target_cohort": "Class of 2025",
                "survey_id": "SURV-AB12CD",
                "responses_count": 0,
                "created_at": "2026-06-21T12:00:00Z",
                "updated_at": "2026-06-21T12:30:00Z",
                "is_deleted": False,
                "deleted_at": None,
                "performed_by": "018f4a1a-7b3b-7d0e-913a-c5f1c5c1c5c2",
            }
        },
    )

    id: UUID
    survey_id: str
    responses_count: int
    created_at: datetime
    updated_at: datetime
    is_deleted: bool
    deleted_at: datetime | None = None
    performed_by: UUID | None = None


class SurveyDelete(SurveyBaseSchema):
    performed_by: UUID | None = None


class SurveyRestore(SurveyBaseSchema):
    performed_by: UUID | None = None


class SurveyListQueryParams(ListQueryParams):
    status: str | None = None
    target_cohort: str | None = None
    search: str | None = None
    sort_by: Literal[
        "created_at", "survey_id", "title", "status", "responses_count"
    ] = "created_at"
