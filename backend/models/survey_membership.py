from uuid import UUID

from sqlalchemy import CheckConstraint, UniqueConstraint
from sqlmodel import Field

from models.base_model import TimestampedUUIDModel


class SurveyMembership(TimestampedUUIDModel, table=True):
    __tablename__ = "survey_memberships"
    __table_args__ = (
        UniqueConstraint("survey_id", "user_id"),
        CheckConstraint("access_level IN ('viewer', 'editor')", name="ck_membership_access"),
    )

    survey_id: UUID = Field(foreign_key="surveys.id", index=True)
    user_id: UUID = Field(foreign_key="users.id", index=True)
    access_level: str = Field(max_length=20)
