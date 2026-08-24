from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Request, Response, status

from core.deps import AsyncDBSession, CurrentPrincipal, require_permissions
from core.exceptions import AppError
from core.responses import APIResponse, list_meta_response, success_response
from schemas.survey_response import (
    EraseResponsesRequest,
    ResponseErasureResult,
    SurveyResponseAggregate,
    SurveyResponseListQueryParams,
    SurveyResponseRead,
)
from services import response_service, survey_service

router = APIRouter()


def get_survey_response_list_query_params(
    limit: int = 50,
    offset: int = 0,
    sort_by: str = "created_at",
    sort_order: Literal["asc", "desc"] = "desc",
) -> SurveyResponseListQueryParams:
    return SurveyResponseListQueryParams(
        limit=limit,
        offset=offset,
        sort_by=sort_by,
        sort_order=sort_order,
    )


ResponseListParams = Annotated[
    SurveyResponseListQueryParams, Depends(get_survey_response_list_query_params)
]


@router.get(
    "/",
    dependencies=[Depends(require_permissions("survey_responses.read_raw"))],
    response_model=APIResponse[list[SurveyResponseRead]],
    summary="List Survey Responses",
    description="Retrieve paginated responses for a specific survey.",
)
async def list_survey_responses(
    survey_id: UUID,
    session: AsyncDBSession,
    params: ResponseListParams,
    http_response: Response,
    principal: CurrentPrincipal,
) -> APIResponse[list[SurveyResponseRead]]:
    http_response.headers["Cache-Control"] = "private, no-store, max-age=0"
    http_response.headers["Pragma"] = "no-cache"
    await survey_service.resolve_survey(session, survey_id)
    responses, total = await response_service.list_responses(session, survey_id, params)
    response_data = [SurveyResponseRead.model_validate(r) for r in responses]
    return success_response(
        response_data,
        meta=list_meta_response(
            filters=params,
            total=total,
            count=len(response_data),
            limit=params.limit,
            offset=params.offset,
        ),
    )


@router.get(
    "/aggregates",
    response_model=APIResponse[list[SurveyResponseAggregate]],
    dependencies=[Depends(require_permissions("survey_responses.read_aggregates"))],
    summary="Aggregate Survey Responses",
    description="Return conservatively suppressed aggregates for supported question types.",
)
async def aggregate_survey_responses(
    survey_id: UUID,
    session: AsyncDBSession,
    http_response: Response,
    principal: CurrentPrincipal,
) -> APIResponse[list[SurveyResponseAggregate]]:
    http_response.headers["Cache-Control"] = "private, no-store, max-age=0"
    http_response.headers["Pragma"] = "no-cache"
    return success_response(await response_service.aggregate_responses(session, survey_id))


@router.get(
    "/export",
    response_class=Response,
    dependencies=[Depends(require_permissions("survey_responses.export"))],
    summary="Export Survey Responses",
    description="Download a safe, long-format CSV response export.",
)
async def export_survey_responses(
    survey_id: UUID,
    session: AsyncDBSession,
    request: Request,
    principal: CurrentPrincipal,
) -> Response:
    ip_address = request.client.host if request.client else None
    csv_content = await response_service.export_responses(
        session,
        survey_id,
        actor_id=principal.user.id,
        ip_address=ip_address,
    )
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={
            "Cache-Control": "private, no-store, max-age=0",
            "Pragma": "no-cache",
            "X-Content-Type-Options": "nosniff",
            "Referrer-Policy": "no-referrer",
            "Content-Disposition": f'attachment; filename="survey-{survey_id}.csv"',
        },
    )


@router.post(
    "/erase",
    response_model=APIResponse[ResponseErasureResult],
    dependencies=[Depends(require_permissions("survey_responses.erase"))],
    status_code=status.HTTP_200_OK,
    summary="Erase Survey Responses",
    description="Atomically tombstone selected responses or every response in an archived survey.",
)
async def erase_survey_responses(
    survey_id: UUID,
    payload: EraseResponsesRequest,
    session: AsyncDBSession,
    request: Request,
    principal: CurrentPrincipal,
    idempotency_header: str | None = Header(default=None, alias="Idempotency-Key"),
) -> APIResponse[ResponseErasureResult]:
    if idempotency_header is None:
        raise AppError(
            "Idempotency-Key is required for response erasure.",
            status_code=status.HTTP_400_BAD_REQUEST,
        )
    try:
        idempotency_key = UUID(idempotency_header)
    except ValueError as exc:
        raise AppError(
            "Idempotency-Key must be a valid UUID.",
            status_code=status.HTTP_400_BAD_REQUEST,
        ) from exc

    ip_address = request.client.host if request.client else None
    result = await response_service.erase_responses(
        session,
        survey_id,
        payload,
        idempotency_key=idempotency_key,
        actor_id=principal.user.id,
        ip_address=ip_address,
    )
    return success_response(result, message="Responses erased.")
