from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr

from schemas.common import ListQueryParams


class UserBaseSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class UserBase(UserBaseSchema):
    email: EmailStr
    username: str
    role: str
    first_name: str
    last_name: str
    middle_name: str | None = None
    contact: str | None = None
    is_active: bool = True


class UserCreate(UserBase):
    password: str
    performed_by: UUID | None = None


class UserBatchCreate(BaseModel):
    users: list[UserCreate]


class UserUpdate(UserBaseSchema):
    email: EmailStr | None = None
    username: str | None = None
    password: str | None = None
    role: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    middle_name: str | None = None
    contact: str | None = None
    is_active: bool | None = None
    performed_by: UUID | None = None


class UserRead(UserBase):
    user_id: str
    created_at: datetime
    updated_at: datetime
    is_deleted: bool
    deleted_at: datetime | None = None
    performed_by: UUID | None = None


class UserDelete(UserBaseSchema):
    performed_by: UUID | None = None


class UserRestore(UserBaseSchema):
    performed_by: UUID | None = None


class UserListQueryParams(ListQueryParams):
    role: str | None = None
    is_active: bool | None = None
    search: str | None = None
    sort_by: Literal["created_at", "user_id", "email", "username", "last_name"] = (
        "created_at"
    )
