import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

from core.config import Settings, settings
from core.database import analytics_async_engine, async_engine, engine
from core.handlers import register_exception_handlers
from core.http_client import close_http_client, get_http_client
from core.logging import get_logger, setup_logging
from core.middleware import (
    IMPORT_REQUEST_BODY_BYTES,
    PublicSurveySecurityHeadersMiddleware,
    RequestIdMiddleware,
    RequestSizeLimitMiddleware,
    SecurityHeadersMiddleware,
)
from core.rate_limit import redis_lifecycle
from routers.api import api_router

setup_logging(json_output=settings.LOG_JSON, debug=settings.DEBUG)
logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    try:
        await redis_lifecycle.start()
        get_http_client()
        yield
    finally:
        cleanup_names = ("http_client", "redis", "primary_database", "analytics_database")
        cleanup_results = await asyncio.gather(
            close_http_client(),
            redis_lifecycle.stop(),
            async_engine.dispose(),
            analytics_async_engine.dispose(),
            return_exceptions=True,
        )
        for name, result in zip(cleanup_names, cleanup_results, strict=True):
            if isinstance(result, Exception):
                logger.error(
                    "Lifespan resource cleanup failed",
                    resource=name,
                    error_type=type(result).__name__,
                )
        try:
            engine.dispose()
        except Exception as exc:
            logger.error(
                "Lifespan resource cleanup failed",
                resource="sync_database",
                error_type=type(exc).__name__,
            )


def create_app(app_settings: Settings = settings) -> FastAPI:
    application = FastAPI(
        title=app_settings.PROJECT_NAME,
        version=app_settings.PROJECT_VERSION,
        description=(
            "PEII Backend API — structured logging, request tracing, "
            "audit logging, and core infrastructure."
        ),
        debug=app_settings.DEBUG,
        lifespan=lifespan,
        openapi_tags=[
            {
                "name": "health",
                "description": "Liveness and readiness probes.",
            },
            {
                "name": "users",
                "description": (
                    "User account management: CRUD, batch creation, "
                    "soft delete, and restore."
                ),
            },
            {
                "name": "audit-logs",
                "description": "Read-only audit trail of all resource mutations.",
            },
        ],
        license_info={"name": "Private"},
        docs_url=(f"{app_settings.API_V1_PREFIX}/docs" if app_settings.DEBUG else None),
        redoc_url=(f"{app_settings.API_V1_PREFIX}/redoc" if app_settings.DEBUG else None),
        openapi_url=(
            f"{app_settings.API_V1_PREFIX}/openapi.json" if app_settings.DEBUG else None
        ),
    )

    # Starlette applies middleware in reverse registration order. Register the
    # route-facing wrappers first so SecurityHeadersMiddleware is outermost;
    # its setdefault calls then cannot weaken stricter headers set downstream.
    application.add_middleware(
        CORSMiddleware,
        allow_origins=app_settings.BACKEND_CORS_ORIGINS,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PATCH"],
        allow_headers=["Content-Type", "Idempotency-Key", "X-Request-ID"],
        expose_headers=["Retry-After", "X-Request-ID"],
    )

    application.add_middleware(
        RequestSizeLimitMiddleware,
        max_body_bytes=app_settings.MAX_REQUEST_BODY_BYTES,
        api_prefix=app_settings.API_V1_PREFIX,
        import_body_bytes=IMPORT_REQUEST_BODY_BYTES,
    )
    application.add_middleware(
        PublicSurveySecurityHeadersMiddleware,
        path_prefix=f"{app_settings.API_V1_PREFIX}/survey",
    )
    # Request IDs must wrap size-limit handling so rejected requests receive the same
    # request-id header and response metadata as normal requests.
    application.add_middleware(
        RequestIdMiddleware,
        path_prefix=f"{app_settings.API_V1_PREFIX}/survey",
    )
    application.add_middleware(SecurityHeadersMiddleware)

    if app_settings.DEBUG:

        async def root_redirect() -> RedirectResponse:
            return RedirectResponse(url=f"{app_settings.API_V1_PREFIX}/docs")

        application.add_api_route("/", root_redirect, include_in_schema=False)

    register_exception_handlers(application)
    application.include_router(api_router, prefix=app_settings.API_V1_PREFIX)
    return application


app = create_app()
