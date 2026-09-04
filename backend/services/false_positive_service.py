import asyncio
from typing import cast
from uuid import UUID

from fastapi import status
from sqlalchemy.orm.attributes import flag_modified
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from core.analytics_cache import invalidate_survey_analytics
from core.exceptions import AppError
from core.logging import get_logger
from models.false_positive_feedback import FalsePositiveFeedback
from models.survey_question import SurveyQuestion
from models.survey_response import SurveyResponse
from services.audit_service import AuditEvent, commit_with_audit
from services.ml_service import FeedbackAnalyzer

logger = get_logger(__name__)


async def mark_false_positive(
    session: AsyncSession,
    survey_id: UUID,
    response_id: UUID,
    question_id: UUID,
    polarity_override: float | None,
    actor_id: UUID,
    ip_address: str | None = None,
) -> None:
    """Upsert a false-positive feedback and flip/force the response sentiment.

    The feedback row, the response sentiment change, and their audit events are
    persisted atomically through ``commit_with_audit``. The ML cache/training
    side effect is best-effort and runs after the audited commit succeeds.
    """
    response_result = await session.exec(
        select(SurveyResponse).where(
            col(SurveyResponse.id) == response_id,
            col(SurveyResponse.survey_id) == survey_id,
            col(SurveyResponse.is_deleted).is_(False),
        )
    )
    response = response_result.first()
    if not response:
        raise AppError("Response not found.", status_code=status.HTTP_404_NOT_FOUND)

    question_result = await session.exec(
        select(SurveyQuestion).where(
            col(SurveyQuestion.id) == question_id,
            col(SurveyQuestion.survey_id) == survey_id,
            col(SurveyQuestion.is_deleted).is_(False),
        )
    )
    question = question_result.first()
    if not question:
        raise AppError("Question not found.", status_code=status.HTTP_404_NOT_FOUND)

    events: list[AuditEvent] = []

    existing_result = await session.exec(
        select(FalsePositiveFeedback).where(
            col(FalsePositiveFeedback.response_id) == response_id,
            col(FalsePositiveFeedback.question_id) == question_id,
        )
    )
    existing = existing_result.first()

    if existing:
        if existing.polarity_override != polarity_override:
            changes = {
                "polarity_override": {
                    "before": existing.polarity_override,
                    "after": polarity_override,
                }
            }
            existing.polarity_override = polarity_override
            existing.performed_by = actor_id
            session.add(existing)
            events.append(
                AuditEvent(
                    action="update",
                    resource_type="false_positive_feedback",
                    resource_id=str(existing.id),
                    performed_by=actor_id,
                    changes=changes,
                    ip_address=ip_address,
                )
            )
    else:
        feedback = FalsePositiveFeedback(
            response_id=response_id,
            question_id=question_id,
            polarity_override=polarity_override,
            performed_by=actor_id,
        )
        session.add(feedback)
        events.append(
            AuditEvent(
                action="create",
                resource_type="false_positive_feedback",
                resource_id=str(feedback.id),
                performed_by=actor_id,
                ip_address=ip_address,
            )
        )

    answer_text = None
    if isinstance(response.answers, dict):
        answer_text = response.answers.get(str(question_id))

    sentiment_changes: dict | None = None
    if isinstance(response.ml_sentiments, dict):
        question_key = str(question_id)
        current = response.ml_sentiments.get(question_key)
        if isinstance(current, list):
            pairs = cast(list[tuple[str, float]], current)
            if polarity_override is not None:
                new_sentiments = [[dim, polarity_override] for dim, _ in pairs]
            else:
                new_sentiments = [[dim, -polarity] for dim, polarity in pairs]
            response.ml_sentiments[question_key] = new_sentiments
            flag_modified(response, "ml_sentiments")
            session.add(response)
            sentiment_changes = {
                question_key: {"before": current, "after": new_sentiments}
            }
            events.append(
                AuditEvent(
                    action="update",
                    resource_type="survey_response",
                    resource_id=str(response.id),
                    performed_by=actor_id,
                    changes=sentiment_changes,
                    ip_address=ip_address,
                )
            )

    if not events:
        # Nothing changed; no write and no audit event for a no-op request.
        return

    await commit_with_audit(session, events)
    invalidate_survey_analytics(survey_id)

    # Best-effort cache/training-data side effect; must not fail the request.
    if answer_text and isinstance(answer_text, str):
        prompt = f"Question: {question.question_text} Answer: {answer_text}"
        try:
            # Construct the analyzer lazily inside the worker so cold-start model
            # loading does not block the event loop.
            await asyncio.to_thread(
                lambda: FeedbackAnalyzer.get_instance().register_false_positive(prompt)
            )
        except Exception as exc:  # pragma: no cover - defensive
            logger.error(
                "False-positive cache registration failed",
                error_type=type(exc).__name__,
                question_id=str(question_id),
                response_id=str(response_id),
            )
