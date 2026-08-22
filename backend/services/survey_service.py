import json
from uuid import UUID

from fastapi import status
from sqlalchemy import func, or_
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from core.exceptions import AppError
from models.survey import Survey
from models.survey_question import SurveyQuestion
from models.survey_response import SurveyResponse
from models.survey_section import SurveySection
from schemas.survey import (
    SurveyCreate,
    SurveyCreateWithStructure,
    SurveyDelete,
    SurveyListQueryParams,
    SurveyRestore,
    SurveyUpdate,
)
from services.audit_service import AuditEvent, commit_with_audit
from services.base_service import apply_updates, utc_now
from services.question_validation import validate_question_definition
from utils.identifiers import generate_business_id
from utils.sorting import stable_order_by


def _apply_survey_list_filters(statement, params: SurveyListQueryParams):
    if not params.include_deleted:
        statement = statement.where(col(Survey.is_deleted).is_(False))

    if params.status is not None:
        statement = statement.where(col(Survey.status) == params.status)
    if params.target_cohort is not None:
        statement = statement.where(col(Survey.target_cohort) == params.target_cohort)
    if params.search is not None:
        search_term = f"%{params.search}%"
        statement = statement.where(
            or_(
                col(Survey.survey_id).ilike(search_term),
                col(Survey.title).ilike(search_term),
                col(Survey.description).ilike(search_term),
            )
        )

    return statement


async def list_surveys(
    session: AsyncSession, params: SurveyListQueryParams
) -> tuple[list[Survey], int]:
    statement = select(Survey)
    statement = _apply_survey_list_filters(statement, params)

    total_statement = _apply_survey_list_filters(
        select(func.count()).select_from(Survey), params
    )
    total_result = await session.exec(total_statement)
    total = total_result.one()

    sort_columns = {
        "created_at": Survey.created_at,
        "survey_id": Survey.survey_id,
        "title": Survey.title,
        "status": Survey.status,
        "responses_count": Survey.responses_count,
    }
    sort_column = sort_columns[params.sort_by]
    statement = stable_order_by(
        statement,
        sort_column,
        sort_order=params.sort_order,
        id_column=Survey.id,
    )
    statement = statement.offset(params.offset).limit(params.limit)
    result = await session.exec(statement)
    rows = list(result.all())
    return rows, total


async def get_survey(
    session: AsyncSession, survey_id: str, include_deleted: bool = False
) -> Survey:
    result = await session.exec(select(Survey).where(col(Survey.survey_id) == survey_id))
    survey = result.first()
    if not survey or (survey.is_deleted and not include_deleted):
        raise AppError("Survey not found.", status_code=status.HTTP_404_NOT_FOUND)
    return survey


async def get_survey_by_uuid(session: AsyncSession, survey_id: UUID) -> Survey:
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


async def get_survey_for_structure_edit(
    session: AsyncSession, survey_id: UUID
) -> Survey:
    result = await session.exec(
        select(Survey)
        .where(col(Survey.id) == survey_id, col(Survey.is_deleted).is_(False))
        .with_for_update()
    )
    survey = result.first()
    if not survey:
        raise AppError("Survey not found.", status_code=status.HTTP_404_NOT_FOUND)
    if survey.status != "Inactive":
        raise AppError(
            "Survey structure can only be edited while the survey is inactive.",
            status_code=status.HTTP_409_CONFLICT,
        )

    response_count_result = await session.exec(
        select(func.count()).select_from(SurveyResponse).where(
            col(SurveyResponse.survey_id) == survey_id
        )
    )
    if response_count_result.one() > 0:
        raise AppError(
            "Survey structure cannot be edited after a response is submitted.",
            status_code=status.HTTP_409_CONFLICT,
        )
    return survey


async def get_survey_with_questions(
    session: AsyncSession, survey_id: str
) -> tuple[Survey, list[SurveyQuestion]]:
    survey = await get_survey(session, survey_id)
    questions_result = await session.exec(
        select(SurveyQuestion)
        .join(SurveySection, col(SurveySection.id) == SurveyQuestion.section_id)
        .where(
            col(SurveyQuestion.survey_id) == survey.id,
            col(SurveySection.is_deleted).is_(False),
            col(SurveyQuestion.is_deleted).is_(False),
        )
        .order_by(
            col(SurveySection.order_index),
            col(SurveySection.id),
            col(SurveyQuestion.order_index),
            col(SurveyQuestion.id),
        )
    )
    questions = list(questions_result.all())
    return survey, questions


async def get_survey_with_sections(
    session: AsyncSession, survey_id: str
) -> tuple[Survey, list[tuple[SurveySection, list[SurveyQuestion]]]]:
    survey = await get_survey(session, survey_id)
    sections_result = await session.exec(
        select(SurveySection)
        .where(
            col(SurveySection.survey_id) == survey.id,
            col(SurveySection.is_deleted).is_(False),
        )
        .order_by(col(SurveySection.order_index), col(SurveySection.id))
    )
    sections = list(sections_result.all())

    sections_with_questions: list[tuple[SurveySection, list[SurveyQuestion]]] = []
    for section in sections:
        questions_result = await session.exec(
            select(SurveyQuestion)
            .where(
                col(SurveyQuestion.section_id) == section.id,
                col(SurveyQuestion.survey_id) == survey.id,
                col(SurveyQuestion.is_deleted).is_(False),
            )
            .order_by(col(SurveyQuestion.order_index), col(SurveyQuestion.id))
        )
        questions = list(questions_result.all())
        sections_with_questions.append((section, questions))

    return survey, sections_with_questions


