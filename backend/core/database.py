from typing import Generator

from sqlmodel import Session, create_engine

from core.config import settings
from models import User  # noqa: F401


connect_args = {"check_same_thread": False} if settings.is_sqlite else {}

engine = create_engine(
    settings.database_url,
    echo=settings.SQL_ECHO,
    connect_args=connect_args,
)


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
