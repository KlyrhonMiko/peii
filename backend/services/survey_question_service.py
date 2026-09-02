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
from schemas.survey_question import SurveyQuestionCreate, SurveyQuestionUpdate
from services.audit_service import AuditEvent, commit_with_audit
from services.base_service import apply_updates, utc_now
from services.question_validation import validate_question_definition
from services.survey_service import get_survey_for_structure_edit


async def _validate_survey_exists(session: AsyncSession, survey_id: UUID) -> Survey:
    result = await session.exec(
        select(Survey).where(
            col(Survey.id) == survey_id,
            col(Survey.is_deleted).is_(False),
        )
    )
    survey = result.first()
    if not survey:
        raise AppError("Survey not found.", status_code=status.HTTP_404_NOT_FOUND)
    return survey


def _serialize_options(options: list[str] | None) -> str | None:
    return json.dumps(options) if options is not None else None


def _deserialize_options(options_str: str | None) -> list[str] | None:
    if options_str is None:
        return None
    try:
        return json.loads(options_str)
    except (json.JSONDecodeError, TypeError):
        return None


def _serialize_config(config: dict | None) -> str | None:
    return json.dumps(config) if config is not None else None


def _deserialize_config(config_str: str | None) -> dict | None:
    if config_str is None:
        return None
    try:
        return json.loads(config_str)
    except (json.JSONDecodeError, TypeError):
        return None


async def list_questions(session: AsyncSession, survey_id: UUID) -> list[SurveyQuestion]:
    await _validate_survey_exists(session, survey_id)
    result = await session.exec(
        select(SurveyQuestion)
        .join(SurveySection, col(SurveySection.id) == SurveyQuestion.section_id)
        .where(
            col(SurveyQuestion.survey_id) == survey_id,
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


def _question_definition_error(exc: ValueError) -> AppError:
    return AppError(
        f"Question definition is invalid: {exc}",
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
    )


async def create_question(
    session: AsyncSession,
    survey_id: UUID,
    payload: SurveyQuestionCreate,
    actor_id: UUID,
    ip_address: str | None = None,
) -> SurveyQuestion:
    survey = await get_survey_for_structure_edit(session, survey_id)
    try:
        validate_question_definition(payload.question_type, payload.options, payload.config)
    except ValueError as exc:
        raise _question_definition_error(exc) from exc

    section_result = await session.exec(
        select(SurveySection).where(
            col(SurveySection.id) == payload.section_id,
            col(SurveySection.survey_id) == survey.id,
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
            col(SurveyQuestion.survey_id) == survey.id,
            col(SurveyQuestion.is_deleted).is_(False),
        )
    )
    current_max = max_order_result.one()
    question = SurveyQuestion(
        survey_id=survey.id,
        section_id=payload.section_id,
        question_text=payload.question_text,
        question_type=payload.question_type,
        options=_serialize_options(payload.options),
        config=_serialize_config(payload.config),
        order_index=(current_max if current_max is not None else -1) + 1,
        is_required=payload.is_required,
        performed_by=actor_id,
    )
    session.add(question)
    survey.updated_at = utc_now()
    session.add(survey)

    await commit_with_audit(
        session,
        [
            AuditEvent(
                action="create",
                resource_type="survey_question",
                resource_id=str(question.id),
                performed_by=actor_id,
                ip_address=ip_address,
            ),
        ],
    )
    await session.refresh(question)
    return question


async def update_question(
    session: AsyncSession,
    survey_id: UUID,
    question_id: UUID,
    payload: SurveyQuestionUpdate,
    actor_id: UUID,
    ip_address: str | None = None,
) -> SurveyQuestion:
    survey = await get_survey_for_structure_edit(session, survey_id)
    result = await session.exec(
        select(SurveyQuestion).where(
            col(SurveyQuestion.id) == question_id,
            col(SurveyQuestion.survey_id) == survey.id,
            col(SurveyQuestion.is_deleted).is_(False),
        )
    )
    question = result.first()
    if not question:
        raise AppError("Question not found.", status_code=status.HTTP_404_NOT_FOUND)

    updates = payload.model_dump(exclude_unset=True)
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
                col(SurveySection.survey_id) == survey.id,
                col(SurveySection.is_deleted).is_(False),
            )
        )
        if target_result.first() is None:
            raise AppError(
                "Target section not found in the requested survey.",
                status_code=status.HTTP_400_BAD_REQUEST,
            )
        if target_section_id != question.section_id:
            max_order_result = await session.exec(
                select(func.max(SurveyQuestion.order_index)).where(
                    col(SurveyQuestion.section_id) == target_section_id,
                    col(SurveyQuestion.survey_id) == survey.id,
                    col(SurveyQuestion.is_deleted).is_(False),
                )
            )
            current_max = max_order_result.one()
            normalized_updates["order_index"] = (current_max if current_max is not None else -1) + 1
    if normalized_updates.get("question_type") is None and "question_type" in normalized_updates:
        raise AppError("question_type cannot be null.", status_code=status.HTTP_400_BAD_REQUEST)
    if "options" in normalized_updates:
        normalized_updates["options"] = _serialize_options(normalized_updates["options"])
    if "config" in normalized_updates:
        normalized_updates["config"] = _serialize_config(normalized_updates["config"])

    try:
        validate_question_definition(
            normalized_updates.get("question_type", question.question_type),
            _deserialize_options(normalized_updates.get("options", question.options)),
            _deserialize_config(normalized_updates.get("config", question.config)),
        )
    except ValueError as exc:
        raise _question_definition_error(exc) from exc

    changes: dict[str, dict[str, object]] = {}
    for key, value in normalized_updates.items():
        old_value = getattr(question, key)
        if key == "options":
            old_value = _deserialize_options(old_value)
            value = _deserialize_options(value)
        elif key == "config":
            old_value = _deserialize_config(old_value)
            value = _deserialize_config(value)
        if old_value != value:
            changes[key] = {"before": old_value, "after": value}
    if not changes:
        return question

    apply_updates(question, normalized_updates)
    question.performed_by = actor_id
    session.add(question)
    survey.updated_at = utc_now()
    session.add(survey)

    await commit_with_audit(
        session,
        [
            AuditEvent(
                action="update",
                resource_type="survey_question",
                resource_id=str(question.id),
                performed_by=actor_id,
                changes=changes,
                ip_address=ip_address,
            ),
        ],
    )
    await session.refresh(question)
    return question


