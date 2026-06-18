from uuid import UUID

from fastapi import status
from sqlalchemy import func, or_
from sqlmodel import Session, col, select

from core.exceptions import AppError
from models.user import User
from schemas.user import UserCreate, UserDelete, UserListQueryParams, UserRestore, UserUpdate
from services.base_service import apply_updates, utc_now
from utils.identifiers import generate_business_id
from utils.security import hash_password
from utils.sorting import stable_order_by


def _apply_user_list_filters(statement, params: UserListQueryParams):
    if not params.include_deleted:
        statement = statement.where(col(User.is_deleted).is_(False))

    if params.role is not None:
        statement = statement.where(col(User.role) == params.role)
    if params.is_active is not None:
        statement = statement.where(col(User.is_active) == params.is_active)
    if params.search is not None:
        search_term = f"%{params.search}%"
        statement = statement.where(
            or_(
                col(User.user_id).ilike(search_term),
                col(User.email).ilike(search_term),
                col(User.username).ilike(search_term),
                col(User.first_name).ilike(search_term),
                col(User.last_name).ilike(search_term),
            )
        )

    return statement


def list_users(session: Session, params: UserListQueryParams) -> tuple[list[User], int]:
    statement = select(User)
    statement = _apply_user_list_filters(statement, params)

    total_statement = _apply_user_list_filters(select(func.count()).select_from(User), params)
    total = session.exec(total_statement).one()

    sort_columns = {
        "created_at": User.created_at,
        "user_id": User.user_id,
        "email": User.email,
        "username": User.username,
        "last_name": User.last_name,
    }
    sort_column = sort_columns[params.sort_by]
    statement = stable_order_by(
        statement,
        sort_column,
        sort_order=params.sort_order,
        id_column=User.id,
    )
    statement = statement.offset(params.offset).limit(params.limit)
    users = list(session.exec(statement).all())
    return users, total


def get_user_by_id(session: Session, user_id: UUID, include_deleted: bool = False) -> User:
    user = session.get(User, user_id)
    if not user or (user.is_deleted and not include_deleted):
        raise AppError("User not found.", status_code=status.HTTP_404_NOT_FOUND)
    return user


def _raise_email_conflict(existing_user: User) -> None:
    if existing_user.is_deleted:
        raise AppError(
            "A deleted user with this email already exists. Restore that user instead.",
            status_code=status.HTTP_400_BAD_REQUEST,
        )
    raise AppError(
        "A user with this email already exists.",
        status_code=status.HTTP_400_BAD_REQUEST,
    )


def _raise_username_conflict(existing_user: User) -> None:
    if existing_user.is_deleted:
        raise AppError(
            "A deleted user with this username already exists. Restore that user instead.",
            status_code=status.HTTP_400_BAD_REQUEST,
        )
    raise AppError(
        "A user with this username already exists.",
        status_code=status.HTTP_400_BAD_REQUEST,
    )


def create_user(session: Session, payload: UserCreate) -> User:
    existing_user = session.exec(select(User).where(col(User.email) == payload.email)).first()
    if existing_user:
        _raise_email_conflict(existing_user)

    existing_username = session.exec(
        select(User).where(col(User.username) == payload.username)
    ).first()
    if existing_username:
        _raise_username_conflict(existing_username)

    user_data = payload.model_dump(exclude={"password"})
    user_data["password"] = hash_password(payload.password)
    user_data["user_id"] = generate_business_id("USER")
    user = User.model_validate(user_data)
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def update_user(session: Session, user_id: UUID, payload: UserUpdate) -> User:
    user = get_user_by_id(session, user_id)
    updates = payload.model_dump(exclude_unset=True)

    if "email" in updates and updates["email"] != user.email:
        existing_user = session.exec(
            select(User).where(col(User.email) == updates["email"])
        ).first()
        if existing_user and existing_user.id != user.id:
            _raise_email_conflict(existing_user)

    if "username" in updates and updates["username"] != user.username:
        existing_user = session.exec(
            select(User).where(col(User.username) == updates["username"])
        ).first()
        if existing_user and existing_user.id != user.id:
            _raise_username_conflict(existing_user)

    if "password" in updates:
        updates["password"] = hash_password(updates["password"])

    apply_updates(user, updates)
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def soft_delete_user(session: Session, user_id: UUID, payload: UserDelete) -> User:
    user = get_user_by_id(session, user_id)
    user.is_deleted = True
    user.deleted_at = utc_now()
    user.performed_by = payload.performed_by
    user.updated_at = utc_now()
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def restore_user(session: Session, user_id: UUID, payload: UserRestore) -> User:
    user = get_user_by_id(session, user_id, include_deleted=True)
    if not user.is_deleted:
        raise AppError("User is not deleted.", status_code=status.HTTP_400_BAD_REQUEST)

    user.is_deleted = False
    user.deleted_at = None
    user.performed_by = payload.performed_by
    user.updated_at = utc_now()
    session.add(user)
    session.commit()
    session.refresh(user)
    return user
