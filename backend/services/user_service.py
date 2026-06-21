from fastapi import status
from sqlalchemy import func, or_
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from core.exceptions import AppError
from models.user import User
from schemas.user import UserCreate, UserDelete, UserListQueryParams, UserRestore, UserUpdate
from services.audit_service import record_audit
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


async def list_users(session: AsyncSession, params: UserListQueryParams) -> tuple[list[User], int]:
    statement = select(User)
    statement = _apply_user_list_filters(statement, params)

    total_statement = _apply_user_list_filters(select(func.count()).select_from(User), params)
    total_result = await session.exec(total_statement)
    total = total_result.one()

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
    users_result = await session.exec(statement)
    users = list(users_result.all())
    return users, total


async def get_user(session: AsyncSession, user_id: str, include_deleted: bool = False) -> User:
    result = await session.exec(select(User).where(col(User.user_id) == user_id))
    user = result.first()
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


async def batch_create_users(
    session: AsyncSession, payloads: list[UserCreate], ip_address: str | None = None
) -> list[User]:
    emails = [p.email for p in payloads]
    usernames = [p.username for p in payloads]

    if len(emails) != len(set(emails)):
        raise AppError("Duplicate email in batch.", status_code=status.HTTP_400_BAD_REQUEST)
    if len(usernames) != len(set(usernames)):
        raise AppError("Duplicate username in batch.", status_code=status.HTTP_400_BAD_REQUEST)

    existing_emails_result = await session.exec(
        select(User.email).where(col(User.email).in_(emails))
    )
    existing_emails = existing_emails_result.all()
    if existing_emails:
        raise AppError(
            "Some emails already exist.", status_code=status.HTTP_400_BAD_REQUEST
        )

    existing_usernames_result = await session.exec(
        select(User.username).where(col(User.username).in_(usernames))
    )
    existing_usernames = existing_usernames_result.all()
    if existing_usernames:
        raise AppError(
            "Some usernames already exist.", status_code=status.HTTP_400_BAD_REQUEST
        )

    users = []
    for payload in payloads:
        user_data = payload.model_dump(exclude={"password"})
        user_data["password"] = hash_password(payload.password)
        user_data["user_id"] = generate_business_id("USER")
        user = User.model_validate(user_data)
        session.add(user)
        users.append(user)

    await session.commit()
    for user in users:
        await session.refresh(user)
        await record_audit(
            session,
            action="create",
            resource_type="user",
            resource_id=user.user_id,
            performed_by=user.performed_by,
            ip_address=ip_address,
        )
    return users


async def create_user(
    session: AsyncSession, payload: UserCreate, ip_address: str | None = None
) -> User:
    existing_user_result = await session.exec(select(User).where(col(User.email) == payload.email))
    existing_user = existing_user_result.first()
    if existing_user:
        _raise_email_conflict(existing_user)

    existing_username_result = await session.exec(
        select(User).where(col(User.username) == payload.username)
    )
    existing_username = existing_username_result.first()
    if existing_username:
        _raise_username_conflict(existing_username)

    user_data = payload.model_dump(exclude={"password"})
    user_data["password"] = hash_password(payload.password)
    user_data["user_id"] = generate_business_id("USER")
    user = User.model_validate(user_data)
    session.add(user)
    await session.commit()
    await session.refresh(user)
    await record_audit(
        session,
        action="create",
        resource_type="user",
        resource_id=user.user_id,
        performed_by=user.performed_by,
        ip_address=ip_address,
    )
    return user


async def update_user(
    session: AsyncSession, user_id: str, payload: UserUpdate, ip_address: str | None = None
) -> User:
    user = await get_user(session, user_id)
    updates = payload.model_dump(exclude_unset=True)

    # Compute changes for auditing
    changes = {}
    for key, val in updates.items():
        if key in ("password", "performed_by"):
            continue
        old_val = getattr(user, key)
        if old_val != val:
            changes[key] = val

    if "email" in updates and updates["email"] != user.email:
        existing_user_result = await session.exec(
            select(User).where(col(User.email) == updates["email"])
        )
        existing_user = existing_user_result.first()
        if existing_user and existing_user.id != user.id:
            _raise_email_conflict(existing_user)

    if "username" in updates and updates["username"] != user.username:
        existing_user_result = await session.exec(
            select(User).where(col(User.username) == updates["username"])
        )
        existing_user = existing_user_result.first()
        if existing_user and existing_user.id != user.id:
            _raise_username_conflict(existing_user)

    if "password" in updates:
        updates["password"] = hash_password(updates["password"])

    apply_updates(user, updates)
    session.add(user)
    await session.commit()
    await session.refresh(user)
    await record_audit(
        session,
        action="update",
        resource_type="user",
        resource_id=user.user_id,
        performed_by=payload.performed_by,
        changes=changes if changes else None,
        ip_address=ip_address,
    )
    return user


async def soft_delete_user(
    session: AsyncSession, user_id: str, payload: UserDelete, ip_address: str | None = None
) -> User:
    user = await get_user(session, user_id)
    user.is_deleted = True
    user.deleted_at = utc_now()
    user.performed_by = payload.performed_by
    user.updated_at = utc_now()
    session.add(user)
    await session.commit()
    await session.refresh(user)
    await record_audit(
        session,
        action="delete",
        resource_type="user",
        resource_id=user.user_id,
        performed_by=payload.performed_by,
        ip_address=ip_address,
    )
    return user


async def restore_user(
    session: AsyncSession, user_id: str, payload: UserRestore, ip_address: str | None = None
) -> User:
    user = await get_user(session, user_id, include_deleted=True)
    if not user.is_deleted:
        raise AppError("User is not deleted.", status_code=status.HTTP_400_BAD_REQUEST)

    user.is_deleted = False
    user.deleted_at = None
    user.performed_by = payload.performed_by
    user.updated_at = utc_now()
    session.add(user)
    await session.commit()
    await session.refresh(user)
    await record_audit(
        session,
        action="restore",
        resource_type="user",
        resource_id=user.user_id,
        performed_by=payload.performed_by,
        ip_address=ip_address,
    )
    return user


