from datetime import datetime
from uuid import UUID

from sqlmodel import Field

from models.base_model import BaseModel


class User(BaseModel, table=True):
    __tablename__ = "users"

    user_id: str = Field(unique=True, index=True, max_length=20)
    auth_user_id: UUID | None = Field(default=None, unique=True, index=True)
    email: str = Field(index=True, unique=True, max_length=255)
    username: str = Field(index=True, unique=True, max_length=100)
    first_name: str = Field(max_length=100)
    last_name: str = Field(max_length=100)
    middle_name: str | None = Field(default=None, max_length=100)
    contact: str | None = Field(default=None, max_length=50)
    is_active: bool = Field(default=True)
    invited_at: datetime | None = Field(default=None)
    onboarding_completed_at: datetime | None = Field(default=None)
    last_login_at: datetime | None = Field(default=None)
