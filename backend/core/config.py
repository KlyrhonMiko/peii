from functools import lru_cache
from pathlib import Path
from typing import Literal
from typing import List

from pydantic import computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    PROJECT_NAME: str
    PROJECT_VERSION: str
    API_V1_PREFIX: str
    DEBUG: bool
    SQL_ECHO: bool
    DB_MODE: Literal["local", "supabase"]
    LOCAL_DATABASE_URL: str
    SUPABASE_DATABASE_URL: str
    BACKEND_CORS_ORIGINS: List[str]

    model_config = SettingsConfigDict(
        env_file=str(ROOT_ENV_FILE),
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    @computed_field
    @property
    def database_url(self) -> str:
        if self.DB_MODE == "supabase":
            return self.SUPABASE_DATABASE_URL
        return self.LOCAL_DATABASE_URL

    @computed_field
    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
