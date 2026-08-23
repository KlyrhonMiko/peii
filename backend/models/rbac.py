from uuid import UUID

from sqlalchemy import UniqueConstraint
from sqlmodel import Field

from models.base_model import TimestampedUUIDModel


class Permission(TimestampedUUIDModel, table=True):
    __tablename__ = "permissions"

    code: str = Field(unique=True, index=True, max_length=100)
    description: str = Field(max_length=255)


class Role(TimestampedUUIDModel, table=True):
    __tablename__ = "roles"

    name: str = Field(unique=True, index=True, max_length=100)
    description: str | None = Field(default=None, max_length=255)
    is_system: bool = Field(default=False, nullable=False)
    is_active: bool = Field(default=True, nullable=False)


class RolePermission(TimestampedUUIDModel, table=True):
    __tablename__ = "role_permissions"
    __table_args__ = (UniqueConstraint("role_id", "permission_id"),)

    role_id: UUID = Field(foreign_key="roles.id", index=True)
    permission_id: UUID = Field(foreign_key="permissions.id", index=True)


class UserRole(TimestampedUUIDModel, table=True):
    __tablename__ = "user_roles"
    __table_args__ = (UniqueConstraint("user_id", "role_id"),)

    user_id: UUID = Field(foreign_key="users.id", index=True)
    role_id: UUID = Field(foreign_key="roles.id", index=True)
