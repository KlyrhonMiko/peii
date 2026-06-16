from uuid import UUID

from fastapi import APIRouter, Query, status

from core.deps import DBSession
from core.responses import success_response
from schemas.common import APIResponse
from schemas.user import UserCreate, UserDelete, UserRead, UserUpdate
from services import user_service

router = APIRouter()


@router.get("/", response_model=APIResponse[list[UserRead]])
def list_users(
    session: DBSession,
    include_deleted: bool = Query(default=False),
) -> APIResponse[list[UserRead]]:
    users = user_service.list_users(session, include_deleted=include_deleted)
    return success_response(users, meta={"include_deleted": include_deleted, "count": len(users)})


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
