import json
from uuid import UUID

from fastapi import status
from sqlalchemy import func
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from core.exceptions import AppError
from models.survey import Survey
from models.survey_question import SurveyQuestion
from schemas.survey_question import (
    SurveyQuestionCreate,
    SurveyQuestionUpdate,
)
from services.audit_service import AuditEvent, commit_with_audit
from services.base_service import apply_updates, utc_now


async def _validate_survey_exists(session: AsyncSession, survey_id: UUID) -> Survey:
    result = await session.exec(
        select(Survey).where(col(Survey.id) == survey_id, col(Survey.is_deleted).is_(False))
    )
    survey = result.first()
    if not survey:
        raise AppError("Survey not found.", status_code=status.HTTP_404_NOT_FOUND)
    return survey


def _serialize_options(options: list[str] | None) -> str | None:
    if options is None:
        return None
    return json.dumps(options)


def _deserialize_options(options_str: str | None) -> list[str] | None:
    if options_str is None:
        return None
    try:
        return json.loads(options_str)
    except (json.JSONDecodeError, TypeError):
        return None


def _serialize_config(config: dict | None) -> str | None:
    if config is None:
        return None
    return json.dumps(config)


def _deserialize_config(config_str: str | None) -> dict | None:
    if config_str is None:
        return None
    try:
        return json.loads(config_str)
    except (json.JSONDecodeError, TypeError):
        return None


async def list_questions(
    session: AsyncSession, survey_id: UUID
) -> list[SurveyQuestion]:
    await _validate_survey_exists(session, survey_id)
    result = await session.exec(
        select(SurveyQuestion)
        .where(
            col(SurveyQuestion.survey_id) == survey_id,
            col(SurveyQuestion.is_deleted).is_(False),
        )
        .order_by(col(SurveyQuestion.order_index))
    )
    return list(result.all())


async def create_question(
    session: AsyncSession,
    survey_id: UUID,
    payload: SurveyQuestionCreate,
    ip_address: str | None = None,
) -> SurveyQuestion:
    await _validate_survey_exists(session, survey_id)

    max_order_result = await session.exec(
        select(func.count()).select_from(SurveyQuestion).where(
            col(SurveyQuestion.survey_id) == survey_id,
            col(SurveyQuestion.is_deleted).is_(False),
        )
    )
    next_order = max_order_result.one()

    question = SurveyQuestion(
        survey_id=survey_id,
        section_id=payload.section_id,
        question_text=payload.question_text,
        question_type=payload.question_type,
        options=_serialize_options(payload.options),
        config=_serialize_config(payload.config),
        order_index=next_order,
        performed_by=payload.performed_by,
    )
    session.add(question)
    await commit_with_audit(
        session,
        [
            AuditEvent(
                action="create",
                resource_type="survey_question",
                resource_id=str(question.id),
                performed_by=payload.performed_by,
                ip_address=ip_address,
            )
        ],
    )
    await session.refresh(question)
    return question


async def update_question(
    session: AsyncSession,
    survey_id: UUID,
    question_id: UUID,
    payload: SurveyQuestionUpdate,
    ip_address: str | None = None,
) -> SurveyQuestion:
    await _validate_survey_exists(session, survey_id)

    result = await session.exec(
        select(SurveyQuestion).where(
            col(SurveyQuestion.id) == question_id,
            col(SurveyQuestion.survey_id) == survey_id,
            col(SurveyQuestion.is_deleted).is_(False),
        )
    )
    question = result.first()
    if not question:
        raise AppError("Question not found.", status_code=status.HTTP_404_NOT_FOUND)

    updates = payload.model_dump(exclude_unset=True)

    changes = {}
    normalized_updates = updates.copy()
    if "options" in normalized_updates:
        normalized_updates["options"] = _serialize_options(normalized_updates["options"])
    if "config" in normalized_updates:
        normalized_updates["config"] = _serialize_config(normalized_updates["config"])

    for key, val in normalized_updates.items():
        if key == "performed_by":
            continue
        old_val = getattr(question, key)
        if key == "options":
            old_val = _deserialize_options(old_val)
            val = _deserialize_options(val)
        elif key == "config":
            old_val = _deserialize_config(old_val)
            val = _deserialize_config(val)
        if old_val != val:
            changes[key] = {"before": old_val, "after": val}

    if not changes:
        return question

    apply_updates(question, normalized_updates)
    session.add(question)
    await commit_with_audit(
        session,
        [
            AuditEvent(
                action="update",
                resource_type="survey_question",
                resource_id=str(question.id),
                performed_by=payload.performed_by,
                changes=changes,
                ip_address=ip_address,
            )
        ],
    )
    await session.refresh(question)
    return question


async def delete_question(
    session: AsyncSession,
    survey_id: UUID,
    question_id: UUID,
    performed_by: UUID | None = None,
    ip_address: str | None = None,
) -> SurveyQuestion:
    await _validate_survey_exists(session, survey_id)

    result = await session.exec(
        select(SurveyQuestion).where(
            col(SurveyQuestion.id) == question_id,
            col(SurveyQuestion.survey_id) == survey_id,
            col(SurveyQuestion.is_deleted).is_(False),
        )
    )
    question = result.first()
    if not question:
        raise AppError("Question not found.", status_code=status.HTTP_404_NOT_FOUND)

    question.is_deleted = True
    question.deleted_at = utc_now()
    question.performed_by = performed_by
    question.updated_at = utc_now()
    session.add(question)
    await commit_with_audit(
        session,
        [
            AuditEvent(
                action="delete",
                resource_type="survey_question",
                resource_id=str(question.id),
                performed_by=performed_by,
                ip_address=ip_address,
            )
        ],
    )
    await session.refresh(question)
    return question


async def reorder_questions(
    session: AsyncSession,
    survey_id: UUID,
    question_ids: list[UUID],
    performed_by: UUID | None = None,
    ip_address: str | None = None,
) -> list[SurveyQuestion]:
    await _validate_survey_exists(session, survey_id)

    existing_result = await session.exec(
        select(SurveyQuestion.id).where(
            col(SurveyQuestion.survey_id) == survey_id,
            col(SurveyQuestion.is_deleted).is_(False),
        )
    )
    existing_ids = set(existing_result.all())

    if set(question_ids) != existing_ids:
        raise AppError(
            "Provided question IDs do not match the survey's active questions.",
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    questions = []
    changes = []
    for idx, qid in enumerate(question_ids):
        result = await session.exec(
            select(SurveyQuestion).where(
                col(SurveyQuestion.id) == qid,
                col(SurveyQuestion.survey_id) == survey_id,
            )
        )
        question = result.first()
        if question:
            old_order = question.order_index
            question.order_index = idx
            session.add(question)
            questions.append(question)
            if old_order != idx:
                changes.append(
                    AuditEvent(
                        action="reorder",
                        resource_type="survey_question",
                        resource_id=str(question.id),
                        performed_by=performed_by,
                        changes={"order_index": {"before": old_order, "after": idx}},
                        ip_address=ip_address,
                    )
                )

    if not changes:
        return sorted(questions, key=lambda q: q.order_index)

    await commit_with_audit(session, changes)
    for q in questions:
        await session.refresh(q)

    questions.sort(key=lambda q: q.order_index)
    return questions
