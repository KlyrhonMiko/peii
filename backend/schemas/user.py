from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr

from schemas.common import ListQueryParams


class UserBaseSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")


class UserBase(UserBaseSchema):
    email: EmailStr
    username: str
    first_name: str
    last_name: str
    middle_name: str | None = None
    contact: str | None = None
    is_active: bool = True


class UserCreate(UserBase):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "email": "jane.doe@example.com",
                "username": "janedoe",
                "first_name": "Jane",
                "last_name": "Doe",
                "middle_name": "Marie",
                "contact": "+1234567890",
                "is_active": True,
            }
        }
    )


class UserBatchCreate(BaseModel):
    users: list[UserCreate]


class UserUpdate(UserBaseSchema):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "first_name": "Janet",
                "contact": "+1987654321",
            }
        }
    )

    username: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    middle_name: str | None = None
    contact: str | None = None
    is_active: bool | None = None


class UserRead(UserBase):
    model_config = ConfigDict(
        from_attributes=True,
        json_schema_extra={
            "example": {
                "email": "jane.doe@example.com",
                "username": "janedoe",
                "first_name": "Jane",
                "last_name": "Doe",
                "middle_name": "Marie",
                "contact": "+1234567890",
                "is_active": True,
                "user_id": "USER-123456",
                "created_at": "2026-06-21T12:00:00Z",
                "updated_at": "2026-06-21T12:30:00Z",
                "is_deleted": False,
                "deleted_at": None,
                "performed_by": "018f4a1a-7b3b-7d0e-913a-c5f1c5c1c5c2",
            }
        },
    )

    user_id: str
    created_at: datetime
    updated_at: datetime
    is_deleted: bool
    deleted_at: datetime | None = None
    performed_by: UUID | None = None


class UserDelete(UserBaseSchema):
    pass


class UserRestore(UserBaseSchema):
    pass


class UserListQueryParams(ListQueryParams):
    is_active: bool | None = None
    search: str | None = None
    sort_by: Literal["created_at", "user_id", "email", "username", "last_name"] = "created_at"
