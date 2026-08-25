import asyncio
import sys
from collections.abc import Awaitable, Callable, Mapping
from pathlib import Path
from typing import Any
from uuid import UUID

from sqlalchemy import func
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.config import settings  # noqa: E402
from core.database import async_session_factory  # noqa: E402
from models.rbac import Permission, Role, RolePermission, UserRole  # noqa: E402
from models.user import User  # noqa: E402
from services.audit_service import AuditEvent, commit_with_audit  # noqa: E402
from services.rbac_service import PERMISSIONS  # noqa: E402
from services.supabase_auth_service import (  # noqa: E402
    get_auth_user_by_email,
    invite_user,
)
from utils.identifiers import generate_business_id  # noqa: E402

CANONICAL_ADMIN_ROLE_ID = UUID("00000000-0000-0000-0000-000000000101")
CANONICAL_SYSTEM_ACTOR_ID = UUID("00000000-0000-0000-0000-000000000001")
ADMIN_ROLE_NAME = "admin"

AuthLookup = Callable[[str], Awaitable[dict[str, Any] | None]]
AuthInvite = Callable[[str, str], Awaitable[dict[str, Any]]]


def _normalize(value: object, label: str) -> str:
    if not isinstance(value, str):
        raise RuntimeError(f"Invalid {label}.")
    normalized = value.strip().casefold()
    if not normalized:
        raise RuntimeError(f"Invalid {label}.")
    return normalized


async def _validate_admin_catalog(session: AsyncSession) -> Role:
    result = await session.exec(
        select(Role)
        .where(col(Role.id) == CANONICAL_ADMIN_ROLE_ID)
        .with_for_update()
    )
    role = result.first()
    if (
        role is None
        or role.name != ADMIN_ROLE_NAME
        or role.is_system is not True
        or role.is_active is not True
        or role.is_deleted is not False
        or role.deleted_at is not None
    ):
        raise RuntimeError("The canonical admin role/catalog is unavailable; migrate first.")

    edge_result = await session.exec(
        select(RolePermission)
        .where(col(RolePermission.role_id) == role.id)
        .with_for_update()
    )
    edges = list(edge_result.all())
    if not edges:
        raise RuntimeError("The canonical admin role/catalog is unavailable; migrate first.")

    permission_ids = {edge.permission_id for edge in edges}
    permission_result = await session.exec(
        select(Permission)
        .where(col(Permission.id).in_(permission_ids))
        .with_for_update()
    )
    permissions = {permission.id: permission for permission in permission_result.all()}
    codes: set[str] = set()
    for edge in edges:
        permission = permissions.get(edge.permission_id)
        if (
            permission is None
            or edge.is_deleted is not False
            or edge.deleted_at is not None
            or permission.is_deleted is not False
            or permission.deleted_at is not None
        ):
            raise RuntimeError("The canonical admin role/catalog is unavailable; migrate first.")
        codes.add(permission.code)

    expected_codes = set(PERMISSIONS)
    if len(codes) != len(edges) or codes != expected_codes:
        raise RuntimeError("The canonical admin role/catalog is unavailable; migrate first.")
    return role


async def _load_canonical_user(
    session: AsyncSession,
    email: str,
    username: str,
) -> User | None:
    result = await session.exec(
        select(User)
        .where(
            (func.lower(col(User.email)) == email)
            | (func.lower(col(User.username)) == username)
        )
        .with_for_update()
    )
    users = list(result.all())
    if len(users) > 1:
        raise RuntimeError("Multiple canonical local users match the admin.")
    if not users:
        return None

    user = users[0]
    if (
        _normalize(user.email, "local user email") != email
        or _normalize(user.username, "local username") != username
        or user.is_active is not True
        or user.is_deleted is not False
        or user.deleted_at is not None
    ):
        raise RuntimeError("The canonical local user is unavailable or mismatched.")
    return user


