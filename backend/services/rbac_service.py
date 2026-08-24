from collections.abc import Iterable
from uuid import UUID

from fastapi import status
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from core.config import settings
from core.exceptions import AppError
from models.rbac import Permission, Role, RolePermission, UserRole
from models.user import User
from schemas.rbac import RoleCreate, RoleUpdate
from services.audit_service import AuditEvent, commit_with_audit

PERMISSIONS: dict[str, str] = {
    "portal.access": "Access the PEII portal.",
    "users.read": "View users.",
    "users.invite": "Invite users.",
    "users.update": "Update user profiles.",
    "users.assign_roles": "Assign user roles.",
    "users.change_status": "Activate or deactivate users.",
    "users.revoke_sessions": "Revoke user sessions.",
    "users.delete": "Delete user records.",
    "users.restore": "Restore user records.",
    "roles.read": "View roles and permissions.",
    "roles.manage": "Manage roles and permissions.",
    "audit_logs.read": "View audit logs.",
    "ml.models.read": "View ML models.",
    "ml.sentiment.run": "Run sentiment analysis.",
}

DEFAULT_ROLES: dict[str, set[str]] = {
    "admin": set(PERMISSIONS),
    "researcher": {
        "portal.access",
        "ml.models.read",
        "ml.sentiment.run",
    },
    "staff": {"portal.access", "ml.models.read"},
}

ADMIN_ROLE_NAME = "admin"


async def effective_permissions(session: AsyncSession, user_id: UUID) -> set[str]:
    result = await session.exec(
        select(Permission.code)
        .join(RolePermission, col(RolePermission.permission_id) == Permission.id)
        .join(Role, col(Role.id) == RolePermission.role_id)
        .join(UserRole, col(UserRole.role_id) == Role.id)
        .where(
            col(UserRole.user_id) == user_id,
            col(UserRole.is_deleted).is_(False),
            col(Role.is_deleted).is_(False),
            col(Role.is_active).is_(True),
            col(Permission.is_deleted).is_(False),
        )
    )
    return set(result.all())


async def effective_role_names(session: AsyncSession, user_id: UUID) -> list[str]:
    result = await session.exec(
        select(Role.name)
        .join(UserRole, col(UserRole.role_id) == Role.id)
        .where(
            col(UserRole.user_id) == user_id,
            col(UserRole.is_deleted).is_(False),
            col(Role.is_deleted).is_(False),
            col(Role.is_active).is_(True),
        )
        .order_by(col(Role.name))
    )
    return list(result.all())


async def lock_admin_role(session: AsyncSession) -> Role:
    """Serializes mutations that could leave the portal without an administrator."""
    result = await session.exec(
        select(Role)
        .where(
            col(Role.name) == ADMIN_ROLE_NAME,
            col(Role.is_system).is_(True),
            col(Role.is_deleted).is_(False),
        )
        .with_for_update()
    )
    role = result.first()
    if role is None:
        raise AppError("System Admin role is unavailable.", status_code=status.HTTP_409_CONFLICT)
    return role


async def user_has_admin_role(session: AsyncSession, user_id: UUID, admin_role_id: UUID) -> bool:
    result = await session.exec(
        select(UserRole.id).where(
            col(UserRole.user_id) == user_id,
            col(UserRole.role_id) == admin_role_id,
            col(UserRole.is_deleted).is_(False),
        )
    )
    return result.first() is not None


async def user_has_protected_admin_role(session: AsyncSession, user_id: UUID) -> bool:
    result = await session.exec(
        select(UserRole.id)
        .join(Role, col(Role.id) == UserRole.role_id)
        .where(
            col(UserRole.user_id) == user_id,
            col(UserRole.is_deleted).is_(False),
            col(Role.name) == ADMIN_ROLE_NAME,
            col(Role.is_system).is_(True),
            col(Role.is_deleted).is_(False),
        )
    )
    return result.first() is not None


async def assert_eligible_admin_remains(
    session: AsyncSession, excluded_user_id: UUID | None = None
) -> None:
    statement = (
        select(User.id)
        .join(UserRole, col(UserRole.user_id) == User.id)
        .join(Role, col(Role.id) == UserRole.role_id)
        .where(
            col(Role.name) == ADMIN_ROLE_NAME,
            col(Role.is_system).is_(True),
            col(Role.is_active).is_(True),
            col(Role.is_deleted).is_(False),
            col(UserRole.is_deleted).is_(False),
            col(User.is_active).is_(True),
            col(User.is_deleted).is_(False),
        )
        .limit(1)
    )
    if excluded_user_id is not None:
        statement = statement.where(col(User.id) != excluded_user_id)
    result = await session.exec(statement)
    if result.first() is None:
        raise AppError(
            "At least one active administrator must remain.",
            status_code=status.HTTP_409_CONFLICT,
        )


async def get_role_permissions(session: AsyncSession, role: Role) -> list[Permission]:
    result = await session.exec(
        select(Permission)
        .join(RolePermission, col(RolePermission.permission_id) == Permission.id)
        .where(col(RolePermission.role_id) == role.id, col(Permission.is_deleted).is_(False))
        .order_by(col(Permission.code))
    )
    return list(result.all())


