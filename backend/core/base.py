from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from sqlmodel import Field, SQLModel
from uuid6 import uuid7


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class TimestampedUUIDModel(SQLModel):
    id: UUID = Field(default_factory=uuid7, primary_key=True, index=True, nullable=False)
    created_at: datetime = Field(default_factory=utc_now, nullable=False)
    updated_at: datetime = Field(
        default_factory=utc_now,
        nullable=False,
        sa_column_kwargs={"onupdate": utc_now},
    )
    is_deleted: bool = Field(default=False, nullable=False, index=True)
    deleted_at: Optional[datetime] = Field(default=None, nullable=True)
    performed_by: Optional[UUID] = Field(default=None, nullable=True, index=True)


class BaseModel(TimestampedUUIDModel):
    """Shared base model for application tables."""
