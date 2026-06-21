from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    PROJECT_NAME: str
    PROJECT_VERSION: str
    API_V1_PREFIX: str
    DEBUG: bool
    SQL_ECHO: bool
    LOG_JSON: bool
    DB_MODE: Literal["local", "supabase"]
    LOCAL_DATABASE_URL: str
    SUPABASE_DATABASE_URL: str
    BACKEND_CORS_ORIGINS: list[str]

    model_config = SettingsConfigDict(
        env_file=str(ROOT_ENV_FILE),
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    @property
    def database_url(self) -> str:
        if self.DB_MODE == "supabase":
            return self.SUPABASE_DATABASE_URL
        return self.LOCAL_DATABASE_URL

    @property
    def async_database_url(self) -> str:
        url = self.database_url
        if url.startswith("postgresql+psycopg2://"):
            url = url.replace("postgresql+psycopg2://", "postgresql+asyncpg://")
            if "?" in url:
                url += "&prepared_statement_cache_size=0"
            else:
                url += "?prepared_statement_cache_size=0"
            return url
        if url.startswith("sqlite://"):
            return url.replace("sqlite://", "sqlite+aiosqlite://")
        return url

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]


settings = get_settings()
