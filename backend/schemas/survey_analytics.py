from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict

AggregateQuestionType = Literal[
    "single_choice",
    "boolean",
    "multiple_choice",
    "scale",
    "ranking",
    "matrix",
]


class AggregateCell(BaseModel):
    model_config = ConfigDict(extra="forbid")

    value: str | int | float | bool
    count: int
    rank: int | None = None
    row: str | None = None


class SurveyResponseAggregate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    question_id: UUID
    question_text: str
    question_type: AggregateQuestionType
    total: int
    cells: list[AggregateCell]
