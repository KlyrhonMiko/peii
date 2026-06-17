from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel


class APIResponse[T](BaseModel):
    data: T | None = None
    message: str = "Success"
    errors: Any | None = None
    meta: dict[str, Any] | None = None


class PaginationMeta(BaseModel):
    total: int
    count: int
    limit: int
    offset: int
    has_next: bool
    has_prev: bool


class ListMeta[F: BaseModel](BaseModel):
    pagination: PaginationMeta
    filters: F


class ListQueryParams(BaseModel):
    limit: int = 20
    offset: int = 0
    sort_order: Literal["asc", "desc"] = "desc"
    include_deleted: bool = False


class AuditQueryParams(ListQueryParams):
    created_from: datetime | None = None
    created_to: datetime | None = None
    updated_from: datetime | None = None
    updated_to: datetime | None = None
    deleted_from: datetime | None = None
    deleted_to: datetime | None = None
    performed_by: UUID | None = None
