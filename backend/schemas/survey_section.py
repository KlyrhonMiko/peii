from uuid import UUID

from pydantic import BaseModel, ConfigDict, field_validator

from schemas.survey_question import SurveyQuestionRead


class SurveySectionBaseSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class SurveySectionCreate(SurveySectionBaseSchema):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "title": "Employment Outcomes",
                "description": "Questions about your current employment situation.",
                "performed_by": "018f4a1a-7b3b-7d0e-913a-c5f1c5c1c5c2",
            }
        }
    )

    title: str
    description: str | None = None
    performed_by: UUID | None = None


class SurveySectionUpdate(SurveySectionBaseSchema):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "title": "Employment & Career Outcomes",
                "description": "Updated description.",
                "performed_by": "018f4a1a-7b3b-7d0e-913a-c5f1c5c1c5c2",
            }
        }
    )

    title: str | None = None
    description: str | None = None
    performed_by: UUID | None = None


class SurveySectionDelete(SurveySectionBaseSchema):
    cascade_questions: bool = False
    performed_by: UUID | None = None


class SurveySectionRead(SurveySectionBaseSchema):
    model_config = ConfigDict(
        from_attributes=True,
        json_schema_extra={
            "example": {
                "id": "018f4a1a-7b3b-7d0e-913a-c5f1c5c1c5c2",
                "survey_id": "018f4a1a-7b3b-7d0e-913a-c5f1c5c1c5c3",
                "title": "Employment Outcomes",
                "description": "Questions about your current employment situation.",
                "order_index": 0,
                "questions": [],
            }
        },
    )

    id: UUID
    survey_id: UUID
    title: str
    description: str | None = None
    order_index: int
    questions: list[SurveyQuestionRead] = []
    is_deleted: bool
    performed_by: UUID | None = None


class SurveySectionReorder(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "section_ids": [
                    "018f4a1a-7b3b-7d0e-913a-c5f1c5c1c5c2",
                    "018f4a1a-7b3b-7d0e-913a-c5f1c5c1c5c3",
                ],
            }
        }
    )

    section_ids: list[UUID]

    @field_validator("section_ids")
    @classmethod
    def require_unique_ids(cls, value: list[UUID]) -> list[UUID]:
        if len(value) != len(set(value)):
            raise ValueError("section_ids must not contain duplicates.")
        return value
