from uuid import UUID

from fastapi import status
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from core.exceptions import AppError
from models.user import User
from schemas.auth import CurrentUserUpdate
from services import rbac_service
from services.audit_service import AuditEvent, commit_with_audit
from services.base_service import apply_updates, utc_now
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
    permissions = sorted(await rbac_service.effective_permissions_cached(session, user.id))
    roles = await rbac_service.effective_role_names_cached(session, user.id)
    return permissions, roles


def _raise_username_conflict(existing_user: User) -> None:
    if existing_user.is_deleted:
        raise AppError(
            "A deleted user with this username already exists. Restore that user instead.",
            status_code=status.HTTP_400_BAD_REQUEST,
        )
    raise AppError(
        "A user with this username already exists.",
        status_code=status.HTTP_400_BAD_REQUEST,
    )


async def update_current_user(
    session: AsyncSession,
    user: User,
    payload: CurrentUserUpdate,
    ip_address: str | None = None,
) -> User:
    """Update only self-service profile fields for the authenticated user."""
    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        return user

    for field in ("username", "first_name", "last_name"):
        if field in updates and updates[field] is None:
            raise AppError(f"{field.replace('_', ' ').capitalize()} cannot be empty.")

    if "username" in updates and updates["username"] != user.username:
        existing_result = await session.exec(
            select(User).where(col(User.username) == updates["username"])
        )
        existing_user = existing_result.first()
        if existing_user and existing_user.id != user.id:
            _raise_username_conflict(existing_user)

    changes = {
        field: {"before": getattr(user, field), "after": value}
        for field, value in updates.items()
        if getattr(user, field) != value
    }
    if not changes:
        return user

    apply_updates(user, updates)
    user.performed_by = user.id
    session.add(user)
    await commit_with_audit(
        session,
        [
            AuditEvent(
                action="update",
                resource_type="user",
                resource_id=user.user_id,
                performed_by=user.id,
                changes=changes,
                ip_address=ip_address,
            )
        ],
    )
    await session.refresh(user)
    return user


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
