import base64
import binascii
import json
from datetime import datetime
from typing import Annotated, Any, Literal, Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class SurveyResponseBaseSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class SurveyConsentSubmit(BaseModel):
    model_config = ConfigDict(extra="forbid")

    accepted: Literal[True]
    version: str = Field(min_length=1, max_length=64)


class SurveyResponseSubmit(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "answers": {
                    "q1": "Employed Full-Time",
                    "q2": "Below ₱250,000",
                    "q3": 4,
                },
                "consent": {"accepted": True, "version": "20260825_v1"},
                "withdrawal_code": "QWERTYuiopASDFGHjklZXCVBNM1234567890-_abCdef",
            }
        }
    )

    answers: dict[str, Any]
    consent: SurveyConsentSubmit
    withdrawal_code: str = Field(
        min_length=43,
        max_length=128,
        pattern=r"^[A-Za-z0-9_-]+$",
    )

    @field_validator("withdrawal_code")
    @classmethod
    def require_256_bit_base64url_secret(cls, value: str) -> str:
        try:
            decoded = base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))
        except (binascii.Error, ValueError) as exc:
            raise ValueError("withdrawal_code must be a valid base64url secret") from exc
        if len(decoded) < 32:
            raise ValueError("withdrawal_code must contain at least 256 bits")
        return value

    @field_validator("answers")
    @classmethod
    def require_uuid_question_ids(cls, value: dict[str, Any]) -> dict[str, Any]:
        for question_id in value:
            try:
                UUID(question_id)
            except ValueError as exc:
                raise ValueError("answer keys must be question UUIDs") from exc
        return value


class SurveyResponsePhase2Submit(BaseModel):
    model_config = ConfigDict(extra="forbid")

    answers: dict[str, Any]

    @field_validator("answers")
    @classmethod
    def require_uuid_question_ids(cls, value: dict[str, Any]) -> dict[str, Any]:
        for question_id in value:
            try:
                UUID(question_id)
            except ValueError as exc:
                raise ValueError("answer keys must be question UUIDs") from exc
        return value


class SurveyResponseAcknowledgement(BaseModel):
    accepted: Literal[True]


class SurveyResponseRead(SurveyResponseBaseSchema):
    model_config = ConfigDict(
        from_attributes=True,
        json_schema_extra={
            "example": {
                "id": "018f4a1a-7b3b-7d0e-913a-c5f1c5c1c5c2",
                "survey_id": "018f4a1a-7b3b-7d0e-913a-c5f1c5c1c5c3",
                "distribution_id": "018f4a1a-7b3b-7d0e-913a-c5f1c5c1c5c4",
                "answers": {"q1": "Employed Full-Time"},
                "created_at": "2026-06-21T12:00:00Z",
            }
        },
    )

    id: UUID
    survey_id: UUID
    distribution_id: UUID | None
    answers: dict[str, Any]
    created_at: datetime

    @field_validator("answers", mode="before")
    @classmethod
    def parse_answers(cls, v: Any) -> Any:
        if isinstance(v, str):
            return json.loads(v)
        return v


class SurveyResponseIdentityRead(SurveyResponseRead):
    """Identity-aware response data for researchers with both read capabilities."""

    provider: str | None = None
    email: str | None = None
    display_name: str | None = None
    email_verified: bool | None = None
    identity_captured_at: datetime | None = None
    identity_available: bool = False

    @model_validator(mode="after")
    def derive_identity_available(self) -> Self:
        self.identity_available = (
            self.provider == "google"
            and self.email is not None
            and self.email_verified is True
            and self.identity_captured_at is not None
        )
        return self


class SurveyResponseListQueryParams(BaseModel):
    model_config = ConfigDict(extra="forbid")

    limit: int = Field(default=50, ge=1, le=100)
    offset: int = Field(default=0, ge=0)
    sort_by: Literal["created_at"] = "created_at"
    sort_order: Literal["asc", "desc"] = "desc"
    submitted_from: datetime | None = None
    submitted_before: datetime | None = None
    distribution_id: UUID | None = None


class EraseSelectedResponses(BaseModel):
    scope: Literal["selected"]
    response_ids: list[UUID] = Field(min_length=1, max_length=100)
    confirmation: Literal["ERASE_SELECTED_RESPONSES"]

    @field_validator("response_ids")
    @classmethod
    def require_unique_response_ids(cls, value: list[UUID]) -> list[UUID]:
        if len(value) != len(set(value)):
            raise ValueError("response_ids must be unique")
        return value


class EraseAllResponses(BaseModel):
    scope: Literal["all"]
    expected_response_count: int = Field(ge=0)
    confirmation: Literal["ERASE_ALL_RESPONSES"]


EraseResponsesRequest = Annotated[
    EraseSelectedResponses | EraseAllResponses,
    Field(discriminator="scope"),
]


class ResponseErasureResult(BaseModel):
    scope: Literal["selected", "all"]
    requested_count: int
    erased_count: int


class SurveyResponseWithdrawalRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    withdrawal_code: str = Field(
        min_length=43,
        max_length=128,
        pattern=r"^[A-Za-z0-9_-]+$",
    )

    @field_validator("withdrawal_code")
    @classmethod
    def require_256_bit_base64url_secret(cls, value: str) -> str:
        try:
            decoded = base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))
        except (binascii.Error, ValueError) as exc:
            raise ValueError("withdrawal_code must be a valid base64url secret") from exc
        if len(decoded) < 32:
            raise ValueError("withdrawal_code must contain at least 256 bits")
        return value


class SurveyResponseWithdrawalResult(BaseModel):
    withdrawn: Literal[True]
