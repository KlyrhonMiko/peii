from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Request, status

from core.config import settings
from core.deps import AsyncDBSession, Principal, require_permissions
from core.exceptions import AppError
from core.responses import list_meta_response, success_response
from schemas.common import APIResponse
from schemas.user import (
    UserBatchCreate,
    UserCreate,
    UserDelete,
    UserListQueryParams,
    UserRead,
    UserRestore,
    UserUpdate,
)
from services import rbac_service, user_service

router = APIRouter()


def _invitation_redirect() -> str:
    if settings.APP_ORIGIN is None:
        raise AppError("Application origin is not configured.", status_code=503)
    return f"{settings.APP_ORIGIN}/auth/confirm?next=/reset-password"


def get_user_list_query_params(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    sort_order: Literal["asc", "desc"] = Query(default="desc"),
    include_deleted: bool = Query(default=False),
    sort_by: Literal["created_at", "user_id", "email", "username", "last_name"] = Query(
        default="created_at"
    ),
    is_active: bool | None = Query(default=None),
    is_deleted: bool | None = Query(default=None),
    search: str | None = Query(default=None, min_length=1),
) -> UserListQueryParams:
    return UserListQueryParams(
        limit=limit,
        offset=offset,
        sort_order=sort_order,
        include_deleted=include_deleted,
        sort_by=sort_by,
        is_active=is_active,
        is_deleted=is_deleted,
        search=search.strip() if search else None,
    )


UserListParams = Annotated[UserListQueryParams, Depends(get_user_list_query_params)]


async def _user_read(session: AsyncDBSession, user) -> UserRead:
    return UserRead.model_validate(user).model_copy(
        update={"roles": await rbac_service.effective_role_names(session, user.id)}
    )


@router.get(
    "/",
    response_model=APIResponse[list[UserRead]],
    summary="List Users",
    description="Query and list user records with offset pagination, filtering, and sorting.",
)
async def list_users(
    session: AsyncDBSession,
    params: UserListParams,
    _: Principal = Depends(require_permissions("users.read")),
) -> APIResponse[list[UserRead]]:
    users, total = await user_service.list_users(session, params)
    response_users = [await _user_read(session, user) for user in users]
    return success_response(
        response_users,
        meta=list_meta_response(
            filters=params,
            total=total,
            count=len(response_users),
            limit=params.limit,
            offset=params.offset,
        ),
    )


@router.post(
    "/batch",
    response_model=APIResponse[list[UserRead]],
    status_code=status.HTTP_201_CREATED,
    summary="Batch Create Users",
    description=(
        "Create multiple users at once under a single database transaction. "
        "Excludes password hashes from logs."
    ),
)
async def batch_create_users(
    payload: UserBatchCreate,
    session: AsyncDBSession,
    request: Request,
    principal: Principal = Depends(require_permissions("users.invite")),
) -> APIResponse[list[UserRead]]:
    ip_address = request.client.host if request.client else None
    users = await user_service.batch_create_users(
        session,
        payload.users,
        principal.user.id,
        _invitation_redirect(),
        ip_address=ip_address,
    )
    return success_response(
        [await _user_read(session, user) for user in users], message="Users created."
    )


@router.post(
    "/",
    response_model=APIResponse[UserRead],
    status_code=status.HTTP_201_CREATED,
    summary="Create User",
    description="Invite a user and create their linked local profile.",
)
async def create_user(
    payload: UserCreate,
    session: AsyncDBSession,
    request: Request,
    principal: Principal = Depends(require_permissions("users.invite")),
) -> APIResponse[UserRead]:
    ip_address = request.client.host if request.client else None
    user = await user_service.create_user(
        session,
        payload,
        principal.user.id,
        _invitation_redirect(),
        ip_address=ip_address,
    )
    return success_response(await _user_read(session, user), message="User created.")


@router.get(
    "/{user_id}",
    response_model=APIResponse[UserRead],
    summary="Get User",
    description="Retrieve a single user record by their unique business ID.",
)
async def get_user(
    user_id: str,
    session: AsyncDBSession,
    _: Principal = Depends(require_permissions("users.read")),
) -> APIResponse[UserRead]:
    user = await user_service.get_user(session, user_id)
    return success_response(await _user_read(session, user))


@router.post(
    "/{user_id}/invitation/resend",
    response_model=APIResponse[UserRead],
    summary="Resend User Invitation",
    description="Resend setup instructions to an active user who has not completed onboarding.",
)
async def resend_invitation(
    user_id: str,
    session: AsyncDBSession,
    request: Request,
    principal: Principal = Depends(require_permissions("users.invite")),
) -> APIResponse[UserRead]:
    ip_address = request.client.host if request.client else None
    user = await user_service.resend_invitation(
        session,
        user_id,
        principal.user.id,
        _invitation_redirect(),
        ip_address=ip_address,
    )
    return success_response(await _user_read(session, user), message="Invitation resent.")


@router.post(
    "/{user_id}/sessions/revoke",
    response_model=APIResponse[None],
    summary="Revoke User Sessions",
    description="Globally revoke all active Supabase sessions for a user.",
)
async def revoke_sessions(
    user_id: str,
    session: AsyncDBSession,
    request: Request,
    principal: Principal = Depends(require_permissions("users.revoke_sessions")),
) -> APIResponse[None]:
    ip_address = request.client.host if request.client else None
    await user_service.revoke_user_sessions(
        session, user_id, principal.user.id, ip_address=ip_address
    )
    return success_response(None, message="User sessions revoked.")


@router.patch(
    "/{user_id}",
    response_model=APIResponse[UserRead],
    summary="Update User",
    description="Partially update a user profile.",
)
async def update_user(
    user_id: str,
    payload: UserUpdate,
    session: AsyncDBSession,
    request: Request,
    principal: Principal = Depends(require_permissions("users.update")),
) -> APIResponse[UserRead]:
    if payload.is_active is not None and "users.change_status" not in principal.permissions:
        raise AppError("You do not have permission to perform this action.", status_code=403)
    ip_address = request.client.host if request.client else None
    user = await user_service.update_user(
        session, user_id, payload, principal.user.id, ip_address=ip_address
    )
    return success_response(await _user_read(session, user), message="User updated.")


@router.delete(
    "/{user_id}",
    response_model=APIResponse[UserRead],
    summary="Delete User (Soft)",
    description="Soft delete a user record by marking is_deleted=True.",
)
async def delete_user(
    user_id: str,
    payload: UserDelete,
    session: AsyncDBSession,
    request: Request,
    principal: Principal = Depends(require_permissions("users.delete")),
) -> APIResponse[UserRead]:
    ip_address = request.client.host if request.client else None
    user = await user_service.soft_delete_user(
        session, user_id, payload, principal.user.id, ip_address=ip_address
    )
    return success_response(await _user_read(session, user), message="User deleted.")


@router.post(
    "/{user_id}/restore",
    response_model=APIResponse[UserRead],
    summary="Restore User",
    description="Restore a soft-deleted user record.",
)
async def restore_user(
    user_id: str,
    payload: UserRestore,
    session: AsyncDBSession,
    request: Request,
    principal: Principal = Depends(require_permissions("users.restore")),
) -> APIResponse[UserRead]:
    ip_address = request.client.host if request.client else None
    user = await user_service.restore_user(
        session, user_id, payload, principal.user.id, ip_address=ip_address
    )
    return success_response(await _user_read(session, user), message="User restored.")