async def ensure_permission_catalog(session: AsyncSession) -> None:
    existing = set((await session.exec(select(Permission.code))).all())
    for code, description in PERMISSIONS.items():
        if code not in existing:
            session.add(
                Permission(
                    code=code,
                    description=description,
                    performed_by=settings.SYSTEM_ACTOR_ID,
                )
            )
    await session.flush()

    permissions = {
        permission.code: permission for permission in (await session.exec(select(Permission))).all()
    }
    for role_name, codes in DEFAULT_ROLES.items():
        role_result = await session.exec(select(Role).where(col(Role.name) == role_name))
        role = role_result.first()
        if role is None:
            role = Role(
                name=role_name,
                description=f"System {role_name} role.",
                is_system=True,
                performed_by=settings.SYSTEM_ACTOR_ID,
            )
            session.add(role)
            await session.flush()
        assigned = set(
            (
                await session.exec(
                    select(Permission.code)
                    .join(RolePermission, col(RolePermission.permission_id) == Permission.id)
                    .where(col(RolePermission.role_id) == role.id)
                )
            ).all()
        )
        for code in codes - assigned:
            session.add(
                RolePermission(
                    role_id=role.id,
                    permission_id=permissions[code].id,
                    performed_by=settings.SYSTEM_ACTOR_ID,
                )
            )
    await commit_with_audit(
        session,
        [AuditEvent("seed", "permission_catalog", "default", settings.SYSTEM_ACTOR_ID)],
    )


async def create_role(
    session: AsyncSession, payload: RoleCreate, actor_id: UUID, ip_address: str | None
) -> Role:
    existing = (await session.exec(select(Role).where(col(Role.name) == payload.name))).first()
    if existing:
        raise AppError(
            "A role with this name already exists.", status_code=status.HTTP_409_CONFLICT
        )
    role = Role(name=payload.name, description=payload.description, performed_by=actor_id)
    session.add(role)
    await session.flush()
    await _replace_role_permissions(session, role, payload.permission_ids, actor_id)
    await commit_with_audit(
        session, [AuditEvent("create", "role", role.name, actor_id, ip_address=ip_address)]
    )
    await session.refresh(role)
    return role


async def update_role(
    session: AsyncSession, role: Role, payload: RoleUpdate, actor_id: UUID, ip_address: str | None
) -> Role:
    if role.is_system and payload.is_active is False:
        raise AppError("System roles cannot be deactivated.", status_code=status.HTTP_409_CONFLICT)
    if role.name == ADMIN_ROLE_NAME and role.is_system and payload.permission_ids is not None:
        raise AppError(
            "System Admin role permissions cannot be changed.",
            status_code=status.HTTP_409_CONFLICT,
        )
    if payload.description is not None:
        role.description = payload.description
    if payload.is_active is not None:
        role.is_active = payload.is_active
    role.performed_by = actor_id
    if payload.permission_ids is not None:
        await _replace_role_permissions(session, role, payload.permission_ids, actor_id)
    session.add(role)
    await commit_with_audit(
        session, [AuditEvent("update", "role", role.name, actor_id, ip_address=ip_address)]
    )
    await session.refresh(role)
    return role


async def _replace_role_permissions(
    session: AsyncSession, role: Role, permission_ids: Iterable[UUID], actor_id: UUID
) -> None:
    wanted = set(permission_ids)
    valid = (
        set((await session.exec(select(Permission.id).where(col(Permission.id).in_(wanted)))).all())
        if wanted
        else set()
    )
    if wanted != valid:
        raise AppError(
            "One or more permissions do not exist.",
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        )
    current = list(
        (
            await session.exec(select(RolePermission).where(col(RolePermission.role_id) == role.id))
        ).all()
    )
    for assignment in current:
        await session.delete(assignment)
    for permission_id in wanted:
        session.add(
            RolePermission(
                role_id=role.id,
                permission_id=permission_id,
                performed_by=actor_id,
            )
        )


async def set_user_roles(
    session: AsyncSession, user: User, role_ids: list[UUID], actor_id: UUID, ip_address: str | None
) -> None:
    admin_role = await lock_admin_role(session)
    roles = list(
        (
            await session.exec(
                select(Role).where(
                    col(Role.id).in_(set(role_ids)),
                    col(Role.is_active).is_(True),
                    col(Role.is_deleted).is_(False),
                )
            )
        ).all()
    )
    if len(roles) != len(set(role_ids)):
        raise AppError(
            "One or more roles are unavailable.", status_code=status.HTTP_422_UNPROCESSABLE_CONTENT
        )
    current = list(
        (await session.exec(select(UserRole).where(col(UserRole.user_id) == user.id))).all()
    )
    currently_admin = await user_has_admin_role(session, user.id, admin_role.id)
    will_remain_admin = admin_role.id in set(role_ids)
    if user.id == actor_id and currently_admin and not will_remain_admin:
        raise AppError(
            "Administrators cannot remove their own Admin role.",
            status_code=status.HTTP_409_CONFLICT,
        )
    if currently_admin and not will_remain_admin:
        await assert_eligible_admin_remains(session, excluded_user_id=user.id)
    for assignment in current:
        await session.delete(assignment)
    for role in roles:
        session.add(UserRole(user_id=user.id, role_id=role.id, performed_by=actor_id))
    await commit_with_audit(
        session, [AuditEvent("assign_roles", "user", user.user_id, actor_id, ip_address=ip_address)]
    )
