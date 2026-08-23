from uuid import UUID

from fastapi import status
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from core.exceptions import AppError
from models.user import User
from services import rbac_service
from services.audit_service import AuditEvent, commit_with_audit
from services.base_service import utc_now
from services.supabase_auth_service import password_login


async def authenticate(session: AsyncSession, identifier: str, password: str) -> tuple[User, dict]:
    normalized = identifier.strip().lower()
    result = await session.exec(
        select(User).where((col(User.email) == normalized) | (col(User.username) == normalized))
    )
    user = result.first()
    # Never distinguish an unknown username from an invalid password.
    if not user or user.is_deleted or not user.is_active or user.auth_user_id is None:
        raise AppError("Invalid credentials.", status_code=status.HTTP_401_UNAUTHORIZED)
    session_data = await password_login(user.email, password)
    subject = session_data.get("user", {}).get("id")
    if subject != str(user.auth_user_id):
        raise AppError("Invalid credentials.", status_code=status.HTTP_401_UNAUTHORIZED)
    return user, session_data


async def get_user_by_auth_subject(session: AsyncSession, subject: UUID) -> User:
    result = await session.exec(select(User).where(col(User.auth_user_id) == subject))
    user = result.first()
    if not user or user.is_deleted or not user.is_active:
        raise AppError("Authentication is not available for this account.", status_code=401)
    return user


async def current_user_data(session: AsyncSession, user: User) -> tuple[list[str], list[str]]:
    permissions = sorted(await rbac_service.effective_permissions(session, user.id))
    roles = await rbac_service.effective_role_names(session, user.id)
    return permissions, roles


async def record_password_change(
    session: AsyncSession, user: User, ip_address: str | None = None
) -> None:
    changes = None
    if user.onboarding_completed_at is None:
        user.onboarding_completed_at = utc_now()
        user.updated_at = utc_now()
        user.performed_by = user.id
        session.add(user)
        changes = {
            "onboarding_completed_at": {
                "before": None,
                "after": user.onboarding_completed_at,
            }
        }
    await commit_with_audit(
        session,
        [
            AuditEvent(
                "change_password",
                "user",
                user.user_id,
                user.id,
                changes=changes,
                ip_address=ip_address,
            )
        ],
    )
