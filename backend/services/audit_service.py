from uuid import UUID

from sqlalchemy import func
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from core.context import request_id_ctx
from core.logging import get_logger
from models.audit_log import AuditLog
from schemas.audit_log import AuditLogListQueryParams
from utils.sorting import stable_order_by

logger = get_logger(__name__)


async def record_audit(
    session: AsyncSession,
    *,
    action: str,
    resource_type: str,
    resource_id: str,
    performed_by: UUID | None = None,
    changes: dict | None = None,
    ip_address: str | None = None,
) -> AuditLog | None:
    """Records an audit log entry in the database.

    Catches database errors to prevent business transaction rollback, while logging failures.
    """
    request_id = request_id_ctx.get()

    audit = AuditLog(
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        performed_by=performed_by,
        request_id=request_id,
        changes=changes,
        ip_address=ip_address,
    )

    try:
        session.add(audit)
        await session.commit()
        await session.refresh(audit)
        return audit
    except Exception as exc:
        logger.error(
            "Failed to record audit log",
            error=str(exc),
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
        )
        # Avoid raising errors to keep primary transaction stable
        return None


def _apply_audit_list_filters(statement, params: AuditLogListQueryParams):
    if params.resource_type is not None:
        statement = statement.where(col(AuditLog.resource_type) == params.resource_type)
    if params.resource_id is not None:
        statement = statement.where(col(AuditLog.resource_id) == params.resource_id)
    if params.action is not None:
        statement = statement.where(col(AuditLog.action) == params.action)
    if params.performed_by is not None:
        statement = statement.where(col(AuditLog.performed_by) == params.performed_by)
    if params.request_id is not None:
        statement = statement.where(col(AuditLog.request_id) == params.request_id)

    if params.created_from is not None:
        statement = statement.where(col(AuditLog.created_at) >= params.created_from)
    if params.created_to is not None:
        statement = statement.where(col(AuditLog.created_at) <= params.created_to)

    return statement


async def list_audit_logs(
    session: AsyncSession, params: AuditLogListQueryParams
) -> tuple[list[AuditLog], int]:
    """Lists audit logs with pagination and filters."""
    statement = select(AuditLog)
    statement = _apply_audit_list_filters(statement, params)

    total_statement = _apply_audit_list_filters(
        select(func.count()).select_from(AuditLog), params
    )
    total_result = await session.exec(total_statement)
    total = total_result.one()

    # Default sort by created_at
    statement = stable_order_by(
        statement,
        AuditLog.created_at,
        sort_order=params.sort_order,
        id_column=AuditLog.id,
    )

    statement = statement.offset(params.offset).limit(params.limit)
    result = await session.exec(statement)
    logs = list(result.all())
    return logs, total
