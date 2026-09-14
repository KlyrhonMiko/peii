from pathlib import Path
from urllib.parse import quote

import pytest
from fastapi import FastAPI
from pydantic import ValidationError
from starlette.middleware.cors import CORSMiddleware
from starlette.routing import Route

import main as main_module
from core.config import Settings, convert_to_async_database_url, settings
from main import create_app


def _production_values() -> dict[str, object]:
    values = settings.model_dump()
    values.update(
        DEBUG=False,
        DB_MODE="supabase",
        SUPABASE_DATABASE_URL="postgresql://peii:secret@db.example.com/peii",
        DATABASE_TLS_MODE="verify-full",
        RATE_LIMIT_ENABLED=True,
        RATE_LIMIT_INCLUDE_CLIENT_IP=True,
        RATE_LIMIT_KEY_HMAC_SECRET="r" * 32,
        WITHDRAWAL_CODE_HMAC_SECRET="w" * 32,
        GOOGLE_OAUTH_CLIENT_ID="production-google-client-id",
        SURVEY_RESPONDENT_HMAC_SECRET="s" * 32,
        PASSWORD_RESET_GRANT_SECRET="p" * 32,
        REDIS_URL="rediss://redis.example.com:6379/0",
        TRUSTED_PROXY_CIDRS=["198.51.100.0/24"],
        APP_ORIGIN="https://app.example.com",
        BACKEND_CORS_ORIGINS=["https://app.example.com", "https://api.example.com:8443"],
    )
    return values


def test_async_database_url_preserves_encoded_credentials_and_unrelated_query_args() -> None:
    password = "p@ss word"
    database_url = (
        "postgresql+psycopg2://user%40name:"
        f"{quote(password, safe='')}@db.example.test/peii?"
        "sslmode=require&sslrootcert=%2Ftmp%2Froot.pem&application_name=peii&"
        "connect_timeout=5"
    )

    converted = convert_to_async_database_url(database_url)

    assert converted.startswith("postgresql+asyncpg://user%40name:p%40ss%20word@")
    assert "sslmode" not in converted
    assert "sslrootcert" not in converted
    assert "application_name=peii" in converted
    assert "connect_timeout=5" in converted
    assert "prepared_statement_cache_size=0" in converted


def test_database_tls_mode_requires_hostname_verified_tls_for_production() -> None:
    values = _production_values()
    values["DATABASE_TLS_MODE"] = "disable"

    with pytest.raises(ValidationError, match="DATABASE_TLS_MODE"):
        Settings.model_validate(values)

    production_settings = Settings.model_validate(_production_values())
    assert production_settings.database_sync_tls_args == {"sslmode": "verify-full"}
    async_ssl_context = production_settings.database_async_tls_args["ssl"]
    assert not isinstance(async_ssl_context, str)
    assert async_ssl_context.check_hostname is True
    assert async_ssl_context.verify_mode.name == "CERT_REQUIRED"


def test_supabase_and_replica_database_urls_require_postgresql() -> None:
    values = _production_values()
    values["SUPABASE_DATABASE_URL"] = "sqlite:///peii.db"
    with pytest.raises(ValidationError, match="SUPABASE_DATABASE_URL must use PostgreSQL"):
        Settings.model_validate(values)

    values = _production_values()
    values["READ_REPLICA_DATABASE_URL"] = "https://db.example.com/peii"
    with pytest.raises(ValidationError, match="READ_REPLICA_DATABASE_URL must use PostgreSQL"):
        Settings.model_validate(values)


