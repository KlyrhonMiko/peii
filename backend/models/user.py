from sqlmodel import Field

from models.base_model import BaseModel


class User(BaseModel, table=True):
    __tablename__ = "users"

    email: str = Field(index=True, unique=True, max_length=255)
    username: str = Field(index=True, unique=True, max_length=100)
    password: str = Field(max_length=255)
    role: str = Field(max_length=100, index=True)
    first_name: str = Field(max_length=100)
    last_name: str = Field(max_length=100)
    middle_name: str | None = Field(default=None, max_length=100)
    contact: str | None = Field(default=None, max_length=50)
    is_active: bool = Field(default=True)
