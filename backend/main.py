from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

from core.config import settings
from core.handlers import register_exception_handlers
from core.logging import setup_logging
from core.middleware import RequestIdMiddleware
from routers.api import api_router

setup_logging(json_output=settings.LOG_JSON, debug=settings.DEBUG)

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.PROJECT_VERSION,
    description=(
        "PEII Backend API — structured logging, request tracing, "
        "audit logging, and core infrastructure."
    ),
    debug=settings.DEBUG,
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

app.add_middleware(RequestIdMiddleware)


@app.get("/", include_in_schema=False)
async def root_redirect() -> RedirectResponse:
    return RedirectResponse(url=f"{settings.API_V1_PREFIX}/docs")


register_exception_handlers(app)
app.include_router(api_router, prefix=settings.API_V1_PREFIX)
