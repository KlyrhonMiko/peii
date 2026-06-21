from datetime import datetime
from uuid import UUID

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel
from uuid6 import uuid7

from models.base_model import utc_now


class AuditLog(SQLModel, table=True):
    __tablename__ = "audit_logs"

    id: UUID = Field(default_factory=uuid7, primary_key=True, index=True, nullable=False)
    action: str = Field(index=True, max_length=100)
    resource_type: str = Field(index=True, max_length=100)
    resource_id: str = Field(index=True, max_length=100)
    performed_by: UUID | None = Field(default=None, index=True, nullable=True)
    request_id: str | None = Field(default=None, index=True, max_length=100, nullable=True)
    changes: dict | None = Field(default=None, sa_column=Column(JSON, nullable=True))
    ip_address: str | None = Field(default=None, max_length=50, nullable=True)
    created_at: datetime = Field(default_factory=utc_now, nullable=False)
