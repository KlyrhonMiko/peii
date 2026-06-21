from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Request, status

from core.deps import AsyncDBSession
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
from services import user_service

router = APIRouter()


def get_user_list_query_params(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    sort_order: Literal["asc", "desc"] = Query(default="desc"),
    include_deleted: bool = Query(default=False),
    sort_by: Literal["created_at", "user_id", "email", "username", "last_name"] = Query(
        default="created_at"
    ),
    role: str | None = Query(default=None),
    is_active: bool | None = Query(default=None),
    search: str | None = Query(default=None, min_length=1),
) -> UserListQueryParams:
    return UserListQueryParams(
        limit=limit,
        offset=offset,
        sort_order=sort_order,
        include_deleted=include_deleted,
        sort_by=sort_by,
        role=role,
        is_active=is_active,
        search=search.strip() if search else None,
    )


UserListParams = Annotated[UserListQueryParams, Depends(get_user_list_query_params)]


@router.get(
    "/",
    response_model=APIResponse[list[UserRead]],
    summary="List Users",
    description="Query and list user records with offset pagination, filtering, and sorting.",
)
async def list_users(
    session: AsyncDBSession,
    params: UserListParams,
) -> APIResponse[list[UserRead]]:
    users, total = await user_service.list_users(session, params)
    response_users = [UserRead.model_validate(user) for user in users]
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
    payload: UserBatchCreate, session: AsyncDBSession, request: Request
) -> APIResponse[list[UserRead]]:
    ip_address = request.client.host if request.client else None
    users = await user_service.batch_create_users(session, payload.users, ip_address=ip_address)
    return success_response(
        [UserRead.model_validate(u) for u in users], message="Users created."
    )


@router.post(
    "/",
    response_model=APIResponse[UserRead],
    status_code=status.HTTP_201_CREATED,
    summary="Create User",
    description="Create a single user record with a unique business ID and Argon2 hashed password.",
)
async def create_user(
    payload: UserCreate, session: AsyncDBSession, request: Request
) -> APIResponse[UserRead]:
    ip_address = request.client.host if request.client else None
    user = await user_service.create_user(session, payload, ip_address=ip_address)
    return success_response(UserRead.model_validate(user), message="User created.")


@router.get(
    "/{user_id}",
    response_model=APIResponse[UserRead],
    summary="Get User",
    description="Retrieve a single user record by their unique business ID.",
)
async def get_user(user_id: str, session: AsyncDBSession) -> APIResponse[UserRead]:
    user = await user_service.get_user(session, user_id)
    return success_response(UserRead.model_validate(user))


@router.patch(
    "/{user_id}",
    response_model=APIResponse[UserRead],
    summary="Update User",
    description="Partially update a user record. Passwords will be re-hashed if updated.",
)
async def update_user(
    user_id: str,
    payload: UserUpdate,
    session: AsyncDBSession,
    request: Request,
) -> APIResponse[UserRead]:
    ip_address = request.client.host if request.client else None
    user = await user_service.update_user(session, user_id, payload, ip_address=ip_address)
    return success_response(UserRead.model_validate(user), message="User updated.")


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
) -> APIResponse[UserRead]:
    ip_address = request.client.host if request.client else None
    user = await user_service.soft_delete_user(session, user_id, payload, ip_address=ip_address)
    return success_response(UserRead.model_validate(user), message="User deleted.")


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
) -> APIResponse[UserRead]:
    ip_address = request.client.host if request.client else None
    user = await user_service.restore_user(session, user_id, payload, ip_address=ip_address)
    return success_response(UserRead.model_validate(user), message="User restored.")

