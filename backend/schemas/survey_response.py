import json
from datetime import datetime
from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from schemas.common import ListQueryParams


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
            }
        }
    )

    answers: dict[str, Any]
    consent: SurveyConsentSubmit

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


class SurveyResponseListQueryParams(ListQueryParams):
    sort_by: str = "created_at"


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


AggregateQuestionType = Literal[
    "single_choice",
    "boolean",
    "multiple_choice",
    "scale",
    "ranking",
    "matrix",
]


class AggregateCell(BaseModel):
    value: str | int | float | bool
    count: int
    rank: int | None = None
    row: str | None = None


class SurveyResponseAggregate(BaseModel):
    question_id: UUID
    question_text: str
    question_type: AggregateQuestionType
    total: int
    cells: list[AggregateCell]
