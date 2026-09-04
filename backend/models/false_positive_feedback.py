from uuid import UUID

from sqlalchemy import Index
from sqlmodel import Field

from models.base_model import TimestampedUUIDModel


class FalsePositiveFeedback(TimestampedUUIDModel, table=True):
    __tablename__ = "false_positive_feedbacks"
    __table_args__ = (
        Index(
            "ix_false_positive_feedbacks_response_question",
            "response_id",
            "question_id",
        ),
    )

    response_id: UUID = Field(foreign_key="survey_responses.id", index=True, nullable=False)
    question_id: UUID = Field(index=True, nullable=False)
    # None = flip polarity (classic false-positive), 1.0 = force positive, -1.0 = force negative
    polarity_override: float | None = Field(default=None, nullable=True)
