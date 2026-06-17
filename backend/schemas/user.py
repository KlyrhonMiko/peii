from datetime import datetime
from typing import Literal, Optional
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
    middle_name: Optional[str] = None
    contact: Optional[str] = None
    is_active: bool = True


class UserCreate(UserBase):
    password: str
    performed_by: Optional[UUID] = None


class UserUpdate(UserBaseSchema):
    email: Optional[EmailStr] = None
    username: Optional[str] = None
    password: Optional[str] = None
    role: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    middle_name: Optional[str] = None
    contact: Optional[str] = None
    is_active: Optional[bool] = None
    performed_by: Optional[UUID] = None


class UserRead(UserBase):
    id: UUID
    created_at: datetime
    updated_at: datetime
    is_deleted: bool
    deleted_at: Optional[datetime] = None
    performed_by: Optional[UUID] = None


class UserDelete(UserBaseSchema):
    performed_by: Optional[UUID] = None


class UserListQueryParams(ListQueryParams):
    role: Optional[str] = None
    is_active: Optional[bool] = None
    search: Optional[str] = None
    sort_by: Literal["created_at", "email", "username", "last_name"] = "created_at"