def _auth_subject(auth_response: object, expected_email: str) -> UUID:
    if not isinstance(auth_response, Mapping):
        raise RuntimeError("Supabase identity response is invalid.")
    auth_user = auth_response.get("user", auth_response)
    if not isinstance(auth_user, Mapping):
        raise RuntimeError("Supabase identity response is invalid.")
    try:
        subject = UUID(str(auth_user["id"]))
        auth_email = _normalize(auth_user["email"], "Supabase identity email")
    except (KeyError, TypeError, ValueError) as exc:
        raise RuntimeError("Supabase identity response is invalid.") from exc
    if auth_email != expected_email:
        raise RuntimeError("Supabase identity response does not match the canonical admin.")
    return subject


async def bootstrap_admin(
    session: AsyncSession,
    *,
    email: str,
    username: str,
    first_name: str,
    last_name: str,
    app_origin: str,
    system_actor_id: UUID | None = None,
    get_auth_user_by_email_fn: AuthLookup | None = None,
    invite_user_fn: AuthInvite | None = None,
) -> User:
    """Safely link or create the configured administrator and assign Admin."""
    normalized_email = _normalize(email, "admin email")
    normalized_username = _normalize(username, "admin username")
    actor_id = system_actor_id or CANONICAL_SYSTEM_ACTOR_ID

    # These locks and catalog checks deliberately precede every Supabase call.
    admin_role = await _validate_admin_catalog(session)
    user = await _load_canonical_user(session, normalized_email, normalized_username)

    auth_lookup = get_auth_user_by_email_fn or get_auth_user_by_email
    auth_invite = invite_user_fn or invite_user
    auth_user = await auth_lookup(normalized_email)
    if auth_user is None:
        auth_user = await auth_invite(
            normalized_email,
            f"{app_origin}/auth/confirm?next=/reset-password",
        )
    subject = _auth_subject(auth_user, normalized_email)

    linked_result = await session.exec(
        select(User)
        .where(col(User.auth_user_id) == subject)
        .with_for_update()
    )
    linked_users = list(linked_result.all())
    if any(user is None or linked.id != user.id for linked in linked_users):
        raise RuntimeError("The Supabase identity is already linked to another user.")

    assignments: list[UserRole] = []
    if user is not None:
        assignment_result = await session.exec(
            select(UserRole)
            .where(
                col(UserRole.user_id) == user.id,
                col(UserRole.role_id) == admin_role.id,
            )
            .with_for_update()
        )
        assignments = list(assignment_result.all())
        if len(assignments) > 1:
            raise RuntimeError("Multiple Admin assignments exist for the canonical user.")
        if assignments:
            assignment = assignments[0]
            if assignment.is_deleted is not False or assignment.deleted_at is not None:
                raise RuntimeError("The canonical Admin assignment is soft-deleted.")

    if user is None:
        user = User(
            user_id=generate_business_id("USER"),
            auth_user_id=subject,
            email=normalized_email,
            username=normalized_username,
            first_name=first_name,
            last_name=last_name,
            is_active=True,
            performed_by=actor_id,
        )
        session.add(user)
        action = "bootstrap_create"
    else:
        action = "bootstrap_idempotent"
        if user.auth_user_id is None:
            user.auth_user_id = subject
            user.performed_by = actor_id
            session.add(user)
            action = "bootstrap_link"
        elif user.auth_user_id != subject:
            raise RuntimeError("The local user is linked to a different Supabase identity.")

    await session.flush()
    if not assignments:
        session.add(UserRole(user_id=user.id, role_id=admin_role.id, performed_by=actor_id))

    await commit_with_audit(
        session,
        [AuditEvent(action, "user", user.user_id, actor_id)],
    )
    return user


async def main() -> None:
    system_actor_id = getattr(settings, "SYSTEM_ACTOR_ID", None) or CANONICAL_SYSTEM_ACTOR_ID
    async with async_session_factory() as session:
        user = await bootstrap_admin(
            session,
            email=settings.INITIAL_ADMIN_EMAIL,
            username=settings.INITIAL_ADMIN_USERNAME,
            first_name=settings.INITIAL_ADMIN_FIRST_NAME,
            last_name=settings.INITIAL_ADMIN_LAST_NAME,
            app_origin=settings.APP_ORIGIN,
            system_actor_id=system_actor_id,
        )
    print(f"Administrator {user.user_id} status=active")


if __name__ == "__main__":
    asyncio.run(main())
