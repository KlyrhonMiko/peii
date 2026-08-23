from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class LoginRequest(BaseModel):
    identifier: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=1, max_length=256)


class AuthSession(BaseModel):
    access_token: str
    refresh_token: str
    expires_in: int
    token_type: str


class CurrentUser(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: str
    email: str
    username: str
    first_name: str
    last_name: str
    permissions: list[str]
    roles: list[str]


class PasswordRecoveryRequest(BaseModel):
    email: str = Field(min_length=3, max_length=255)


class PasswordChangeRequest(BaseModel):
    password: str = Field(min_length=12, max_length=256)
