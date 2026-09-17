from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


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
    middle_name: str | None = None
    contact: str | None = None
    permissions: list[str]
    roles: list[str]


class CurrentUserUpdate(BaseModel):
    """Self-service profile fields that the authenticated user may update."""

    model_config = ConfigDict(extra="forbid")

    username: str | None = Field(default=None, min_length=1, max_length=100)
    first_name: str | None = Field(default=None, min_length=1, max_length=100)
    last_name: str | None = Field(default=None, min_length=1, max_length=100)
    middle_name: str | None = Field(default=None, min_length=1, max_length=100)
    contact: str | None = Field(default=None, min_length=1, max_length=50)

    @field_validator("username", "first_name", "last_name", mode="before")
    @classmethod
    def strip_required_text(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value

    @field_validator("middle_name", "contact", mode="before")
    @classmethod
    def strip_optional_text(cls, value: object) -> object:
        if not isinstance(value, str):
            return value
        stripped = value.strip()
        return stripped or None


class PasswordRecoveryRequest(BaseModel):
    email: str = Field(min_length=3, max_length=255)


class PasswordChangeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    password: str = Field(min_length=12, max_length=256)
    nonce: str = Field(min_length=1, max_length=512)


class PasswordResetRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    password: str = Field(min_length=12, max_length=256)
    grant: str = Field(min_length=1, max_length=4096)


class GoogleSurveyAttestationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    provider_token: str = Field(min_length=1, max_length=4096)


class GoogleSurveyAttestationAcknowledgement(BaseModel):
    attested: Literal[True]
