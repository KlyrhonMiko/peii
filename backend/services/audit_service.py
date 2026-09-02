from dataclasses import dataclass
from datetime import date, datetime
from enum import Enum
from typing import Any
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
_PUBLIC_RESPONSE_SENSITIVE_KEYS = frozenset(
    {
        "answers",
        "token",
        "idempotency_key",
        "idempotency_hash",
        "consent",
        "consent_notice_snapshot",
        "notice",
        "provider",
        "auth_user_id",
        "respondent_key_digest",
        "email",
        "display_name",
        "email_verified",
        "identity_captured_at",
        "google_subject_digest",
        "verified_email",
        "provider_token",
        "access_token",
        "subject",
        "sub",
    }
)


@dataclass(frozen=True)
class AuditEvent:
    """One audit event to persist with its associated domain mutation."""

    action: str
    resource_type: str
    resource_id: str
    performed_by: UUID
    changes: dict[str, Any] | None = None
    ip_address: str | None = None


def _json_safe(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, (UUID, datetime, date)):
        return str(value)
    if isinstance(value, Enum):
        return _json_safe(value.value)
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_json_safe(item) for item in value]
    return str(value)


def _sanitize_public_response_changes(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            str(key): _sanitize_public_response_changes(item)
            for key, item in value.items()
            if str(key).casefold() not in _PUBLIC_RESPONSE_SENSITIVE_KEYS
        }
    if isinstance(value, (list, tuple, set)):
        return [_sanitize_public_response_changes(item) for item in value]
    return value


def _audit_log_from_event(event: AuditEvent) -> AuditLog:
    is_public_response_event = (
        event.resource_type == "survey_response"
        and event.action
        in {
            "create",
            "consent_recorded_on_legacy_replay",
            "response_replay_hash_upgraded",
            "phase1_submitted",
            "phase2_submitted",
        }
    ) or (event.resource_type == "survey" and event.action == "response_submitted")
    changes = event.changes
    ip_address = event.ip_address
    if is_public_response_event:
        changes = _sanitize_public_response_changes(changes)
        ip_address = None

    return AuditLog(
        action=event.action,
        resource_type=event.resource_type,
        resource_id=event.resource_id,
        performed_by=event.performed_by,
        request_id=request_id_ctx.get(),
        changes=_json_safe(changes) if changes is not None else None,
        ip_address=ip_address,
    )


async def commit_with_audit(
    session: AsyncSession,
    events: list[AuditEvent],
) -> None:
    """Commit domain changes and their audit events as one fail-closed transaction."""
    if not events:
        raise ValueError("At least one audit event is required for a mutation.")
    if any(event.performed_by is None for event in events):
        raise ValueError("Every audit event requires an actor.")

    try:
        audits = [_audit_log_from_event(event) for event in events]
        session.add_all(audits)
        await session.commit()
    except Exception as exc:
        await session.rollback()
        logger.error(
            "Audited transaction failed",
            error_type=type(exc).__name__,
            actions=[event.action for event in events],
            resource_types=[event.resource_type for event in events],
            resource_ids=[event.resource_id for event in events],
            request_id=request_id_ctx.get(),
        )
        raise


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

    total_statement = _apply_audit_list_filters(select(func.count()).select_from(AuditLog), params)
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
