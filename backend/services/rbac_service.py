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
    "surveys.read": "View surveys.",
    "surveys.manage": "Create, update, structure, archive, and restore surveys.",
    "survey_distributions.manage": "Create, list, rotate, and revoke survey distributions.",
    "survey_responses.read_aggregates": "View aggregated survey responses.",
    "survey_responses.read_raw": "View raw survey responses.",
    "survey_responses.export": "Export survey responses.",
    "survey_responses.erase": "Erase survey responses.",
}

SHARED_SURVEY_CAPABILITIES = {
    "surveys.read",
    "surveys.manage",
    "survey_distributions.manage",
    "survey_responses.read_aggregates",
    "survey_responses.read_raw",
    "survey_responses.export",
    "survey_responses.erase",
}

DEFAULT_ROLES: dict[str, set[str]] = {
    "admin": set(PERMISSIONS),
    "researcher": {
        "portal.access",
        "ml.models.read",
        "ml.sentiment.run",
        *SHARED_SURVEY_CAPABILITIES - {"survey_responses.erase"},
    },
    "staff": {
        "portal.access",
        "ml.models.read",
        "surveys.read",
        "survey_responses.read_aggregates",
    },
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
            col(RolePermission.is_deleted).is_(False),
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
        .where(
            col(RolePermission.role_id) == role.id,
            col(RolePermission.is_deleted).is_(False),
            col(Permission.is_deleted).is_(False),
        )
        .order_by(col(Permission.code))
    )
    return list(result.all())


async def ensure_permission_catalog(session: AsyncSession) -> None:
    roles = list(
        (
            await session.exec(
                select(Role).where(col(Role.name).in_(set(DEFAULT_ROLES)))
            )
        ).all()
    )
    incompatible_roles = [
        role.name
        for role in roles
        if not role.is_system or not role.is_active or role.is_deleted
    ]
    if incompatible_roles:
        names = ", ".join(sorted(incompatible_roles))
        raise AppError(
            f"Canonical system role records are unavailable: {names}.",
            status_code=status.HTTP_409_CONFLICT,
        )

    permissions = {
        permission.code: permission
        for permission in (await session.exec(select(Permission))).all()
    }
    changed = False
    for code, description in PERMISSIONS.items():
        permission = permissions.get(code)
        if permission is None:
            permission = Permission(
                code=code,
                description=description,
                performed_by=settings.SYSTEM_ACTOR_ID,
            )
            session.add(permission)
            permissions[code] = permission
            changed = True
        elif permission.is_deleted:
            permission.is_deleted = False
            permission.deleted_at = None
            permission.performed_by = settings.SYSTEM_ACTOR_ID
            session.add(permission)
            changed = True
    await session.flush()

    active_permissions = {
        permission.code: permission
        for permission in (await session.exec(select(Permission))).all()
        if not permission.is_deleted
    }
    for role_name, codes in DEFAULT_ROLES.items():
        role_result = await session.exec(
            select(Role).where(col(Role.name) == role_name, col(Role.is_deleted).is_(False))
        )
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
            changed = True

        assignments = list(
            (
                await session.exec(
                    select(RolePermission).where(col(RolePermission.role_id) == role.id)
                )
            ).all()
        )
        assignments_by_permission = {
            assignment.permission_id: assignment for assignment in assignments
        }
        for code in codes:
            permission = active_permissions[code]
            assignment = assignments_by_permission.get(permission.id)
            if assignment is None:
                session.add(
                    RolePermission(
                        role_id=role.id,
                        permission_id=permission.id,
                        performed_by=settings.SYSTEM_ACTOR_ID,
                    )
                )
                changed = True
            elif assignment.is_deleted:
                assignment.is_deleted = False
                assignment.deleted_at = None
                assignment.performed_by = settings.SYSTEM_ACTOR_ID
                session.add(assignment)
                changed = True
    if not changed:
        return
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
        set(
            (
                await session.exec(
                    select(Permission.id).where(
                        col(Permission.id).in_(wanted),
                        col(Permission.is_deleted).is_(False),
                    )
                )
            ).all()
        )
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
