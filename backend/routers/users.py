from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status

from core.deps import DBSession
from core.responses import list_meta_response, success_response
from schemas.common import APIResponse
from schemas.user import UserCreate, UserDelete, UserListQueryParams, UserRead, UserUpdate
from services import user_service

router = APIRouter()


def get_user_list_query_params(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    sort_order: Literal["asc", "desc"] = Query(default="desc"),
    include_deleted: bool = Query(default=False),
    sort_by: Literal["created_at", "email", "username", "last_name"] = Query(default="created_at"),
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


@router.get("/", response_model=APIResponse[list[UserRead]])
def list_users(
    session: DBSession,
    params: UserListParams,
) -> APIResponse[list[UserRead]]:
    users, total = user_service.list_users(session, params)
    return success_response(
        users,
        meta=list_meta_response(
            filters=params,
            total=total,
            count=len(users),
            limit=params.limit,
            offset=params.offset,
        ),
    )


@router.post("/", response_model=APIResponse[UserRead], status_code=status.HTTP_201_CREATED)
def create_user(payload: UserCreate, session: DBSession) -> APIResponse[UserRead]:
    user = user_service.create_user(session, payload)
    return success_response(user, message="User created.")


@router.get("/{user_id}", response_model=APIResponse[UserRead])
def get_user(user_id: UUID, session: DBSession) -> APIResponse[UserRead]:
    user = user_service.get_user_by_id(session, user_id)
    return success_response(user)


@router.patch("/{user_id}", response_model=APIResponse[UserRead])
def update_user(
    user_id: UUID,
    payload: UserUpdate,
    session: DBSession,
) -> APIResponse[UserRead]:
    user = user_service.update_user(session, user_id, payload)
    return success_response(user, message="User updated.")


@router.delete("/{user_id}", response_model=APIResponse[UserRead])
def delete_user(
    user_id: UUID,
    payload: UserDelete,
    session: DBSession,
) -> APIResponse[UserRead]:
    user = user_service.soft_delete_user(session, user_id, payload)
    return success_response(user, message="User deleted.")
