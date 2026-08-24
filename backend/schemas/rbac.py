from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class PermissionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    code: str
    description: str


class RoleCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100, pattern=r"^[a-z][a-z0-9_-]*$")
    description: str | None = Field(default=None, max_length=255)
    permission_ids: list[UUID] = Field(default_factory=list, max_length=100)


class RoleUpdate(BaseModel):
    description: str | None = Field(default=None, max_length=255)
    is_active: bool | None = None
    permission_ids: list[UUID] | None = Field(default=None, max_length=100)


class RoleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    description: str | None
    is_system: bool
    is_active: bool
    permissions: list[PermissionRead]


class UserRoleUpdate(BaseModel):
    role_ids: list[UUID] = Field(min_length=1, max_length=20)
