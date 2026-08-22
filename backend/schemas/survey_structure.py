from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from models.question_type import QuestionType


class SurveyStructureQuestion(BaseModel):
    model_config = ConfigDict(extra="forbid")

    client_id: str
    id: UUID | None = None
    question_text: str
    question_type: QuestionType
    options: list[str] | None = None
    config: dict | None = None
    is_required: bool = True


class SurveyStructureCreateQuestion(BaseModel):
    model_config = ConfigDict(extra="forbid")

    client_id: str
    question_text: str
    question_type: QuestionType
    options: list[str] | None = None
    config: dict | None = None
    is_required: bool = True


class SurveyStructureSection(BaseModel):
    model_config = ConfigDict(extra="forbid")

    client_id: str
    id: UUID | None = None
    title: str
    description: str | None = None
    questions: list[SurveyStructureQuestion]


class SurveyStructureCreateSection(BaseModel):
    model_config = ConfigDict(extra="forbid")

    client_id: str
    title: str
    description: str | None = None
    questions: list[SurveyStructureCreateQuestion]


def validate_structure_client_ids(
    sections: list[SurveyStructureSection] | list[SurveyStructureCreateSection],
) -> None:
    section_client_ids = [section.client_id for section in sections]
    if len(section_client_ids) != len(set(section_client_ids)):
        raise ValueError("Section client_id values must be unique.")
    question_client_ids = [
        question.client_id
        for section in sections
        for question in section.questions
    ]
    if len(question_client_ids) != len(set(question_client_ids)):
        raise ValueError("Question client_id values must be unique.")


class SurveyStructureReplace(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expected_updated_at: datetime
    sections: list[SurveyStructureSection]
    cascade_section_ids: list[UUID] = Field(default_factory=list)

    @field_validator("sections")
    @classmethod
    def require_unique_section_client_ids(
        cls, value: list[SurveyStructureSection]
    ) -> list[SurveyStructureSection]:
        validate_structure_client_ids(value)
        section_persisted_ids = [
            section.id for section in value if section.id is not None
        ]
        if len(section_persisted_ids) != len(set(section_persisted_ids)):
            raise ValueError("Persisted section id values must be unique.")
        question_persisted_ids = [
            question.id
            for section in value
            for question in section.questions
            if question.id is not None
        ]
        if len(question_persisted_ids) != len(set(question_persisted_ids)):
            raise ValueError("Persisted question id values must be unique.")
        return value

    @field_validator("cascade_section_ids")
    @classmethod
    def require_unique_cascade_ids(cls, value: list[UUID]) -> list[UUID]:
        if len(value) != len(set(value)):
            raise ValueError("cascade_section_ids must not contain duplicates.")
        return value
