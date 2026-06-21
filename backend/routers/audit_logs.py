from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status

from core.deps import AsyncDBSession
from core.exceptions import AppError
from core.responses import list_meta_response, success_response
from models.audit_log import AuditLog
from schemas.audit_log import AuditLogListQueryParams, AuditLogRead
from schemas.common import APIResponse
from services import audit_service

router = APIRouter()


def get_audit_log_list_query_params(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    sort_order: Literal["asc", "desc"] = Query(default="desc"),
    resource_type: str | None = Query(default=None),
    resource_id: str | None = Query(default=None),
    action: str | None = Query(default=None),
    performed_by: UUID | None = Query(default=None),
    request_id: str | None = Query(default=None),
    created_from: datetime | None = Query(default=None),
    created_to: datetime | None = Query(default=None),
) -> AuditLogListQueryParams:
    return AuditLogListQueryParams(
        limit=limit,
        offset=offset,
        sort_order=sort_order,
        resource_type=resource_type,
        resource_id=resource_id,
        action=action,
        performed_by=performed_by,
        request_id=request_id,
        created_from=created_from,
        created_to=created_to,
    )


AuditLogListParams = Annotated[AuditLogListQueryParams, Depends(get_audit_log_list_query_params)]


@router.get(
    "/",
    response_model=APIResponse[list[AuditLogRead]],
    summary="List Audit Logs",
    description=(
        "Query and list append-only audit trail logs with "
        "filtering, sorting, and pagination."
    ),
)
async def list_audit_logs(
    session: AsyncDBSession,
    params: AuditLogListParams,
) -> APIResponse[list[AuditLogRead]]:
    logs, total = await audit_service.list_audit_logs(session, params)
    response_logs = [AuditLogRead.model_validate(log) for log in logs]
    return success_response(
        response_logs,
        meta=list_meta_response(
            filters=params,
            total=total,
            count=len(response_logs),
            limit=params.limit,
            offset=params.offset,
        ),
    )


@router.get(
    "/{audit_log_id}",
    response_model=APIResponse[AuditLogRead],
    summary="Get Audit Log",
    description="Retrieve a single audit log entry by its UUID.",
)
async def get_audit_log(audit_log_id: UUID, session: AsyncDBSession) -> APIResponse[AuditLogRead]:
    log = await session.get(AuditLog, audit_log_id)
    if not log:
        raise AppError("Audit log not found.", status_code=status.HTTP_404_NOT_FOUND)
    return success_response(AuditLogRead.model_validate(log))
