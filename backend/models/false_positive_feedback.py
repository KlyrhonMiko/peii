from uuid import UUID

from sqlmodel import Field

from models.base_model import TimestampedUUIDModel


class FalsePositiveFeedback(TimestampedUUIDModel, table=True):
    __tablename__ = "false_positive_feedbacks"

    response_id: UUID = Field(foreign_key="survey_responses.id", index=True, nullable=False)
    question_id: UUID = Field(index=True, nullable=False)
