from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, field_validator

DistributionStatus = Literal["active", "suspended", "expired", "revoked"]


class SurveyDistributionCreate(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={"example": {"expires_at": "2027-01-01T00:00:00+00:00"}}
    )

    expires_at: datetime | None = None

    @field_validator("expires_at")
    @classmethod
    def require_timezone(cls, value: datetime | None) -> datetime | None:
        if value is None:
            return value
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("expires_at must include a timezone.")
        return value


class SurveyDistributionBaseSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class SurveyDistributionRead(SurveyDistributionBaseSchema):
    model_config = ConfigDict(
        from_attributes=True,
        json_schema_extra={
            "example": {
                "id": "018f4a1a-7b3b-7d0e-913a-c5f1c5c1c5c2",
                "survey_id": "018f4a1a-7b3b-7d0e-913a-c5f1c5c1c5c3",
                "status": "active",
                "is_active": True,
                "expires_at": "2027-01-01T00:00:00Z",
                "revoked_at": None,
                "created_at": "2026-06-21T12:00:00Z",
            }
        },
    )

    id: UUID
    survey_id: UUID
    status: DistributionStatus
    is_active: bool
    expires_at: datetime | None = None
    revoked_at: datetime | None
    created_at: datetime
    token: str

class SurveyDistributionSecretRead(SurveyDistributionRead):
    pass
