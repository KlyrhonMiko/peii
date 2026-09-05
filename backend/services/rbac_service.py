import time
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
    "survey_responses.read_identity": "View verified respondent identity snapshots.",
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
        "survey_responses.read_identity",
    },
    "staff": {
        "portal.access",
        "ml.models.read",
        "surveys.read",
        "survey_responses.read_aggregates",
    },
}

ADMIN_ROLE_NAME = "admin"

# Short-TTL caches for read-hot permission resolution. Mutating/locked flows
# (set_user_roles, role updates, permission-scope locks) keep using the uncached
# functions so they always observe fresh rows; invalidate_permission_cache clears
# these caches after every RBAC mutation.
_PERMISSION_CACHE: dict[UUID, tuple[float, frozenset[str]]] = {}
_ROLE_NAME_CACHE: dict[UUID, tuple[float, tuple[str, ...]]] = {}


def invalidate_permission_cache() -> None:
    _PERMISSION_CACHE.clear()
    _ROLE_NAME_CACHE.clear()


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


async def effective_permissions_cached(session: AsyncSession, user_id: UUID) -> set[str]:
    """Effective permissions with a short TTL cache for read-hot request paths."""
    ttl = settings.PERMISSION_CACHE_TTL_SECONDS
    if ttl <= 0:
        return await effective_permissions(session, user_id)
    cached = _PERMISSION_CACHE.get(user_id)
    if cached is not None and cached[0] > time.monotonic():
        return set(cached[1])
    permissions = await effective_permissions(session, user_id)
    _PERMISSION_CACHE[user_id] = (time.monotonic() + ttl, frozenset(permissions))
    return permissions


async def effective_role_names_cached(session: AsyncSession, user_id: UUID) -> list[str]:
    """Effective role names with a short TTL cache for read-hot request paths."""
    ttl = settings.PERMISSION_CACHE_TTL_SECONDS
    if ttl <= 0:
        return await effective_role_names(session, user_id)
    cached = _ROLE_NAME_CACHE.get(user_id)
    if cached is not None and cached[0] > time.monotonic():
        return list(cached[1])
    roles = await effective_role_names(session, user_id)
    _ROLE_NAME_CACHE[user_id] = (time.monotonic() + ttl, tuple(roles))
    return roles


async def effective_role_names_map(
    session: AsyncSession, user_ids: Iterable[UUID]
) -> dict[UUID, list[str]]:
    """Resolve active role names for many users in one query."""
    ids = list(user_ids)
    if not ids:
        return {}
    result = await session.exec(
        select(UserRole.user_id, Role.name)
        .join(Role, col(Role.id) == UserRole.role_id)
        .where(
            col(UserRole.user_id).in_(ids),
            col(UserRole.is_deleted).is_(False),
            col(Role.is_deleted).is_(False),
            col(Role.is_active).is_(True),
        )
        .order_by(col(UserRole.user_id), col(Role.name))
    )
    roles_by_user: dict[UUID, list[str]] = {user_id: [] for user_id in ids}
    for user_id, name in result.all():
        roles_by_user[user_id].append(name)
    return roles_by_user


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


