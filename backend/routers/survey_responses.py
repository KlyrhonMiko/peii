from datetime import UTC, datetime
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Request, Response, status
from fastapi.responses import StreamingResponse

from core.deps import AsyncDBSession, CurrentPrincipal, require_permissions
from core.exceptions import AppError
from core.responses import APIResponse, list_meta_response, success_response
from schemas.survey_response import (
    EraseResponsesRequest,
    ResponseErasureResult,
    SurveyResponseListQueryParams,
    SurveyResponseRead,
)
from services import response_export_service, response_service, survey_service

router = APIRouter()


def get_survey_response_list_query_params(
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    sort_by: Literal["created_at"] = Query(default="created_at"),
    sort_order: Literal["asc", "desc"] = Query(default="desc"),
    submitted_from: datetime | None = Query(default=None),
    submitted_before: datetime | None = Query(default=None),
    distribution_id: UUID | None = Query(default=None),
) -> SurveyResponseListQueryParams:
    if submitted_from is not None and submitted_before is not None:
        def normalize(value: datetime) -> datetime:
            if value.tzinfo is None:
                return value
            return value.astimezone(UTC).replace(tzinfo=None)

        if normalize(submitted_from) >= normalize(submitted_before):
            raise AppError(
                "submitted_from must be earlier than submitted_before.",
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                errors=[
                    {
                        "loc": ["query", "submitted_from"],
                        "msg": "submitted_from must be earlier than submitted_before.",
                        "type": "value_error",
                    }
                ],
            )
    return SurveyResponseListQueryParams(
        limit=limit,
        offset=offset,
        sort_by=sort_by,
        sort_order=sort_order,
        submitted_from=submitted_from,
        submitted_before=submitted_before,
        distribution_id=distribution_id,
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
    await survey_service.resolve_survey(session, survey_id, include_deleted=True)
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
    "/export",
    response_class=StreamingResponse,
    dependencies=[Depends(require_permissions("survey_responses.export"))],
    summary="Export Survey Responses",
    description="Download a safe, long-format CSV response export.",
)
async def export_survey_responses(
    survey_id: UUID,
    session: AsyncDBSession,
    request: Request,
    principal: CurrentPrincipal,
) -> StreamingResponse:
    ip_address = request.client.host if request.client else None
    prepared_export = await response_export_service.prepare_response_export(
        session,
        survey_id,
        actor_id=principal.user.id,
        ip_address=ip_address,
    )
    return StreamingResponse(
        content=prepared_export.content,
        media_type="text/csv",
        headers={
            "Cache-Control": "private, no-store, max-age=0",
            "Pragma": "no-cache",
            "X-Content-Type-Options": "nosniff",
            "Referrer-Policy": "no-referrer",
            "Expires": "0",
            "Content-Security-Policy": "sandbox",
            "Cross-Origin-Resource-Policy": "same-origin",
            "X-Accel-Buffering": "no",
            "X-Export-ID": str(prepared_export.export_id),
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