async def create_survey(
    session: AsyncSession, payload: SurveyCreate, ip_address: str | None = None
) -> Survey:
    survey_data = payload.model_dump(exclude={"performed_by"})
    survey_data["survey_id"] = generate_business_id("SURV")
    survey = Survey.model_validate(survey_data)
    survey.performed_by = payload.performed_by
    session.add(survey)
    await commit_with_audit(
        session,
        [
            AuditEvent(
                action="create",
                resource_type="survey",
                resource_id=survey.survey_id,
                performed_by=survey.performed_by,
                ip_address=ip_address,
            ),
        ],
    )
    await session.refresh(survey)
    return survey


async def create_survey_with_structure(
    session: AsyncSession,
    payload: SurveyCreateWithStructure,
    ip_address: str | None = None,
) -> Survey:
    if payload.status == "Active":
        if not payload.sections:
            raise AppError(
                "Active surveys must contain at least one section.",
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            )
        if any(not section.questions for section in payload.sections):
            raise AppError(
                "Every section in an active survey must contain at least one question.",
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            )

    for section_input in payload.sections:
        for question_input in section_input.questions:
            try:
                validate_question_definition(
                    question_input.question_type,
                    question_input.options,
                    question_input.config,
                )
            except ValueError as exc:
                raise AppError(
                    f"Question definition is invalid: {exc}",
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                ) from exc

    survey_data = payload.model_dump(exclude={"performed_by", "sections"})
    survey_data["survey_id"] = generate_business_id("SURV")
    survey = Survey.model_validate(survey_data)
    survey.performed_by = payload.performed_by
    session.add(survey)

    events = [
        AuditEvent(
            action="create",
            resource_type="survey",
            resource_id=survey.survey_id,
            performed_by=survey.performed_by,
            ip_address=ip_address,
        )
    ]
    for section_index, section_input in enumerate(payload.sections):
        section: SurveySection = SurveySection(
            survey_id=survey.id,
            title=section_input.title,
            description=section_input.description,
            order_index=section_index,
            performed_by=payload.performed_by,
        )
        session.add(section)
        events.append(
            AuditEvent(
                action="create",
                resource_type="survey_section",
                resource_id=str(section.id),
                performed_by=payload.performed_by,
                ip_address=ip_address,
            )
        )
        for question_index, question_input in enumerate(section_input.questions):
            question: SurveyQuestion = SurveyQuestion(
                survey_id=survey.id,
                section_id=section.id,
                question_text=question_input.question_text,
                question_type=question_input.question_type,
                options=_parse_options(question_input.options),
                config=json.dumps(question_input.config)
                if question_input.config is not None
                else None,
                order_index=question_index,
                is_required=question_input.is_required,
                performed_by=payload.performed_by,
            )
            session.add(question)
            events.append(
                AuditEvent(
                    action="create",
                    resource_type="survey_question",
                    resource_id=str(question.id),
                    performed_by=payload.performed_by,
                    ip_address=ip_address,
                )
            )

    await commit_with_audit(session, events)
    await session.refresh(survey)
    return survey


async def update_survey(
    session: AsyncSession,
    survey_id: str,
    payload: SurveyUpdate,
    ip_address: str | None = None,
) -> Survey:
    survey = await get_survey(session, survey_id)
    updates = payload.model_dump(exclude_unset=True)

    changes = {}
    for key, val in updates.items():
        if key == "performed_by":
            continue
        old_val = getattr(survey, key)
        if old_val != val:
            changes[key] = {"before": old_val, "after": val}

    apply_updates(survey, updates)
    session.add(survey)
    await commit_with_audit(
        session,
        [
            AuditEvent(
                action="update",
                resource_type="survey",
                resource_id=survey.survey_id,
                performed_by=payload.performed_by,
                changes=changes if changes else None,
                ip_address=ip_address,
            )
        ],
    )
    await session.refresh(survey)
    return survey


async def soft_delete_survey(
    session: AsyncSession,
    survey_id: str,
    payload: SurveyDelete,
    ip_address: str | None = None,
) -> Survey:
    survey = await get_survey(session, survey_id)
    survey.is_deleted = True
    survey.deleted_at = utc_now()
    survey.performed_by = payload.performed_by
    survey.updated_at = utc_now()
    session.add(survey)
    await commit_with_audit(
        session,
        [
            AuditEvent(
                action="delete",
                resource_type="survey",
                resource_id=survey.survey_id,
                performed_by=payload.performed_by,
                ip_address=ip_address,
            )
        ],
    )
    await session.refresh(survey)
    return survey


async def restore_survey(
    session: AsyncSession,
    survey_id: str,
    payload: SurveyRestore,
    ip_address: str | None = None,
) -> Survey:
    survey = await get_survey(session, survey_id, include_deleted=True)
    if not survey.is_deleted:
        raise AppError("Survey is not deleted.", status_code=status.HTTP_400_BAD_REQUEST)

    survey.is_deleted = False
    survey.deleted_at = None
    survey.performed_by = payload.performed_by
    survey.updated_at = utc_now()
    session.add(survey)
    await commit_with_audit(
        session,
        [
            AuditEvent(
                action="restore",
                resource_type="survey",
                resource_id=survey.survey_id,
                performed_by=payload.performed_by,
                ip_address=ip_address,
            )
        ],
    )
    await session.refresh(survey)
    return survey


def _parse_options(options: list[str] | None) -> str | None:
    if options is None:
        return None
    return json.dumps(options)


def _serialize_options(options_str: str | None) -> list[str] | None:
    if options_str is None:
        return None
    try:
        return json.loads(options_str)
    except (json.JSONDecodeError, TypeError):
        return None
