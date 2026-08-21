import json
from uuid import UUID

from fastapi import status
from sqlalchemy import func
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from core.exceptions import AppError
from models.survey import Survey
from models.survey_question import SurveyQuestion
from models.survey_section import SurveySection
from schemas.survey_question import (
    SurveyQuestionCreate,
    SurveyQuestionUpdate,
)
from services.audit_service import AuditEvent, commit_with_audit
from services.base_service import apply_updates, utc_now
from services.survey_version_service import ensure_draft_version, get_version_for_read


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
    version = await get_version_for_read(session, survey_id)
    result = await session.exec(
        select(SurveyQuestion)
        .join(SurveySection, col(SurveySection.id) == SurveyQuestion.section_id)
        .where(
            col(SurveyQuestion.survey_id) == survey_id,
            col(SurveyQuestion.version_id) == version.id,
            col(SurveySection.version_id) == version.id,
            col(SurveyQuestion.is_deleted).is_(False),
            col(SurveySection.is_deleted).is_(False),
        )
        .order_by(
            col(SurveySection.order_index),
            col(SurveySection.id),
            col(SurveyQuestion.order_index),
            col(SurveyQuestion.id),
        )
    )
    return list(result.all())


async def create_question(
    session: AsyncSession,
    survey_id: UUID,
    payload: SurveyQuestionCreate,
    ip_address: str | None = None,
) -> SurveyQuestion:
    survey = await _validate_survey_exists(session, survey_id)
    draft, version_events = await ensure_draft_version(session, survey)

    section_result = await session.exec(
        select(SurveySection).where(
            col(SurveySection.id) == payload.section_id,
            col(SurveySection.survey_id) == survey_id,
            col(SurveySection.version_id) == draft.id,
            col(SurveySection.is_deleted).is_(False),
        )
    )
    if section_result.first() is None:
        raise AppError(
            "Section not found in the requested survey.",
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    max_order_result = await session.exec(
        select(func.max(SurveyQuestion.order_index)).where(
            col(SurveyQuestion.section_id) == payload.section_id,
            col(SurveyQuestion.survey_id) == survey_id,
            col(SurveyQuestion.version_id) == draft.id,
            col(SurveyQuestion.is_deleted).is_(False),
        )
    )
    current_max = max_order_result.one()
    next_order = (current_max if current_max is not None else -1) + 1

    question = SurveyQuestion(
        survey_id=survey_id,
        version_id=draft.id,
        section_id=payload.section_id,
        question_text=payload.question_text,
        question_type=payload.question_type,
        options=_serialize_options(payload.options),
        config=_serialize_config(payload.config),
        order_index=next_order,
        is_required=payload.is_required,
        performed_by=payload.performed_by,
    )
    session.add(question)
    await commit_with_audit(
        session,
        [
            *version_events,
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
    survey = await _validate_survey_exists(session, survey_id)
    draft, version_events = await ensure_draft_version(session, survey)

    result = await session.exec(
        select(SurveyQuestion).where(
            col(SurveyQuestion.id) == question_id,
            col(SurveyQuestion.survey_id) == survey_id,
            col(SurveyQuestion.version_id) == draft.id,
            col(SurveyQuestion.is_deleted).is_(False),
        )
    )
    question = result.first()
    if not question:
        raise AppError("Question not found.", status_code=status.HTTP_404_NOT_FOUND)

    updates = payload.model_dump(exclude_unset=True)

    changes = {}
    normalized_updates = updates.copy()
    if "section_id" in normalized_updates:
        target_section_id = normalized_updates["section_id"]
        if target_section_id is None:
            raise AppError(
                "Questions must belong to an active section.",
                status_code=status.HTTP_400_BAD_REQUEST,
            )
        target_result = await session.exec(
            select(SurveySection).where(
                col(SurveySection.id) == target_section_id,
                col(SurveySection.survey_id) == survey_id,
                col(SurveySection.version_id) == draft.id,
                col(SurveySection.is_deleted).is_(False),
            )
        )
        if target_result.first() is None:
            raise AppError(
                "Target section not found in the requested survey.",
                status_code=status.HTTP_400_BAD_REQUEST,
            )
        if target_section_id != question.section_id:
            next_order_result = await session.exec(
                select(func.max(SurveyQuestion.order_index)).where(
                    col(SurveyQuestion.section_id) == target_section_id,
                    col(SurveyQuestion.survey_id) == survey_id,
                    col(SurveyQuestion.version_id) == draft.id,
                    col(SurveyQuestion.is_deleted).is_(False),
                )
            )
            current_max = next_order_result.one()
            normalized_updates["order_index"] = (
                current_max if current_max is not None else -1
            ) + 1
    if "question_type" in normalized_updates and normalized_updates["question_type"] is None:
        raise AppError(
            "question_type cannot be null.",
            status_code=status.HTTP_400_BAD_REQUEST,
        )
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
            *version_events,
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
    survey = await _validate_survey_exists(session, survey_id)
    draft, version_events = await ensure_draft_version(session, survey)

    result = await session.exec(
        select(SurveyQuestion).where(
            col(SurveyQuestion.id) == question_id,
            col(SurveyQuestion.survey_id) == survey_id,
            col(SurveyQuestion.version_id) == draft.id,
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
            *version_events,
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
    section_id: UUID | None = None,
    performed_by: UUID | None = None,
    ip_address: str | None = None,
) -> list[SurveyQuestion]:
    survey = await _validate_survey_exists(session, survey_id)
    draft, version_events = await ensure_draft_version(session, survey)

    if section_id is not None:
        section_result = await session.exec(
            select(SurveySection).where(
                col(SurveySection.id) == section_id,
                col(SurveySection.survey_id) == survey_id,
                col(SurveySection.is_deleted).is_(False),
            )
        )
        if section_result.first() is None:
            raise AppError("Section not found.", status_code=status.HTTP_404_NOT_FOUND)

    if section_id is None and question_ids:
        question_section_result = await session.exec(
            select(SurveyQuestion.section_id)
            .where(
                col(SurveyQuestion.id).in_(question_ids),
                col(SurveyQuestion.survey_id) == survey_id,
                col(SurveyQuestion.version_id) == draft.id,
                col(SurveyQuestion.is_deleted).is_(False),
            )
            .distinct()
        )
        section_ids: list[UUID] = list(question_section_result.all())
        if len(section_ids) > 1:
            raise AppError(
                "section_id is required when reordering questions from multiple sections.",
                status_code=status.HTTP_400_BAD_REQUEST,
            )
        if section_ids:
            section_id = section_ids[0]

    existing_statement = select(SurveyQuestion.id).where(
        col(SurveyQuestion.survey_id) == survey_id,
        col(SurveyQuestion.version_id) == draft.id,
        col(SurveyQuestion.is_deleted).is_(False),
    )
    if section_id is not None:
        existing_statement = existing_statement.where(
            col(SurveyQuestion.section_id) == section_id
        )
    existing_result = await session.exec(existing_statement)
    existing_ids = set(existing_result.all())

    if len(question_ids) != len(existing_ids) or set(question_ids) != existing_ids:
        raise AppError(
            "Provided question IDs do not match the section's active questions.",
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    questions = []
    changes = []
    for idx, qid in enumerate(question_ids):
        result = await session.exec(
            select(SurveyQuestion).where(
                col(SurveyQuestion.id) == qid,
                col(SurveyQuestion.survey_id) == survey_id,
                col(SurveyQuestion.section_id) == section_id,
                col(SurveyQuestion.version_id) == draft.id,
                col(SurveyQuestion.is_deleted).is_(False),
            )
        )
        question = result.first()
        if question:
            old_order = question.order_index
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
        return sorted(questions, key=lambda q: (q.order_index, q.id))

    # Avoid transient collisions with the active section-order unique index.
    temporary_base = max(question.order_index for question in questions) + len(questions) + 1
    for idx, question in enumerate(questions):
        question.order_index = temporary_base + idx
        session.add(question)
    await session.flush()
    for idx, question in enumerate(questions):
        question.order_index = idx
        session.add(question)

    await commit_with_audit(session, [*version_events, *changes])
    for q in questions:
        await session.refresh(q)

    questions.sort(key=lambda q: (q.order_index, q.id))
    return questions
