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


class SurveyStructureSection(BaseModel):
    model_config = ConfigDict(extra="forbid")

    client_id: str
    id: UUID | None = None
    title: str
    description: str | None = None
    questions: list[SurveyStructureQuestion]


class SurveyStructureReplace(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expected_revision: int | None = None
    sections: list[SurveyStructureSection]
    cascade_section_ids: list[UUID] = Field(default_factory=list)

    @field_validator("sections")
    @classmethod
    def require_unique_section_client_ids(
        cls, value: list[SurveyStructureSection]
    ) -> list[SurveyStructureSection]:
        ids = [section.client_id for section in value]
        if len(ids) != len(set(ids)):
            raise ValueError("Section client_id values must be unique.")
        question_ids = [
            question.client_id
            for section in value
            for question in section.questions
        ]
        if len(question_ids) != len(set(question_ids)):
            raise ValueError("Question client_id values must be unique.")
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
