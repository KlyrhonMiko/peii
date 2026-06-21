import uuid
from collections.abc import AsyncGenerator, Generator
from typing import Any

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlmodel import Session, create_engine
from sqlmodel.ext.asyncio.session import AsyncSession

from core.config import settings
from models import AuditLog, User  # noqa: F401

sync_connect_args = {"check_same_thread": False} if settings.is_sqlite else {}
async_connect_args: dict[str, Any] = (
    {"check_same_thread": False}
    if settings.is_sqlite
    else {
        "statement_cache_size": 0,
        "prepared_statement_cache_size": 0,
        "prepared_statement_name_func": lambda: f"__asyncpg_{uuid.uuid4()}__",
    }
)

engine = create_engine(
    settings.database_url,
    echo=settings.SQL_ECHO,
    connect_args=sync_connect_args,
)

async_engine = create_async_engine(
    settings.async_database_url,
    echo=settings.SQL_ECHO,
    connect_args=async_connect_args,
)

async_session_factory = async_sessionmaker(
    async_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


def get_session() -> Generator[Session]:
    with Session(engine) as session:
        yield session


async def get_async_session() -> AsyncGenerator[AsyncSession]:
    async with async_session_factory() as session:
        yield session

