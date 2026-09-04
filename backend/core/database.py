import uuid
from collections.abc import AsyncGenerator, Generator
from typing import Any

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlmodel import Session, create_engine
from sqlmodel.ext.asyncio.session import AsyncSession

from core.config import convert_to_async_database_url, settings
from models import (  # noqa: F401
    AuditLog,
    GoogleSurveyAuthProof,
    Permission,
    ResponseErasureReceipt,
    Role,
    RolePermission,
    Survey,
    SurveyQuestion,
    SurveyResponse,
    SurveySection,
    User,
    UserRole,
)

sync_connect_args = (
    {"check_same_thread": False}
    if settings.is_sqlite
    else settings.database_sync_tls_args
)
async_connect_args: dict[str, Any] = (
    {"check_same_thread": False}
    if settings.is_sqlite
    else {
        "statement_cache_size": 0,
        "prepared_statement_cache_size": 0,
        "prepared_statement_name_func": lambda: f"__asyncpg_{uuid.uuid4()}__",
    }
)
if not settings.is_sqlite:
    async_connect_args.update(settings.database_async_tls_args)

engine = create_engine(
    settings.database_url,
    echo=settings.SQL_ECHO,
    connect_args=sync_connect_args,
)

async_engine = create_async_engine(
    settings.async_database_url,
    echo=settings.SQL_ECHO,
    connect_args=async_connect_args,
    **(
        {}
        if settings.is_sqlite
        else {
            "pool_size": settings.DB_POOL_SIZE,
            "max_overflow": settings.DB_MAX_OVERFLOW,
            "pool_timeout": settings.DB_POOL_TIMEOUT_SECONDS,
            "pool_recycle": settings.DB_POOL_RECYCLE_SECONDS,
            "pool_pre_ping": settings.DB_POOL_PRE_PING,
        }
    ),
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


analytics_engine_url = (
    convert_to_async_database_url(settings.READ_REPLICA_DATABASE_URL)
    if settings.READ_REPLICA_DATABASE_URL
    else settings.async_database_url
)
analytics_async_engine = create_async_engine(
    analytics_engine_url,
    echo=settings.SQL_ECHO,
    connect_args=async_connect_args,
    **(
        {}
        if settings.is_sqlite
        else {
            "pool_size": settings.DB_ANALYTICS_POOL_SIZE,
            "max_overflow": settings.DB_ANALYTICS_MAX_OVERFLOW,
            "pool_timeout": settings.DB_ANALYTICS_POOL_TIMEOUT_SECONDS,
            "pool_recycle": settings.DB_ANALYTICS_POOL_RECYCLE_SECONDS,
            "pool_pre_ping": settings.DB_ANALYTICS_POOL_PRE_PING,
        }
    ),
)

analytics_async_session_factory = async_sessionmaker(
    analytics_async_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_analytics_async_session() -> AsyncGenerator[AsyncSession]:
    async with analytics_async_session_factory() as session:
        yield session
