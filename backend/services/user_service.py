from uuid import UUID

from fastapi import status
from sqlmodel import Session, select

from core.exceptions import AppError
from models.user import User
from schemas.user import UserCreate, UserDelete, UserUpdate
from services.base_service import apply_updates, utc_now


def list_users(session: Session, include_deleted: bool = False) -> list[User]:
    statement = select(User)
    if not include_deleted:
        statement = statement.where(User.is_deleted.is_(False))
    statement = statement.order_by(User.created_at.desc())
    return list(session.exec(statement).all())


def get_user_by_id(session: Session, user_id: UUID, include_deleted: bool = False) -> User:
    user = session.get(User, user_id)
    if not user or (user.is_deleted and not include_deleted):
        raise AppError("User not found.", status_code=status.HTTP_404_NOT_FOUND)
    return user


def create_user(session: Session, payload: UserCreate) -> User:
    existing_user = session.exec(select(User).where(User.email == payload.email)).first()
    if existing_user and not existing_user.is_deleted:
        raise AppError("A user with this email already exists.", status_code=status.HTTP_400_BAD_REQUEST)

    user = User.model_validate(payload.model_dump())
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def update_user(session: Session, user_id: UUID, payload: UserUpdate) -> User:
    user = get_user_by_id(session, user_id)
    updates = payload.model_dump(exclude_unset=True)

    if "email" in updates and updates["email"] != user.email:
        existing_user = session.exec(select(User).where(User.email == updates["email"])).first()
        if existing_user and existing_user.id != user.id and not existing_user.is_deleted:
            raise AppError("A user with this email already exists.", status_code=status.HTTP_400_BAD_REQUEST)

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
