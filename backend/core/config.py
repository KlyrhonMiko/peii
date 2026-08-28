from functools import lru_cache
from pathlib import Path
from typing import Literal, Self
from urllib.parse import quote, urlsplit
from uuid import UUID

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import URL, make_url

ROOT_ENV_FILE = Path(__file__).resolve().parents[2] / ".env"
LIBPQ_SSL_QUERY_OPTIONS = frozenset(
    {
        "sslmode",
        "sslcert",
        "sslkey",
        "sslpassword",
        "sslrootcert",
        "sslcrl",
        "sslcrldir",
        "sslcompression",
        "sslsni",
        "ssl_min_protocol_version",
        "ssl_max_protocol_version",
        "sslnegotiation",
    }
)


def convert_to_async_database_url(database_url: str) -> str:
    """Convert a synchronous SQLAlchemy URL without leaking libpq options to asyncpg."""

    parsed_url = make_url(database_url)
    if parsed_url.drivername in {"postgresql", "postgresql+psycopg2"}:
        async_url: URL = parsed_url.set(drivername="postgresql+asyncpg")
        async_url = async_url.difference_update_query(LIBPQ_SSL_QUERY_OPTIONS)
        async_url = async_url.update_query_dict(
            {"prepared_statement_cache_size": "0"}
        )
        return _render_url_with_encoded_credentials(async_url)
    if parsed_url.drivername == "sqlite":
        return _render_url_with_encoded_credentials(
            parsed_url.set(drivername="sqlite+aiosqlite")
        )
    return database_url


def _render_url_with_encoded_credentials(database_url: URL) -> str:
    rendered_url = database_url.render_as_string(hide_password=False)
    if database_url.username is None:
        return rendered_url

    prefix, separator, authority_and_path = rendered_url.partition("://")
    user_info, at_sign, host_and_path = authority_and_path.partition("@")
    if not at_sign:
        return rendered_url

    encoded_user_info = quote(database_url.username, safe="")
    if database_url.password is not None:
        encoded_user_info += f":{quote(str(database_url.password), safe='')}"
    return f"{prefix}{separator}{encoded_user_info}@{host_and_path}"


def _validate_exact_https_origin(origin: str, setting_name: str) -> None:
    if not origin or origin != origin.strip() or "*" in origin:
        raise ValueError(f"{setting_name} must contain exact HTTPS origins")

    parsed_origin = urlsplit(origin)
    if (
        parsed_origin.scheme != "https"
        or not parsed_origin.netloc
        or parsed_origin.path
        or parsed_origin.query
        or parsed_origin.fragment
        or parsed_origin.username is not None
        or parsed_origin.password is not None
        or parsed_origin.hostname is None
        or "?" in origin
        or "#" in origin
    ):
        raise ValueError(f"{setting_name} must contain exact HTTPS origins")
    try:
        parsed_origin.port
    except ValueError as exc:
        raise ValueError(f"{setting_name} must contain exact HTTPS origins") from exc


