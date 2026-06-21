from fastapi import APIRouter

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
