from typing import cast
from uuid import UUID

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel

from core.analytics_cache import get_analytics_cached, set_analytics_cached
from core.deps import AnalyticsAsyncDBSession, AsyncDBSession, CurrentPrincipal, require_permissions
from core.responses import APIResponse, success_response
from schemas.peii import PEIIAnalyticsResponse
from schemas.survey_analytics import SurveyResponseAggregate
from services import false_positive_service, survey_analytics_service

router = APIRouter()


class FalsePositiveRequest(BaseModel):
    response_id: UUID
    question_id: UUID
    # None = flip (classic FP), 1.0 = force positive, -1.0 = force negative
    polarity_override: float | None = None


@router.get(
    "/aggregates",
    response_model=APIResponse[list[SurveyResponseAggregate]],
    dependencies=[Depends(require_permissions("survey_responses.read_aggregates"))],
    summary="Aggregate Survey Responses",
    description="Return exact aggregates for supported question types.",
)
async def aggregate_survey_responses(
    survey_id: UUID,
    session: AnalyticsAsyncDBSession,
    http_response: Response,
    principal: CurrentPrincipal,
) -> APIResponse[list[SurveyResponseAggregate]]:
    http_response.headers["Cache-Control"] = "private, no-store, max-age=0"
    http_response.headers["Pragma"] = "no-cache"
    cache_key = ("aggregates", str(survey_id))
    cached = get_analytics_cached(cache_key)
    if cached is None:
        cached = await survey_analytics_service.aggregate_responses(session, survey_id)
        set_analytics_cached(cache_key, cached)
    return success_response(cast(list[SurveyResponseAggregate], cached))


@router.get(
    "/peii",
    response_model=APIResponse[PEIIAnalyticsResponse],
    dependencies=[Depends(require_permissions("survey_responses.read_aggregates"))],
    summary="Compute PEII Scores",
    description="Computes the Pasig Education Impact Index across cohorts.",
)
async def compute_peii(
    survey_id: UUID,
    session: AnalyticsAsyncDBSession,
    http_response: Response,
    principal: CurrentPrincipal,
    batch: str | None = None,
    department: str | None = None,
) -> APIResponse[PEIIAnalyticsResponse]:
    http_response.headers["Cache-Control"] = "private, no-store, max-age=0"
    http_response.headers["Pragma"] = "no-cache"
    cache_key = ("peii", str(survey_id), batch or "", department or "")
    cached = get_analytics_cached(cache_key)
    if cached is None:
        cached = await survey_analytics_service.compute_peii_scores(
            session=session,
            survey_ids=[survey_id],
            batch_year=batch,
            department=department,
        )
        set_analytics_cached(cache_key, cached)
    return success_response(cast(PEIIAnalyticsResponse, cached))

@router.post(
    "/peii/false-positive",
    response_model=APIResponse[dict[str, str]],
    dependencies=[Depends(require_permissions("surveys.manage"))],
    summary="Mark False Positive Feedback",
    description="Marks a given qualitative feedback as false positive and updates ML cache.",
)
async def mark_false_positive(
    survey_id: UUID,
    payload: FalsePositiveRequest,
    session: AsyncDBSession,
    principal: CurrentPrincipal,
    request: Request,
) -> APIResponse[dict[str, str]]:
    ip_address = request.client.host if request.client else None
    await false_positive_service.mark_false_positive(
        session=session,
        survey_id=survey_id,
        response_id=payload.response_id,
        question_id=payload.question_id,
        polarity_override=payload.polarity_override,
        actor_id=principal.user.id,
        ip_address=ip_address,
    )
    return success_response({"status": "success"})
