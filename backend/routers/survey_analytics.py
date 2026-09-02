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

from pydantic import BaseModel
class FalsePositiveRequest(BaseModel):
    response_id: UUID
    question_id: UUID

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
) -> APIResponse[dict[str, str]]:
    from models.false_positive_feedback import FalsePositiveFeedback
    from models.survey_response import SurveyResponse
    from models.survey_question import SurveyQuestion
    from services.ml_service import FeedbackAnalyzer
    import asyncio
    
    # 1. Insert record
    fp = FalsePositiveFeedback(
        response_id=payload.response_id,
        question_id=payload.question_id
    )
    session.add(fp)
    
    # 2. Update ML cache and ml_sentiments if response exists
    resp = await session.get(SurveyResponse, payload.response_id)
    if resp and isinstance(resp.answers, dict):
        text_ans = resp.answers.get(str(payload.question_id))
        if text_ans and isinstance(text_ans, str):
            q = await session.get(SurveyQuestion, payload.question_id)
            if q:
                # Format exactly as cached
                prompt = f"Question: {q.question_text} Answer: {text_ans}"
                
                def _register_fp():
                    import logging
                    logger = logging.getLogger("api.survey_analytics")
                    try:
                        logger.info(f"Starting background task for false positive registration on question_id: {payload.question_id}")
                        FeedbackAnalyzer.get_instance().register_false_positive(prompt)
                        logger.info("Completed background task for false positive registration.")
                    except Exception as e:
                        logger.error(f"Failed in background task for false positive registration: {e}")
                
                # Tell ML Service to register it in a background thread
                asyncio.create_task(asyncio.to_thread(_register_fp))
            
            # Flip polarity in database if it exists
            if resp.ml_sentiments:
                q_sents = resp.ml_sentiments.get(str(payload.question_id), [])
                if q_sents:
                    new_sents = [[dim, -polarity] for dim, polarity in q_sents]
                    resp.ml_sentiments[str(payload.question_id)] = new_sents
                    
                    # We need to flag column as modified so sqlalchemy detects jsonb change
                    from sqlalchemy.orm.attributes import flag_modified
                    flag_modified(resp, "ml_sentiments")
                    
                    session.add(resp)
            
    await session.commit()
    
    return success_response({"status": "success"})
