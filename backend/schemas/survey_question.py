import json
from uuid import UUID

from pydantic import BaseModel, ConfigDict, field_validator

from models.question_type import QuestionType
from schemas.common import ListQueryParams


class SurveyQuestionBaseSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class SurveyQuestionCreate(SurveyQuestionBaseSchema):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "question_text": "How satisfied are you with the program overall?",
                "question_type": "scale",
                "options": None,
                "section_id": "018f4a1a-7b3b-7d0e-913a-c5f1c5c1c5c2",
                "performed_by": "018f4a1a-7b3b-7d0e-913a-c5f1c5c1c5c2",
                "is_required": True,
            }
        }
    )

    question_text: str
    question_type: QuestionType
    options: list[str] | None = None
    config: dict | None = None
    section_id: UUID | None = None
    is_required: bool = True
    performed_by: UUID | None = None


class SurveyQuestionUpdate(SurveyQuestionBaseSchema):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "question_text": "How satisfied are you with the program?",
                "question_type": "scale",
                "options": None,
                "performed_by": "018f4a1a-7b3b-7d0e-913a-c5f1c5c1c5c2",
                "is_required": True,
            }
        }
    )

    question_text: str | None = None
    question_type: QuestionType | None = None
    options: list[str] | None = None
    config: dict | None = None
    is_required: bool | None = None
    performed_by: UUID | None = None


class SurveyQuestionRead(SurveyQuestionBaseSchema):
    model_config = ConfigDict(
        from_attributes=True,
        json_schema_extra={
            "example": {
                "id": "018f4a1a-7b3b-7d0e-913a-c5f1c5c1c5c2",
                "survey_id": "018f4a1a-7b3b-7d0e-913a-c5f1c5c1c5c3",
                "question_text": "How satisfied are you with the program overall?",
                "question_type": "scale",
                "options": None,
                "order_index": 0,
                "is_required": True,
            }
        },
    )

    id: UUID
    survey_id: UUID
    question_text: str
    question_type: QuestionType
    options: list[str] | None = None
    config: dict | None = None
    order_index: int
    is_required: bool
    is_deleted: bool
    performed_by: UUID | None = None

    @field_validator("options", mode="before")
    @classmethod
    def parse_options(cls, v: object) -> object:
        if isinstance(v, str):
            try:
                return json.loads(v)
            except (json.JSONDecodeError, TypeError):
                return None
        return v

    @field_validator("config", mode="before")
    @classmethod
    def parse_config(cls, v: object) -> object:
        if isinstance(v, str):
            try:
                return json.loads(v)
            except (json.JSONDecodeError, TypeError):
                return None
        return v


class SurveyQuestionReorder(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "question_ids": [
                    "018f4a1a-7b3b-7d0e-913a-c5f1c5c1c5c3",
                    "018f4a1a-7b3b-7d0e-913a-c5f1c5c1c5c2",
                ],
            }
        }
    )

    question_ids: list[UUID]


class SurveyQuestionListQueryParams(ListQueryParams):
    sort_by: str = "order_index"
