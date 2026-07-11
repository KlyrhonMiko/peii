import json
from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, field_validator

from schemas.common import ListQueryParams


class SurveyResponseBaseSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class SurveyResponseSubmit(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "answers": {
                    "q1": "Employed Full-Time",
                    "q2": "Below ₱250,000",
                    "q3": 4,
                },
            }
        }
    )

    answers: dict[str, Any]


class SurveyResponseRead(SurveyResponseBaseSchema):
    model_config = ConfigDict(
        from_attributes=True,
        json_schema_extra={
            "example": {
                "id": "018f4a1a-7b3b-7d0e-913a-c5f1c5c1c5c2",
                "survey_id": "018f4a1a-7b3b-7d0e-913a-c5f1c5c1c5c3",
                "alumni_token": "abc123def456ghi789jkl012mno345pqr",
                "answers": {"q1": "Employed Full-Time"},
                "created_at": "2026-06-21T12:00:00Z",
            }
        },
    )

    id: UUID
    survey_id: UUID
    alumni_token: str
    answers: dict[str, Any]
    created_at: datetime

    @field_validator("answers", mode="before")
    @classmethod
    def parse_answers(cls, v: Any) -> Any:
        if isinstance(v, str):
            return json.loads(v)
        return v


class SurveyResponseListQueryParams(ListQueryParams):
    sort_by: str = "created_at"
