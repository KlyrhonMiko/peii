from fastapi import APIRouter, Depends, Request

from core.client_ip import resolve_client_ip
from core.deps import AsyncDBSession, CurrentPrincipal, require_permissions
from core.responses import success_response
from schemas.alumni_count import AlumniCountRead, AlumniCountReplace, AlumniTotalRead
from schemas.common import APIResponse
from services import alumni_count_service

router = APIRouter()


@router.get(
    "/",
    response_model=APIResponse[list[AlumniCountRead]],
    dependencies=[Depends(require_permissions("alumni_counts.manage"))],
    summary="List Alumni Counts",
    description="List registrar graduate totals by batch year and degree program.",
)
async def list_alumni_counts(session: AsyncDBSession) -> APIResponse[list[AlumniCountRead]]:
    rows = await alumni_count_service.list_alumni_counts(session)
    return success_response([AlumniCountRead.model_validate(row) for row in rows])


@router.put(
    "/",
    response_model=APIResponse[list[AlumniCountRead]],
    dependencies=[Depends(require_permissions("alumni_counts.manage"))],
    summary="Replace Alumni Counts",
    description="Replace the full set of graduate totals. Omitted rows are removed.",
)
async def replace_alumni_counts(
    payload: AlumniCountReplace,
    session: AsyncDBSession,
    principal: CurrentPrincipal,
    request: Request,
) -> APIResponse[list[AlumniCountRead]]:
    rows = await alumni_count_service.replace_alumni_counts(
        session, payload, principal.user.id, resolve_client_ip(request)
    )
    return success_response(
        [AlumniCountRead.model_validate(row) for row in rows],
        message="Alumni counts saved.",
    )


@router.get(
    "/total",
    response_model=APIResponse[AlumniTotalRead],
    dependencies=[Depends(require_permissions("survey_responses.read_aggregates"))],
    summary="Alumni Total For Filters",
    description="Sum graduate totals for the dashboard batch, department, and degree filters.",
)
async def get_alumni_total(
    session: AsyncDBSession,
    batch: str | None = None,
    department: str | None = None,
    degree: str | None = None,
) -> APIResponse[AlumniTotalRead]:
    result = await alumni_count_service.alumni_total(
        session, batch=batch, department=department, degree=degree
    )
    return success_response(result)
