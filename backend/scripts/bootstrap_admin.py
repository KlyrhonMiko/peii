import asyncio
import sys
from pathlib import Path
from uuid import UUID

from sqlmodel import col, select

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.config import settings  # noqa: E402
from core.database import async_session_factory  # noqa: E402
from models.rbac import Role, UserRole  # noqa: E402
from models.user import User  # noqa: E402
from services.audit_service import AuditEvent, commit_with_audit  # noqa: E402
from services.rbac_service import ensure_permission_catalog  # noqa: E402
from services.supabase_auth_service import (  # noqa: E402
    get_auth_user_by_email,
    invite_user,
)
from utils.identifiers import generate_business_id  # noqa: E402


def _required(value: str | None, name: str) -> str:
    if value is None:
        raise RuntimeError(f"{name} must be set in .env.")
    return value


async def main() -> None:
    email = _required(settings.INITIAL_ADMIN_EMAIL, "INITIAL_ADMIN_EMAIL").lower()
    username = _required(settings.INITIAL_ADMIN_USERNAME, "INITIAL_ADMIN_USERNAME").lower()
    first_name = _required(settings.INITIAL_ADMIN_FIRST_NAME, "INITIAL_ADMIN_FIRST_NAME")
    last_name = _required(settings.INITIAL_ADMIN_LAST_NAME, "INITIAL_ADMIN_LAST_NAME")
    app_origin = _required(settings.APP_ORIGIN, "APP_ORIGIN")

    async with async_session_factory() as session:
        await ensure_permission_catalog(session)
        user = (
            await session.exec(
                select(User).where((col(User.email) == email) | (col(User.username) == username))
            )
        ).first()
        auth_user = await get_auth_user_by_email(email)
        if auth_user is None:
            invitation = await invite_user(email, f"{app_origin}/auth/confirm?next=/reset-password")
            auth_user = invitation.get("user", invitation)
        auth_user_id = UUID(auth_user["id"])
        if user is None:
            user = User(
                user_id=generate_business_id("USER"),
                auth_user_id=auth_user_id,
                email=email,
                username=username,
                first_name=first_name,
                last_name=last_name,
                is_active=True,
            )
            session.add(user)
            action = "bootstrap_create"
        else:
            user.auth_user_id = auth_user_id
            user.is_active = True
            user.is_deleted = False
            user.deleted_at = None
            session.add(user)
            action = "bootstrap_link"
        await session.flush()

        admin_role = (
            await session.exec(
                select(Role).where(col(Role.name) == "admin", col(Role.is_deleted).is_(False))
            )
        ).first()
        if admin_role is None:
            raise RuntimeError("The seeded admin role is unavailable.")
        assigned = (
            await session.exec(
                select(UserRole).where(
                    col(UserRole.user_id) == user.id,
                    col(UserRole.role_id) == admin_role.id,
                )
            )
        ).first()
        if assigned is None:
            session.add(UserRole(user_id=user.id, role_id=admin_role.id, performed_by=user.id))
        elif assigned.is_deleted:
            assigned.is_deleted = False
            assigned.deleted_at = None
            assigned.performed_by = user.id
            session.add(assigned)
        await commit_with_audit(
            session,
            [AuditEvent(action, "user", user.user_id, user.id)],
        )
        print(f"Administrator {user.user_id} is linked and invited at {email}.")


if __name__ == "__main__":
    asyncio.run(main())