def test_database_tls_ca_bundle_is_used_by_both_database_drivers(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    values = _production_values()
    values["DATABASE_TLS_CA_BUNDLE_PATH"] = "/tmp/ca-bundle.pem"

    production_settings = Settings.model_validate(values)

    class SSLContext:
        check_hostname = False
        verify_mode = None

    captured: dict[str, object] = {}

    def create_default_context(*, purpose, cafile):
        captured["purpose"] = purpose
        captured["cafile"] = cafile
        return SSLContext()

    monkeypatch.setattr("core.config.ssl.create_default_context", create_default_context)

    assert production_settings.database_sync_tls_args == {
        "sslmode": "verify-full",
        "sslrootcert": "/tmp/ca-bundle.pem",
    }
    async_ssl_context = production_settings.database_async_tls_args["ssl"]
    assert not isinstance(async_ssl_context, str)
    assert async_ssl_context.check_hostname is True
    assert captured["cafile"] == "/tmp/ca-bundle.pem"


def test_production_cors_origins_are_exact_https_origins_and_include_app_origin() -> None:
    values = _production_values()
    values["BACKEND_CORS_ORIGINS"] = ["https://app.example.com/path"]

    with pytest.raises(ValidationError, match="exact HTTPS origins"):
        Settings.model_validate(values)

    values = _production_values()
    values["APP_ORIGIN"] = "https://other.example.com"
    with pytest.raises(ValidationError, match="APP_ORIGIN"):
        Settings.model_validate(values)


def test_production_rejects_local_google_identity_placeholders() -> None:
    values = _production_values()
    values["GOOGLE_OAUTH_CLIENT_ID"] = "local-google-client-id"
    with pytest.raises(ValidationError, match="GOOGLE_OAUTH_CLIENT_ID"):
        Settings.model_validate(values)

    values = _production_values()
    values["SURVEY_RESPONDENT_HMAC_SECRET"] = (
        "local-only-survey-respondent-hmac-secret"
    )
    with pytest.raises(ValidationError, match="SURVEY_RESPONDENT_HMAC_SECRET"):
        Settings.model_validate(values)

    values = _production_values()
    values["PASSWORD_RESET_GRANT_SECRET"] = "short"
    with pytest.raises(ValidationError, match="PASSWORD_RESET_GRANT_SECRET"):
        Settings.model_validate(values)

    values = _production_values()
    values["PASSWORD_RESET_GRANT_SECRET"] = (
        "replace_with_a_dedicated_random_32_byte_value"
    )
    with pytest.raises(ValidationError, match="PASSWORD_RESET_GRANT_SECRET"):
        Settings.model_validate(values)

    values = _production_values()
    values["PASSWORD_RESET_GRANT_SECRET"] = "local-only-password-reset-grant-secret"
    with pytest.raises(ValidationError, match="PASSWORD_RESET_GRANT_SECRET"):
        Settings.model_validate(values)


def test_create_app_keeps_public_cors_headers_without_authorization() -> None:
    cors_middleware = next(
        middleware
        for middleware in create_app(settings).user_middleware
        if middleware.cls is CORSMiddleware
    )

    assert cors_middleware.kwargs["allow_headers"] == [
        "Content-Type",
        "Idempotency-Key",
        "X-Request-ID",
    ]


def test_debug_settings_retain_local_http_cors_origins() -> None:
    values = _production_values()
    values.update(
        DEBUG=True,
        DATABASE_TLS_MODE="disable",
        APP_ORIGIN="http://localhost:3000",
        BACKEND_CORS_ORIGINS=["http://localhost:3000"],
        GOOGLE_OAUTH_CLIENT_ID="local-google-client-id",
        SURVEY_RESPONDENT_HMAC_SECRET="local-only-survey-respondent-hmac-secret",
    )

    debug_settings = Settings.model_validate(values)
    assert debug_settings.APP_ORIGIN == "http://localhost:3000"
    assert debug_settings.GOOGLE_OAUTH_CLIENT_ID == "local-google-client-id"


def test_compose_example_uses_debug_mode_with_local_http_database_and_tls() -> None:
    example = (Path(__file__).resolve().parents[2] / ".env.example").read_text(
        encoding="utf-8"
    )

    assert "DEBUG=true" in example


def test_create_app_disables_production_documentation_and_root_redirect() -> None:
    production_app = create_app(Settings.model_validate(_production_values()))

    assert production_app.docs_url is None
    assert production_app.redoc_url is None
    assert production_app.openapi_url is None
    assert not any(
        isinstance(route, Route) and route.path == "/" for route in production_app.routes
    )


def test_create_app_preserves_debug_documentation_and_root_redirect() -> None:
    debug_app = create_app(settings)

    assert debug_app.docs_url == "/api/v1/docs"
    assert debug_app.redoc_url == "/api/v1/redoc"
    assert debug_app.openapi_url == "/api/v1/openapi.json"
    assert any(isinstance(route, Route) and route.path == "/" for route in debug_app.routes)


@pytest.mark.anyio
async def test_lifespan_disposes_all_engines_when_another_cleanup_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cleaned: list[str] = []

    class AsyncEngine:
        def __init__(self, name: str) -> None:
            self.name = name

        async def dispose(self) -> None:
            cleaned.append(self.name)

    class SyncEngine:
        def dispose(self) -> None:
            cleaned.append("sync")

    async def start() -> None:
        return None

    async def stop() -> None:
        cleaned.append("redis")

    async def close_http_client() -> None:
        cleaned.append("http")
        raise RuntimeError("close failure")

    monkeypatch.setattr(main_module.redis_lifecycle, "start", start)
    monkeypatch.setattr(main_module.redis_lifecycle, "stop", stop)
    monkeypatch.setattr(main_module, "close_http_client", close_http_client)
    monkeypatch.setattr(main_module, "get_http_client", lambda: None)
    monkeypatch.setattr(main_module, "async_engine", AsyncEngine("primary"))
    monkeypatch.setattr(main_module, "analytics_async_engine", AsyncEngine("analytics"))
    monkeypatch.setattr(main_module, "engine", SyncEngine())

    async with main_module.lifespan(FastAPI()):
        pass

    assert set(cleaned) == {"http", "redis", "primary", "analytics", "sync"}