async def delete_question(
    session: AsyncSession,
    survey_id: UUID,
    question_id: UUID,
    actor_id: UUID,
    ip_address: str | None = None,
) -> SurveyQuestion:
    survey = await get_survey_for_structure_edit(session, survey_id)
    result = await session.exec(
        select(SurveyQuestion).where(
            col(SurveyQuestion.id) == question_id,
            col(SurveyQuestion.survey_id) == survey.id,
            col(SurveyQuestion.is_deleted).is_(False),
        )
    )
    question = result.first()
    if not question:
        raise AppError("Question not found.", status_code=status.HTTP_404_NOT_FOUND)

    now = utc_now()
    question.is_deleted = True
    question.deleted_at = now
    question.performed_by = actor_id
    question.updated_at = now
    session.add(question)
    survey.updated_at = now
    session.add(survey)

    await commit_with_audit(
        session,
        [
            AuditEvent(
                action="delete",
                resource_type="survey_question",
                resource_id=str(question.id),
                performed_by=actor_id,
                ip_address=ip_address,
            ),
        ],
    )
    await session.refresh(question)
    return question


async def reorder_questions(
    session: AsyncSession,
    survey_id: UUID,
    question_ids: list[UUID],
    actor_id: UUID,
    section_id: UUID | None = None,
    ip_address: str | None = None,
) -> list[SurveyQuestion]:
    survey = await get_survey_for_structure_edit(session, survey_id)
    if section_id is not None:
        section_result = await session.exec(
            select(SurveySection).where(
                col(SurveySection.id) == section_id,
                col(SurveySection.survey_id) == survey.id,
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
                col(SurveyQuestion.survey_id) == survey.id,
                col(SurveyQuestion.is_deleted).is_(False),
            )
            .distinct()
        )
        section_ids = list(question_section_result.all())
        if len(section_ids) > 1:
            raise AppError(
                "section_id is required when reordering questions from multiple sections.",
                status_code=status.HTTP_400_BAD_REQUEST,
            )
        if section_ids:
            section_id = section_ids[0]

    existing_statement = select(SurveyQuestion).where(
        col(SurveyQuestion.survey_id) == survey.id,
        col(SurveyQuestion.is_deleted).is_(False),
    )
    if section_id is not None:
        existing_statement = existing_statement.where(col(SurveyQuestion.section_id) == section_id)
    existing_result = await session.exec(existing_statement)
    questions_by_id = {question.id: question for question in existing_result.all()}
    if len(question_ids) != len(questions_by_id) or set(question_ids) != set(questions_by_id):
        raise AppError(
            "Provided question IDs do not match the section's active questions.",
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    changes = [
        AuditEvent(
            action="reorder",
            resource_type="survey_question",
            resource_id=str(question_id),
            performed_by=actor_id,
            changes={
                "order_index": {
                    "before": questions_by_id[question_id].order_index,
                    "after": index,
                }
            },
            ip_address=ip_address,
        )
        for index, question_id in enumerate(question_ids)
        if questions_by_id[question_id].order_index != index
    ]
    if not changes:
        return sorted(questions_by_id.values(), key=lambda q: (q.order_index, q.id))

    changed_question_ids = {event.resource_id for event in changes}
    questions = [questions_by_id[question_id] for question_id in question_ids]
    temporary_base = max(question.order_index for question in questions) + len(questions) + 1
    for index, question in enumerate(questions):
        question.order_index = temporary_base + index
        session.add(question)
    await session.flush()
    for index, question in enumerate(questions):
        question.order_index = index
        if str(question.id) in changed_question_ids:
            question.performed_by = actor_id
            session.add(question)

    survey.updated_at = utc_now()
    session.add(survey)
    await commit_with_audit(session, changes)
    for question in questions:
        await session.refresh(question)
    return questions
