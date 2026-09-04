from uuid import UUID

from fastapi import APIRouter, Depends, Request, Response, status
from sqlmodel import col, select

from core.cache import build_cache_key, cache_get, cache_invalidate_prefix, cache_set
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


def _role_read(role: Role, permissions: list[Permission]) -> RoleRead:
    return RoleRead(
        id=role.id,
        name=role.name,
        description=role.description,
        is_system=role.is_system,
        is_active=role.is_active,
        permissions=[PermissionRead.model_validate(item) for item in permissions],
    )


async def _role_read_loaded(session: AsyncDBSession, role: Role) -> RoleRead:
    return _role_read(role, await rbac_service.get_role_permissions(session, role))


@router.get(
    "/permissions",
    response_model=APIResponse[list[PermissionRead]],
    dependencies=[Depends(require_permissions("roles.read"))],
    summary="List permissions",
    description="List the immutable permission catalog.",
)
async def list_permissions(
    session: AsyncDBSession, http_response: Response
) -> APIResponse[list[PermissionRead]]:
    http_response.headers["Cache-Control"] = "private, no-store, max-age=0"
    http_response.headers["Pragma"] = "no-cache"
    cache_key = build_cache_key("permissions")
    redis_cached = await cache_get("rbac", cache_key)
    if isinstance(redis_cached, list):
        try:
            http_response.headers["X-Cache"] = "HIT"
            return success_response(
                [PermissionRead.model_validate(item) for item in redis_cached]
            )
        except Exception:
            pass
    statement = (
        select(Permission)
        .where(col(Permission.is_deleted).is_(False))
        .order_by(col(Permission.code))
    )
    result = await session.exec(statement)
    response_permissions = [PermissionRead.model_validate(item) for item in result.all()]
    await cache_set(
        "rbac", cache_key, [item.model_dump(mode="json") for item in response_permissions]
    )
    http_response.headers["X-Cache"] = "MISS"
    return success_response(response_permissions)


@router.get(
    "/roles",
    response_model=APIResponse[list[RoleRead]],
    dependencies=[Depends(require_permissions("roles.read"))],
    summary="List roles",
    description="List configurable roles and their permissions.",
)
async def list_roles(
    session: AsyncDBSession, http_response: Response
) -> APIResponse[list[RoleRead]]:
    http_response.headers["Cache-Control"] = "private, no-store, max-age=0"
    http_response.headers["Pragma"] = "no-cache"
    cache_key = build_cache_key("roles")
    redis_cached = await cache_get("rbac", cache_key)
    if isinstance(redis_cached, list):
        try:
            http_response.headers["X-Cache"] = "HIT"
            return success_response([RoleRead.model_validate(item) for item in redis_cached])
        except Exception:
            pass
    statement = select(Role).where(col(Role.is_deleted).is_(False)).order_by(col(Role.name))
    result = await session.exec(statement)
    roles = list(result.all())
    permissions_by_role = await rbac_service.get_role_permissions_map(
        session, [role.id for role in roles]
    )
    response_roles = [_role_read(role, permissions_by_role.get(role.id, [])) for role in roles]
    await cache_set(
        "rbac", cache_key, [item.model_dump(mode="json") for item in response_roles]
    )
    http_response.headers["X-Cache"] = "MISS"
    return success_response(response_roles)


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
    await cache_invalidate_prefix("rbac")
    return success_response(await _role_read_loaded(session, role), message="Role created.")


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
    await cache_invalidate_prefix("rbac")
    return success_response(await _role_read_loaded(session, role), message="Role updated.")


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
    await cache_invalidate_prefix("rbac")
    await cache_invalidate_prefix("users")
    return success_response(None, message="User roles updated.")
