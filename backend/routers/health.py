import asyncio

from fastapi import APIRouter
from sqlalchemy import text

from core.cache import is_shared_redis_cache_active
from core.config import settings
from core.database import async_engine
from core.exceptions import AppError
from core.rate_limit import get_redis_client
from core.responses import success_response
from schemas.common import APIResponse

router = APIRouter()


@router.get(
    "/health",
    response_model=APIResponse[dict[str, str]],
    summary="Health Check Probe",
    description="Verifies backend liveness and availability.",
)
async def health_check() -> APIResponse[dict[str, str]]:
    return success_response({"status": "ok"})


async def _check_primary_database() -> None:
    async with async_engine.connect() as connection:
        await connection.execute(text("SELECT 1"))


async def _check_redis() -> str:
    if not (settings.RATE_LIMIT_ENABLED or is_shared_redis_cache_active()):
        return "skipped"

    redis_client = get_redis_client()
    if redis_client is None or not await redis_client.ping():
        raise RuntimeError("Redis is unavailable")
    return "ok"


@router.get(
    "/ready",
    response_model=APIResponse[dict[str, str]],
    summary="Readiness Check Probe",
    description="Verifies primary database and configured Redis readiness.",
)
async def readiness_check() -> APIResponse[dict[str, str]]:
    try:
        async with asyncio.timeout(settings.READINESS_TIMEOUT_SECONDS):
            database_result, redis_result = await asyncio.gather(
                _check_primary_database(), _check_redis(), return_exceptions=True
            )
    except TimeoutError as exc:
        raise AppError("Service is not ready.", status_code=503) from exc

    if isinstance(database_result, BaseException) or isinstance(redis_result, BaseException):
        raise AppError("Service is not ready.", status_code=503)

    return success_response(
        {"status": "ready", "database": "ok", "redis": redis_result}
    )
