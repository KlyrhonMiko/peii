from uuid import UUID

from fastapi import APIRouter, Depends, Response

from core.deps import AsyncDBSession, CurrentPrincipal, require_permissions
from core.responses import APIResponse, success_response
from schemas.survey_analytics import SurveyResponseAggregate
from schemas.peii import PEIIAnalyticsResponse
from services import survey_analytics_service

router = APIRouter()


@router.get(
    "/aggregates",
    response_model=APIResponse[list[SurveyResponseAggregate]],
    dependencies=[Depends(require_permissions("survey_responses.read_aggregates"))],
    summary="Aggregate Survey Responses",
    description="Return exact aggregates for supported question types.",
)
async def aggregate_survey_responses(
    survey_id: UUID,
    session: AsyncDBSession,
    http_response: Response,
    principal: CurrentPrincipal,
) -> APIResponse[list[SurveyResponseAggregate]]:
    http_response.headers["Cache-Control"] = "private, no-store, max-age=0"
    http_response.headers["Pragma"] = "no-cache"
    return success_response(
        await survey_analytics_service.aggregate_responses(session, survey_id)
    )


@router.get(
    "/peii",
    response_model=APIResponse[PEIIAnalyticsResponse],
    dependencies=[Depends(require_permissions("survey_responses.read_aggregates"))],
    summary="Compute PEII Scores",
    description="Computes the Pasig Education Impact Index across cohorts.",
)
async def compute_peii(
    survey_id: UUID,
    session: AsyncDBSession,
    http_response: Response,
    principal: CurrentPrincipal,
    batch: str | None = None,
    department: str | None = None,
) -> APIResponse[PEIIAnalyticsResponse]:
    http_response.headers["Cache-Control"] = "private, no-store, max-age=0"
    http_response.headers["Pragma"] = "no-cache"
    return success_response(
        await survey_analytics_service.compute_peii_scores(
            session=session,
            survey_ids=[survey_id],
            batch_year=batch,
            department=department
        )
    )