async def user_is_active_admin(session: AsyncSession, user_id: UUID, admin_role_id: UUID) -> bool:
    result = await session.exec(
        select(UserRole.id)
        .join(Role, col(Role.id) == UserRole.role_id)
        .join(User, col(User.id) == UserRole.user_id)
        .where(
            col(UserRole.user_id) == user_id,
            col(UserRole.role_id) == admin_role_id,
            col(UserRole.is_deleted).is_(False),
            col(Role.name) == ADMIN_ROLE_NAME,
            col(Role.is_system).is_(True),
            col(Role.is_active).is_(True),
            col(Role.is_deleted).is_(False),
            col(User.is_active).is_(True),
            col(User.is_deleted).is_(False),
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


async def get_role_permissions_map(
    session: AsyncSession, role_ids: Iterable[UUID]
) -> dict[UUID, list[Permission]]:
    """Resolve active permissions for many roles in one query."""
    ids = list(role_ids)
    if not ids:
        return {}
    result = await session.exec(
        select(RolePermission.role_id, Permission)
        .join(Permission, col(Permission.id) == RolePermission.permission_id)
        .where(
            col(RolePermission.role_id).in_(ids),
            col(RolePermission.is_deleted).is_(False),
            col(Permission.is_deleted).is_(False),
        )
        .order_by(col(RolePermission.role_id), col(Permission.code))
    )
    permissions_by_role: dict[UUID, list[Permission]] = {role_id: [] for role_id in ids}
    for role_id, permission in result.all():
        permissions_by_role[role_id].append(permission)
    return permissions_by_role


async def _lock_role(session: AsyncSession, role_id: UUID) -> Role:
    result = await session.exec(
        select(Role)
        .where(col(Role.id) == role_id, col(Role.is_deleted).is_(False))
        .with_for_update()
    )
    role = result.first()
    if role is None:
        raise AppError("Role not found.", status_code=status.HTTP_404_NOT_FOUND)
    return role


async def _lock_actor_permission_scope(
    session: AsyncSession, actor_id: UUID
) -> set[str]:
    """Lock the rows that define the actor's current effective permissions."""
    assignment_result = await session.exec(
        select(UserRole)
        .where(col(UserRole.user_id) == actor_id)
        .order_by(col(UserRole.role_id), col(UserRole.id))
        .with_for_update()
    )
    assignments = list(assignment_result.all())
    role_ids = {assignment.role_id for assignment in assignments}
    if role_ids:
        role_result = await session.exec(
            select(Role)
            .where(col(Role.id).in_(role_ids))
            .order_by(col(Role.id))
            .with_for_update()
        )
        locked_role_ids = {role.id for role in role_result.all()}
        role_permission_result = await session.exec(
            select(RolePermission)
            .where(col(RolePermission.role_id).in_(locked_role_ids))
            .order_by(
                col(RolePermission.role_id),
                col(RolePermission.permission_id),
                col(RolePermission.id),
            )
            .with_for_update()
        )
        role_permission_result.all()
    return await effective_permissions(session, actor_id)


async def _lock_role_and_actor_permission_scope(
    session: AsyncSession, role_id: UUID, actor_id: UUID
) -> tuple[Role, set[str]]:
    """Lock a target role and the actor's permission graph in a stable order."""
    assignment_result = await session.exec(
        select(UserRole)
        .where(col(UserRole.user_id) == actor_id)
        .order_by(col(UserRole.role_id), col(UserRole.id))
        .with_for_update()
    )
    assignments = list(assignment_result.all())
    actor_role_ids = {assignment.role_id for assignment in assignments}
    role_ids = actor_role_ids | {role_id}

    role_result = await session.exec(
        select(Role)
        .where(col(Role.id).in_(role_ids), col(Role.is_deleted).is_(False))
        .order_by(col(Role.id))
        .with_for_update()
    )
    roles = list(role_result.all())
    role = next((item for item in roles if item.id == role_id), None)
    if role is None:
        raise AppError("Role not found.", status_code=status.HTTP_404_NOT_FOUND)

    role_permission_result = await session.exec(
        select(RolePermission)
        .where(col(RolePermission.role_id).in_(role_ids))
        .order_by(
            col(RolePermission.role_id),
            col(RolePermission.permission_id),
            col(RolePermission.id),
        )
        .with_for_update()
    )
    role_permission_result.all()
    return role, await effective_permissions(session, actor_id)


async def _validated_permission_ids(
    session: AsyncSession, permission_ids: Iterable[UUID]
) -> tuple[set[UUID], set[str]]:
    wanted = set(permission_ids)
    if not wanted:
        return set(), set()

    result = await session.exec(
        select(Permission).where(
            col(Permission.id).in_(wanted),
            col(Permission.is_deleted).is_(False),
        )
    )
    permissions = list(result.all())
    valid_ids = {permission.id for permission in permissions}
    if wanted != valid_ids:
        raise AppError(
            "One or more permissions do not exist.",
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        )
    return wanted, {permission.code for permission in permissions}


def _assert_permission_scope(
    permission_codes: set[str], actor_permissions: set[str]
) -> None:
    if not permission_codes.issubset(actor_permissions):
        raise AppError(
            "You cannot assign permissions exceeding your own.",
            status_code=status.HTTP_403_FORBIDDEN,
        )


async def create_role(
    session: AsyncSession, payload: RoleCreate, actor_id: UUID, ip_address: str | None
) -> Role:
    existing = (await session.exec(select(Role).where(col(Role.name) == payload.name))).first()
    if existing:
        raise AppError(
            "A role with this name already exists.", status_code=status.HTTP_409_CONFLICT
        )
    wanted, permission_codes = await _validated_permission_ids(session, payload.permission_ids)
    actor_permissions = await _lock_actor_permission_scope(session, actor_id)
    _assert_permission_scope(permission_codes, actor_permissions)
    role = Role(name=payload.name, description=payload.description, performed_by=actor_id)
    session.add(role)
    await session.flush()
    await _replace_role_permissions(session, role, wanted, actor_id)
    await commit_with_audit(
        session, [AuditEvent("create", "role", role.name, actor_id, ip_address=ip_address)]
    )
    await session.refresh(role)
    return role


async def update_role(
    session: AsyncSession, role: Role, payload: RoleUpdate, actor_id: UUID, ip_address: str | None
) -> Role:
    wanted: set[UUID] | None = None
    if payload.permission_ids is not None:
        role, actor_permissions = await _lock_role_and_actor_permission_scope(
            session, role.id, actor_id
        )
    else:
        role = await _lock_role(session, role.id)

    if role.is_system and payload.is_active is False:
        raise AppError("System roles cannot be deactivated.", status_code=status.HTTP_409_CONFLICT)
    if role.name == ADMIN_ROLE_NAME and role.is_system and payload.permission_ids is not None:
        raise AppError(
            "System Admin role permissions cannot be changed.",
            status_code=status.HTTP_409_CONFLICT,
        )
    if payload.permission_ids is not None:
        wanted, permission_codes = await _validated_permission_ids(session, payload.permission_ids)
        _assert_permission_scope(permission_codes, actor_permissions)
    if payload.description is not None:
        role.description = payload.description
    if payload.is_active is not None:
        role.is_active = payload.is_active
    role.performed_by = actor_id
    if wanted is not None:
        await _replace_role_permissions(session, role, wanted, actor_id)
    session.add(role)
    await commit_with_audit(
        session, [AuditEvent("update", "role", role.name, actor_id, ip_address=ip_address)]
    )
    invalidate_permission_cache()
    await session.refresh(role)
    return role


async def _replace_role_permissions(
    session: AsyncSession, role: Role, permission_ids: Iterable[UUID], actor_id: UUID
) -> None:
    wanted = set(permission_ids)
    current = list(
        (
            await session.exec(
                select(RolePermission)
                .where(col(RolePermission.role_id) == role.id)
                .order_by(col(RolePermission.id))
                .with_for_update()
            )
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
    requested_role_ids = set(role_ids)
    roles = list(
        (
            await session.exec(
                select(Role).where(
                    col(Role.id).in_(requested_role_ids),
                    col(Role.is_active).is_(True),
                    col(Role.is_deleted).is_(False),
                )
            )
        ).all()
    )
    if len(roles) != len(requested_role_ids):
        raise AppError(
            "One or more roles are unavailable.", status_code=status.HTTP_422_UNPROCESSABLE_CONTENT
        )
    actor_permissions = await effective_permissions(session, actor_id)
    role_permissions_by_role = await get_role_permissions_map(
        session, [role.id for role in roles]
    )
    for role in roles:
        if role.id == admin_role.id and not await user_is_active_admin(
            session, actor_id, admin_role.id
        ):
            raise AppError(
                "Only active administrators may assign the system Admin role.",
                status_code=status.HTTP_403_FORBIDDEN,
            )
        role_permissions = {
            permission.code for permission in role_permissions_by_role.get(role.id, [])
        }
        if not role_permissions.issubset(actor_permissions):
            raise AppError(
                "You cannot assign a role with permissions exceeding your own.",
                status_code=status.HTTP_403_FORBIDDEN,
            )
    current = list(
        (await session.exec(select(UserRole).where(col(UserRole.user_id) == user.id))).all()
    )
    currently_admin = await user_has_admin_role(session, user.id, admin_role.id)
    will_remain_admin = admin_role.id in requested_role_ids
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
    invalidate_permission_cache()
