from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from schemas.common import ListQueryParams


class AuditLogRead(BaseModel):
    model_config = ConfigDict(
        from_attributes=True,
        json_schema_extra={
            "example": {
                "id": "018f4a1a-7b3b-7d0e-913a-c5f1c5c1c5c1",
                "action": "update",
                "resource_type": "user",
                "resource_id": "USER-123456",
                "performed_by": "018f4a1a-7b3b-7d0e-913a-c5f1c5c1c5c2",
                "request_id": "019ee886f82871ea93463bb30204b7dc",
                "changes": {"email": "updated@example.com"},
                "ip_address": "127.0.0.1",
                "created_at": "2026-06-21T12:00:00Z",
            }
        },
    )

    id: UUID
    action: str
    resource_type: str
    resource_id: str
    performed_by: UUID | None = None
    request_id: str | None = None
    changes: dict | None = None
    ip_address: str | None = None
    created_at: datetime


class AuditLogListQueryParams(ListQueryParams):
    resource_type: str | None = None
    resource_id: str | None = None
    action: str | None = None
    performed_by: UUID | None = None
    request_id: str | None = None
    created_from: datetime | None = None
    created_to: datetime | None = None
