from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class SurveyDistributionBaseSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class SurveyDistributionRead(SurveyDistributionBaseSchema):
    model_config = ConfigDict(
        from_attributes=True,
        json_schema_extra={
            "example": {
                "id": "018f4a1a-7b3b-7d0e-913a-c5f1c5c1c5c2",
                "survey_id": "018f4a1a-7b3b-7d0e-913a-c5f1c5c1c5c3",
                "token": "abc123def456ghi789jkl012mno345pqr",
                "is_active": True,
                "created_at": "2026-06-21T12:00:00Z",
            }
        },
    )

    id: UUID
    survey_id: UUID
    token: str
    is_active: bool
    created_at: datetime
