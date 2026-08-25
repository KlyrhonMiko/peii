from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

from core.config import settings
from core.handlers import register_exception_handlers
from core.logging import setup_logging
from core.middleware import (
    PublicSurveySecurityHeadersMiddleware,
    RequestIdMiddleware,
    RequestSizeLimitMiddleware,
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


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.PROJECT_VERSION,
    description=(
        "PEII Backend API — structured logging, request tracing, "
        "audit logging, and core infrastructure."
    ),
    debug=settings.DEBUG,
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
    docs_url=f"{settings.API_V1_PREFIX}/docs",
    redoc_url=f"{settings.API_V1_PREFIX}/redoc",
    openapi_url=f"{settings.API_V1_PREFIX}/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(RequestSizeLimitMiddleware, max_body_bytes=settings.MAX_REQUEST_BODY_BYTES)
app.add_middleware(
    PublicSurveySecurityHeadersMiddleware,
    path_prefix=f"{settings.API_V1_PREFIX}/survey",
)
# Request IDs must wrap size-limit handling so rejected requests receive the same
# request-id header and response metadata as normal requests.
app.add_middleware(
    RequestIdMiddleware,
    path_prefix=f"{settings.API_V1_PREFIX}/survey",
)


@app.get("/", include_in_schema=False)
async def root_redirect() -> RedirectResponse:
    return RedirectResponse(url=f"{settings.API_V1_PREFIX}/docs")


register_exception_handlers(app)
app.include_router(api_router, prefix=settings.API_V1_PREFIX)