class Settings(BaseSettings):
    PROJECT_NAME: str
    PROJECT_VERSION: str
    API_V1_PREFIX: str
    DEBUG: bool
    SQL_ECHO: bool
    LOG_JSON: bool
    DB_MODE: Literal["local", "supabase"]
    DATABASE_TLS_MODE: Literal["disable", "require"] = "disable"
    LOCAL_DATABASE_URL: str
    SUPABASE_DATABASE_URL: str
    BACKEND_CORS_ORIGINS: list[str]
    SUPABASE_URL: str
    SUPABASE_PUBLISHABLE_KEY: str
    SUPABASE_SECRET_KEY: str
    APP_ORIGIN: str
    INITIAL_ADMIN_EMAIL: str
    INITIAL_ADMIN_USERNAME: str
    INITIAL_ADMIN_FIRST_NAME: str
    INITIAL_ADMIN_LAST_NAME: str
    SYSTEM_ACTOR_ID: UUID

    # Traffic security is disabled by default for local installations that have not
    # provisioned Redis yet. Production deployments should set this to true and provide
    # RATE_LIMIT_KEY_HMAC_SECRET.
    REDIS_URL: str = "redis://redis:6379/0"
    UPSTASH_REDIS_REST_URL: str | None = None
    UPSTASH_REDIS_REST_TOKEN: str | None = None
    REDIS_MAX_CONNECTIONS: int = Field(default=32, ge=1, le=512)
    REDIS_CONNECT_TIMEOUT_SECONDS: float = Field(default=2.0, gt=0, le=30)
    REDIS_SOCKET_TIMEOUT_SECONDS: float = Field(default=2.0, gt=0, le=30)
    RATE_LIMIT_ENABLED: bool = False
    RATE_LIMIT_INCLUDE_CLIENT_IP: bool = False
    RATE_LIMIT_READ_FAILURE_POLICY: Literal["fail_closed", "fail_open"] = "fail_closed"
    RATE_LIMIT_KEY_HMAC_SECRET: str | None = None
    WITHDRAWAL_CODE_HMAC_SECRET: str | None = None
    CSV_EXPORT_ENABLED: bool = False
    PUBLIC_SURVEY_READ_LIMIT: int = Field(default=60, ge=1)
    PUBLIC_SURVEY_READ_WINDOW_SECONDS: int = Field(default=60, ge=1)
    PUBLIC_SURVEY_SUBMIT_LIMIT: int = Field(default=10, ge=1)
    PUBLIC_SURVEY_SUBMIT_WINDOW_SECONDS: int = Field(default=60, ge=1)
    PUBLIC_SURVEY_WITHDRAWAL_CLIENT_LIMIT: int = Field(default=10, ge=1)
    PUBLIC_SURVEY_WITHDRAWAL_CLIENT_WINDOW_SECONDS: int = Field(default=60, ge=1)
    PUBLIC_SURVEY_WITHDRAWAL_GLOBAL_LIMIT: int = Field(default=1000, ge=1)
    PUBLIC_SURVEY_WITHDRAWAL_GLOBAL_WINDOW_SECONDS: int = Field(default=60, ge=1)
    LOGIN_RATE_LIMIT: int = Field(default=10, ge=1)
    LOGIN_RATE_WINDOW_SECONDS: int = Field(default=60, ge=1)
    PASSWORD_RECOVERY_RATE_LIMIT: int = Field(default=5, ge=1)
    PASSWORD_RECOVERY_RATE_WINDOW_SECONDS: int = Field(default=900, ge=1)
    MAX_REQUEST_BODY_BYTES: int = Field(default=65_536, ge=1)
    TRUSTED_PROXY_HEADER: str = "X-Forwarded-For"
    TRUSTED_PROXY_CIDRS: list[str] = Field(default_factory=list)
    TRUSTED_PROXY_MAX_HOPS: int = Field(default=20, ge=1, le=100)
    TRUSTED_PROXY_MAX_HEADER_BYTES: int = Field(default=2048, ge=64, le=16384)
    SURVEY_DISTRIBUTION_DEFAULT_EXPIRY_DAYS: int = Field(default=30, ge=1)
    SURVEY_DISTRIBUTION_MAX_EXPIRY_DAYS: int = Field(default=30, ge=1)
    PUBLIC_SURVEY_CONSENT_VERSION: str = "2026-08-25"
    PUBLIC_SURVEY_PRIVACY_NOTICE: str = "See the PEII privacy notice before responding."
    PUBLIC_SURVEY_PURPOSE: str = "Program evaluation and research."
    PUBLIC_SURVEY_RETENTION: str = "Responses are retained according to the approved policy."
    PUBLIC_SURVEY_CONTACT: str = "privacy@example.gov.ph"

    model_config = SettingsConfigDict(
        env_file=str(ROOT_ENV_FILE),
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    @model_validator(mode="after")
    def validate_traffic_security(self) -> Self:
        if bool(self.UPSTASH_REDIS_REST_URL) != bool(self.UPSTASH_REDIS_REST_TOKEN):
            raise ValueError(
                "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be configured together"
            )
        if self.RATE_LIMIT_ENABLED and not self.RATE_LIMIT_KEY_HMAC_SECRET:
            raise ValueError(
                "RATE_LIMIT_KEY_HMAC_SECRET is required when RATE_LIMIT_ENABLED is true"
            )
        if (
            self.RATE_LIMIT_ENABLED
            and self.RATE_LIMIT_KEY_HMAC_SECRET is not None
            and len(self.RATE_LIMIT_KEY_HMAC_SECRET.encode("utf-8")) < 32
        ):
            raise ValueError(
                "RATE_LIMIT_KEY_HMAC_SECRET must be at least 32 bytes when rate limiting is enabled"
            )
        if not self.DEBUG and not self.RATE_LIMIT_ENABLED:
            raise ValueError("RATE_LIMIT_ENABLED must be true when DEBUG is false")
        if self.RATE_LIMIT_ENABLED and not self.DEBUG and not self.RATE_LIMIT_INCLUDE_CLIENT_IP:
            raise ValueError(
                "RATE_LIMIT_INCLUDE_CLIENT_IP must be true when rate limiting is enabled "
                "outside debug mode"
            )
        if not self.DEBUG and not self.WITHDRAWAL_CODE_HMAC_SECRET:
            raise ValueError(
                "WITHDRAWAL_CODE_HMAC_SECRET is required when DEBUG is false"
            )
        if (
            self.WITHDRAWAL_CODE_HMAC_SECRET is not None
            and len(self.WITHDRAWAL_CODE_HMAC_SECRET.encode("utf-8")) < 32
        ):
            raise ValueError("WITHDRAWAL_CODE_HMAC_SECRET must be at least 32 bytes")
        return self

    @model_validator(mode="after")
    def validate_production_origins_and_database_tls(self) -> Self:
        if not self.DEBUG:
            if self.DB_MODE == "supabase" and self.DATABASE_TLS_MODE != "require":
                raise ValueError(
                    "DATABASE_TLS_MODE must be require when DB_MODE is supabase outside debug mode"
                )

            for origin in self.BACKEND_CORS_ORIGINS:
                _validate_exact_https_origin(origin, "BACKEND_CORS_ORIGINS")
            _validate_exact_https_origin(self.APP_ORIGIN, "APP_ORIGIN")
            if self.APP_ORIGIN not in self.BACKEND_CORS_ORIGINS:
                raise ValueError("APP_ORIGIN must be included in BACKEND_CORS_ORIGINS")
        return self

    @property
    def trusted_proxy_cidrs(self) -> list[str]:
        return self.TRUSTED_PROXY_CIDRS

    @property
    def database_url(self) -> str:
        if self.DB_MODE == "supabase":
            return self.SUPABASE_DATABASE_URL
        return self.LOCAL_DATABASE_URL

    @property
    def async_database_url(self) -> str:
        return convert_to_async_database_url(self.database_url)

    @property
    def database_sync_tls_args(self) -> dict[str, str]:
        if self.DATABASE_TLS_MODE == "require" and self.database_url.startswith("postgresql"):
            return {"sslmode": "require"}
        return {}

    @property
    def database_async_tls_args(self) -> dict[str, str]:
        if self.DATABASE_TLS_MODE == "require" and self.database_url.startswith("postgresql"):
            return {"ssl": "require"}
        return {}

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]


settings = get_settings()
