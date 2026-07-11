import json
from uuid import UUID

from pydantic import BaseModel, ConfigDict, field_validator

from models.question_type import QuestionType


class PublicSurveyQuestion(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    question_text: str
    question_type: QuestionType
    options: list[str] | None = None
    config: dict | None = None
    order_index: int

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


class PublicSurveySection(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    description: str | None = None
    order_index: int
    questions: list[PublicSurveyQuestion] = []


class PublicSurvey(BaseModel):
    model_config = ConfigDict(
        from_attributes=True,
        json_schema_extra={
            "example": {
                "survey_id": "SURV-AB12CD",
                "title": "Alumni Outcome Survey",
                "description": "Help us understand your journey since graduation.",
                "questions": [
                    {
                        "id": "018f4a1a-7b3b-7d0e-913a-c5f1c5c1c5c2",
                        "question_text": "Current Employment Status",
                        "question_type": "single_choice",
                        "options": ["Employed Full-Time", "Employed Part-Time"],
                        "order_index": 0,
                    }
                ],
                "sections": [],
            }
        },
    )

    survey_id: str
    title: str
    description: str | None = None
    questions: list[PublicSurveyQuestion] = []
    sections: list[PublicSurveySection] = []
