from uuid import UUID

from fastapi import APIRouter, Depends, Request, status
from sqlmodel import col, select

from core.deps import AsyncDBSession, CurrentPrincipal, require_permissions
from core.exceptions import AppError
from core.responses import success_response
from models.rbac import Permission, Role
from models.user import User
from schemas.common import APIResponse
from schemas.rbac import PermissionRead, RoleCreate, RoleRead, RoleUpdate, UserRoleUpdate
from services import rbac_service

router = APIRouter()


def _ip_address(request: Request) -> str | None:
    return request.client.host if request.client else None


async def _role_read(session: AsyncDBSession, role: Role) -> RoleRead:
    permissions = await rbac_service.get_role_permissions(session, role)
    return RoleRead(
        id=role.id,
        name=role.name,
        description=role.description,
        is_system=role.is_system,
        is_active=role.is_active,
        permissions=[PermissionRead.model_validate(item) for item in permissions],
    )


@router.get(
    "/permissions",
    response_model=APIResponse[list[PermissionRead]],
    dependencies=[Depends(require_permissions("roles.read"))],
    summary="List permissions",
    description="List the immutable permission catalog.",
)
async def list_permissions(session: AsyncDBSession) -> APIResponse[list[PermissionRead]]:
    statement = (
        select(Permission)
        .where(col(Permission.is_deleted).is_(False))
        .order_by(col(Permission.code))
    )
    result = await session.exec(statement)
    return success_response([PermissionRead.model_validate(item) for item in result.all()])


@router.get(
    "/roles",
    response_model=APIResponse[list[RoleRead]],
    dependencies=[Depends(require_permissions("roles.read"))],
    summary="List roles",
    description="List configurable roles and their permissions.",
)
async def list_roles(session: AsyncDBSession) -> APIResponse[list[RoleRead]]:
    statement = select(Role).where(col(Role.is_deleted).is_(False)).order_by(col(Role.name))
    result = await session.exec(statement)
    return success_response([await _role_read(session, role) for role in result.all()])


@router.post(
    "/roles",
    response_model=APIResponse[RoleRead],
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permissions("roles.manage"))],
    summary="Create role",
    description="Create a configurable role from catalog permissions.",
)
async def create_role(
    payload: RoleCreate,
    session: AsyncDBSession,
    principal: CurrentPrincipal,
    request: Request,
) -> APIResponse[RoleRead]:
    role = await rbac_service.create_role(session, payload, principal.user.id, _ip_address(request))
    return success_response(await _role_read(session, role), message="Role created.")


@router.patch(
    "/roles/{role_id}",
    response_model=APIResponse[RoleRead],
    dependencies=[Depends(require_permissions("roles.manage"))],
    summary="Update role",
    description="Update a role's state and permission composition.",
)
async def update_role(
    role_id: UUID,
    payload: RoleUpdate,
    session: AsyncDBSession,
    principal: CurrentPrincipal,
    request: Request,
) -> APIResponse[RoleRead]:
    statement = select(Role).where(col(Role.id) == role_id, col(Role.is_deleted).is_(False))
    role = (await session.exec(statement)).first()
    if role is None:
        raise AppError("Role not found.", status_code=404)
    role = await rbac_service.update_role(
        session, role, payload, principal.user.id, _ip_address(request)
    )
    return success_response(await _role_read(session, role), message="Role updated.")


@router.put(
    "/users/{user_id}/roles",
    response_model=APIResponse[None],
    dependencies=[Depends(require_permissions("users.assign_roles"))],
    summary="Assign user roles",
    description="Replace a user's active role assignments.",
)
async def assign_user_roles(
    user_id: str,
    payload: UserRoleUpdate,
    session: AsyncDBSession,
    principal: CurrentPrincipal,
    request: Request,
) -> APIResponse[None]:
    statement = select(User).where(col(User.user_id) == user_id, col(User.is_deleted).is_(False))
    user = (await session.exec(statement)).first()
    if user is None:
        raise AppError("User not found.", status_code=404)
    await rbac_service.set_user_roles(
        session, user, payload.role_ids, principal.user.id, _ip_address(request)
    )
    return success_response(None, message="User roles updated.")
