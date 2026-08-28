from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

from core.config import Settings, settings
from core.handlers import register_exception_handlers
from core.logging import setup_logging
from core.middleware import (
    PublicSurveySecurityHeadersMiddleware,
    RequestIdMiddleware,
    RequestSizeLimitMiddleware,
    SecurityHeadersMiddleware,
)
from core.rate_limit import redis_lifecycle
from routers.api import api_router

setup_logging(json_output=settings.LOG_JSON, debug=settings.DEBUG)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    await redis_lifecycle.start()
    try:
        yield
    finally:
        await redis_lifecycle.stop()


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
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type", "Idempotency-Key", "X-Request-ID"],
        expose_headers=["Retry-After", "X-Request-ID"],
    )

    application.add_middleware(
        RequestSizeLimitMiddleware, max_body_bytes=app_settings.MAX_REQUEST_BODY_BYTES
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
