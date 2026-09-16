from datetime import UTC, datetime
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Request, Response, status

from core.client_ip import resolve_client_ip
from core.config import settings
from core.deps import (
    AnalyticsAsyncDBSession,
    AsyncDBSession,
    CurrentPrincipal,
    require_permissions,
)
from core.exceptions import AppError
from core.responses import APIResponse, list_meta_response, success_response
from schemas.survey_response import (
    EraseResponsesRequest,
    ExportPreparationResponse,
    ResponseErasureResult,
    SurveyResponseIdentityRead,
    SurveyResponseImportResult,
    SurveyResponseImportValidation,
    SurveyResponseListQueryParams,
    SurveyResponseRead,
)
from services import response_export_service, response_import_service, response_service

router = APIRouter()


def get_survey_response_list_query_params(
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    sort_by: Literal["created_at"] = Query(default="created_at"),
    sort_order: Literal["asc", "desc"] = Query(default="desc"),
    submitted_from: datetime | None = Query(default=None),
    submitted_before: datetime | None = Query(default=None),
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
    )


ResponseListParams = Annotated[
    SurveyResponseListQueryParams, Depends(get_survey_response_list_query_params)
]


def require_csv_export_enabled() -> None:
    if not settings.CSV_EXPORT_ENABLED:
        raise AppError(
            "Not found.",
            status_code=status.HTTP_404_NOT_FOUND,
        )


@router.get(
    "/import-template",
    response_class=Response,
    dependencies=[Depends(require_permissions("survey_responses.import"))],
    summary="Download a survey-specific response import template",
    description=(
        "Download a UTF-8 CSV template whose ordered headers identify only the "
        "active questions in this survey."
    ),
)
async def download_response_import_template(
    survey_id: UUID,
    session: AsyncDBSession,
    http_response: Response,
    principal: CurrentPrincipal,
) -> Response:
    del principal
    csv_bytes = await response_import_service.get_import_template(session, survey_id)
    http_response.headers["Cache-Control"] = "private, no-store, max-age=0"
    http_response.headers["Pragma"] = "no-cache"
    return Response(
        content=csv_bytes,
        media_type="text/csv",
        headers={
            "Content-Disposition": (
                f'attachment; filename="{response_import_service.IMPORT_TEMPLATE_FILENAME}"'
            ),
            "Cache-Control": "private, no-store, max-age=0",
            "Pragma": "no-cache",
        },
    )


async def _read_import_csv(request: Request) -> bytes:
    raw = await request.body()
    if len(raw) > response_import_service.MAX_IMPORT_BYTES:
        raise AppError(
            "Import CSV exceeds the 2 MiB limit.",
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
        )
    return raw


@router.post(
    "/import/validate",
    response_model=APIResponse[SurveyResponseImportValidation],
    dependencies=[Depends(require_permissions("survey_responses.import"))],
    summary="Validate survey response CSV",
    description=(
        "Validate a survey-specific wide CSV without writing responses. The request body "
        "must be the raw CSV bytes."
    ),
)
async def validate_response_import(
    survey_id: UUID,
    session: AsyncDBSession,
    request: Request,
    http_response: Response,
    principal: CurrentPrincipal,
) -> APIResponse[SurveyResponseImportValidation]:
    del principal
    raw = await _read_import_csv(request)
    result = await response_import_service.validate_response_import(session, survey_id, raw)
    http_response.headers["Cache-Control"] = "private, no-store, max-age=0"
    http_response.headers["Pragma"] = "no-cache"
    return success_response(result, message="Import CSV validated.")


@router.post(
    "/import",
    response_model=APIResponse[SurveyResponseImportResult],
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permissions("survey_responses.import"))],
    summary="Import survey responses from CSV",
    description=(
        "Validate and append all rows from a survey-specific wide CSV in one atomic "
        "transaction. The request body must be the raw CSV bytes."
    ),
)
async def import_response_csv(
    survey_id: UUID,
    session: AsyncDBSession,
    request: Request,
    http_response: Response,
    principal: CurrentPrincipal,
) -> APIResponse[SurveyResponseImportResult]:
    raw = await _read_import_csv(request)
    result = await response_import_service.import_response_csv(
        session,
        survey_id,
        raw,
        actor_id=principal.user.id,
        ip_address=resolve_client_ip(request),
    )
    http_response.headers["Cache-Control"] = "private, no-store, max-age=0"
    http_response.headers["Pragma"] = "no-cache"
    return success_response(result, message="Responses imported.")


@router.get(
    "/",
    dependencies=[Depends(require_permissions("survey_responses.read_raw"))],
    response_model=APIResponse[list[SurveyResponseRead]],
    summary="List Survey Responses",
    description="Retrieve paginated responses for a specific survey.",
)
async def list_survey_responses(
    survey_id: UUID,
    session: AnalyticsAsyncDBSession,
    params: ResponseListParams,
    http_response: Response,
    principal: CurrentPrincipal,
) -> APIResponse[list[SurveyResponseRead]]:
    http_response.headers["Cache-Control"] = "private, no-store, max-age=0"
    http_response.headers["Pragma"] = "no-cache"
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
    "/identity",
    dependencies=[
        Depends(
            require_permissions(
                "survey_responses.read_raw",
                "survey_responses.read_identity",
            )
        )
    ],
    response_model=APIResponse[list[SurveyResponseIdentityRead]],
    summary="List survey responses with identity",
    description="Retrieve verified respondent identity snapshots with survey responses.",
)
async def list_survey_responses_with_identity(
    survey_id: UUID,
    session: AnalyticsAsyncDBSession,
    params: ResponseListParams,
    http_response: Response,
    principal: CurrentPrincipal,
) -> APIResponse[list[SurveyResponseIdentityRead]]:
    http_response.headers["Cache-Control"] = "private, no-store, max-age=0"
    http_response.headers["Pragma"] = "no-cache"
    responses, total = await response_service.list_responses(session, survey_id, params)
    response_data = [SurveyResponseIdentityRead.model_validate(r) for r in responses]
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
    response_model=APIResponse[ExportPreparationResponse],
    dependencies=[
        Depends(require_csv_export_enabled),
        Depends(require_permissions("survey_responses.export")),
    ],
    summary="Export Survey Responses",
    description=(
        "Prepare a safe, long-format CSV response export. The CSV is generated "
        "and uploaded to private Storage; the response returns a short-lived "
        "signed download URL."
    ),
)
async def export_survey_responses(
    survey_id: UUID,
    session: AsyncDBSession,
    request: Request,
    http_response: Response,
    principal: CurrentPrincipal,
) -> APIResponse[ExportPreparationResponse]:
    ip_address = resolve_client_ip(request)
    prepared_export = await response_export_service.prepare_response_export(
        session,
        survey_id,
        actor_id=principal.user.id,
        ip_address=ip_address,
    )
    http_response.headers["Cache-Control"] = "private, no-store, max-age=0"
    http_response.headers["Pragma"] = "no-cache"
    http_response.headers["X-Export-ID"] = str(prepared_export.export_id)
    return success_response(
        ExportPreparationResponse(
            export_id=prepared_export.export_id,
            response_count=prepared_export.response_count,
            answer_row_count=prepared_export.answer_row_count,
            download_url=prepared_export.download_url,
            expires_at=prepared_export.expires_at,
            filename=prepared_export.filename,
        ),
        message="Export prepared.",
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

    ip_address = resolve_client_ip(request)
    result = await response_service.erase_responses(
        session,
        survey_id,
        payload,
        idempotency_key=idempotency_key,
        actor_id=principal.user.id,
        ip_address=ip_address,
    )
    return success_response(result, message="Responses erased.")
