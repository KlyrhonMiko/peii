from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlmodel.ext.asyncio.session import AsyncSession

from core.deps import AsyncDBSession
from core.responses import APIResponse, list_meta_response, success_response
from schemas.survey_response import SurveyResponseListQueryParams, SurveyResponseRead
from services import response_service

router = APIRouter()


def get_survey_response_list_query_params(
    limit: int = 50,
    offset: int = 0,
    sort_by: str = "created_at",
    sort_order: str = "desc",
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
    response_model=APIResponse[list[SurveyResponseRead]],
    summary="List Survey Responses",
    description="Retrieve paginated responses for a specific survey.",
)
async def list_survey_responses(
    survey_id: UUID,
    session: AsyncDBSession,
    params: ResponseListParams,
) -> APIResponse[list[SurveyResponseRead]]:
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
