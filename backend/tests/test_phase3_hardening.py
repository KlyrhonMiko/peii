from urllib.parse import quote

import pytest
from pydantic import ValidationError
from starlette.middleware.cors import CORSMiddleware
from starlette.routing import Route

from core.config import Settings, convert_to_async_database_url, settings
from main import create_app


def _production_values() -> dict[str, object]:
    values = settings.model_dump()
    values.update(
        DEBUG=False,
        DB_MODE="supabase",
        DATABASE_TLS_MODE="require",
        RATE_LIMIT_ENABLED=True,
        RATE_LIMIT_INCLUDE_CLIENT_IP=True,
        RATE_LIMIT_KEY_HMAC_SECRET="r" * 32,
        WITHDRAWAL_CODE_HMAC_SECRET="w" * 32,
        GOOGLE_OAUTH_CLIENT_ID="production-google-client-id",
        SURVEY_RESPONDENT_HMAC_SECRET="s" * 32,
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


def test_database_tls_mode_requires_tls_for_supabase_in_production() -> None:
    values = _production_values()
    values["DATABASE_TLS_MODE"] = "disable"

    with pytest.raises(ValidationError, match="DATABASE_TLS_MODE"):
        Settings.model_validate(values)

    production_settings = Settings.model_validate(_production_values())
    assert production_settings.database_sync_tls_args == {"sslmode": "require"}
    assert production_settings.database_async_tls_args == {"ssl": "require"}


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
