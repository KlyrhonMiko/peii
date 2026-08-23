from collections.abc import Iterable
from uuid import UUID

from fastapi import status
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from core.config import settings
from core.exceptions import AppError
from models.rbac import Permission, Role, RolePermission, UserRole
from models.survey import Survey
from models.survey_membership import SurveyMembership
from models.user import User
from schemas.rbac import RoleCreate, RoleUpdate
from services.audit_service import AuditEvent, commit_with_audit

PERMISSIONS: dict[str, str] = {
    "portal.access": "Access the PEII portal.",
    "analytics.read": "View aggregate analytics.",
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
    "surveys.access_all": "Access every survey.",
    "surveys.read": "Read accessible surveys.",
    "surveys.create": "Create surveys.",
    "surveys.update": "Update accessible surveys.",
    "surveys.publish": "Activate or close accessible surveys.",
    "surveys.delete": "Delete accessible surveys.",
    "surveys.restore": "Restore accessible surveys.",
    "surveys.share": "Manage survey collaborators.",
    "surveys.transfer": "Transfer survey ownership.",
    "survey_structure.manage": "Manage survey structure.",
    "survey_distributions.read": "View survey distributions.",
    "survey_distributions.manage": "Manage survey distributions.",
    "survey_distributions.read_token": "View survey bearer tokens.",
    "survey_responses.read_aggregates": "View aggregate responses.",
    "survey_responses.read_raw": "View raw survey responses.",
    "ml.models.read": "View ML models.",
    "ml.sentiment.run": "Run sentiment analysis.",
}

DEFAULT_ROLES: dict[str, set[str]] = {
    "admin": set(PERMISSIONS),
    "researcher": {
        "portal.access",
        "analytics.read",
        "surveys.read",
        "surveys.create",
        "surveys.update",
        "surveys.publish",
        "surveys.delete",
        "surveys.restore",
        "surveys.share",
        "surveys.transfer",
        "survey_structure.manage",
        "survey_distributions.read",
        "survey_distributions.manage",
        "survey_distributions.read_token",
        "survey_responses.read_aggregates",
        "ml.models.read",
        "ml.sentiment.run",
    },
    "staff": {"portal.access", "analytics.read", "ml.models.read"},
}


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


async def assert_survey_access(
    session: AsyncSession,
    user: User,
    permissions: set[str],
    survey: Survey,
    *,
    write: bool = False,
) -> str:
    if "surveys.access_all" in permissions:
        return "owner"
    if survey.owner_id == user.id:
        return "owner"
    membership_result = await session.exec(
        select(SurveyMembership).where(
            col(SurveyMembership.survey_id) == survey.id,
            col(SurveyMembership.user_id) == user.id,
            col(SurveyMembership.is_deleted).is_(False),
        )
    )
    membership = membership_result.first()
    if membership and (not write or membership.access_level == "editor"):
        return membership.access_level
    raise AppError("Survey not found.", status_code=status.HTTP_404_NOT_FOUND)


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
    for assignment in current:
        await session.delete(assignment)
    for role in roles:
        session.add(UserRole(user_id=user.id, role_id=role.id, performed_by=actor_id))
    await commit_with_audit(
        session, [AuditEvent("assign_roles", "user", user.user_id, actor_id, ip_address=ip_address)]
    )
