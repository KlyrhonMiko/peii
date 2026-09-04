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

STRUCTURE_EDIT_CONFLICT_CODE = "structure_edit_conflict"
STRUCTURE_EDIT_CONFLICT_MESSAGE = (
    "Survey structure cannot be edited because it is stale or already has responses."
)


def structure_edit_conflict_error() -> AppError:
    return AppError(
        STRUCTURE_EDIT_CONFLICT_MESSAGE,
        status_code=status.HTTP_409_CONFLICT,
        errors=[
            {
                "code": STRUCTURE_EDIT_CONFLICT_CODE,
                "message": STRUCTURE_EDIT_CONFLICT_MESSAGE,
            }
        ],
    )


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
    if params.is_template is not None:
        statement = statement.where(col(Survey.is_template) == params.is_template)

    return statement


async def list_surveys(
    session: AsyncSession,
    params: SurveyListQueryParams,
) -> tuple[list[Survey], int]:
    statement = select(Survey)
    total_statement = select(func.count()).select_from(Survey)
    statement = _apply_survey_list_filters(statement, params)

    total_statement = _apply_survey_list_filters(total_statement, params)
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


async def resolve_survey(
    session: AsyncSession,
    survey_id: UUID | str,
    *,
    include_deleted: bool = False,
    for_update: bool = False,
) -> Survey:
    if isinstance(survey_id, str):
        try:
            survey_id = UUID(survey_id)
        except ValueError:
            pass

    survey = (
        await get_survey_by_uuid(
            session,
            survey_id,
            include_deleted=include_deleted,
            for_update=for_update,
        )
        if isinstance(survey_id, UUID)
        else await get_survey(
            session, survey_id, include_deleted=include_deleted, for_update=for_update
        )
    )
    return survey


async def get_survey(
    session: AsyncSession,
    survey_id: str,
    include_deleted: bool = False,
    for_update: bool = False,
) -> Survey:
    statement = select(Survey).where(col(Survey.survey_id) == survey_id)
    if for_update:
        statement = statement.with_for_update()
    result = await session.exec(statement)
    survey = result.first()
    if not survey or (survey.is_deleted and not include_deleted):
        raise AppError("Survey not found.", status_code=status.HTTP_404_NOT_FOUND)
    return survey


def _activation_readiness_error(errors: list[dict[str, str]], status_code: int) -> AppError:
    return AppError(
        "Survey is not ready to be activated.",
        status_code=status_code,
        errors=errors,
    )


def _payload_readiness_errors(payload: SurveyCreateWithStructure) -> list[dict[str, str]]:
    if not payload.sections:
        return [
            {
                "code": "no_sections",
                "message": "Active surveys must contain at least one section.",
            }
        ]
    return [
        {
            "code": "empty_section",
            "section_id": section.client_id,
            "message": "Every section in an active survey must contain at least one question.",
        }
        for section in payload.sections
        if not section.questions
    ]


async def get_survey_readiness_errors(
    session: AsyncSession, survey_id: UUID
) -> list[dict[str, str]]:
    sections_result = await session.exec(
        select(SurveySection).where(
            col(SurveySection.survey_id) == survey_id,
            col(SurveySection.is_deleted).is_(False),
        )
    )
    sections = list(sections_result.all())
    if not sections:
        return [
            {
                "code": "no_sections",
                "message": "Active surveys must contain at least one section.",
            }
        ]

    questions_result = await session.exec(
        select(SurveyQuestion.section_id)
        .join(SurveySection, col(SurveySection.id) == SurveyQuestion.section_id)
        .where(
            col(SurveyQuestion.survey_id) == survey_id,
            col(SurveySection.survey_id) == survey_id,
            col(SurveySection.is_deleted).is_(False),
            col(SurveyQuestion.is_deleted).is_(False),
        )
    )
    section_ids_with_questions = set(questions_result.all())
    return [
        {
            "code": "empty_section",
            "section_id": str(section.id),
            "message": "Every section in an active survey must contain at least one question.",
        }
        for section in sections
        if section.id not in section_ids_with_questions
    ]


async def ensure_survey_ready_for_activation(
    session: AsyncSession, survey_id: UUID, status_code: int
) -> None:
    errors = await get_survey_readiness_errors(session, survey_id)
    if errors:
        raise _activation_readiness_error(errors, status_code)


async def get_survey_by_uuid(
    session: AsyncSession,
    survey_id: UUID,
    *,
    include_deleted: bool = False,
    for_update: bool = False,
) -> Survey:
    statement = select(Survey).where(col(Survey.id) == survey_id)
    if not include_deleted:
        statement = statement.where(col(Survey.is_deleted).is_(False))
    if for_update:
        statement = statement.with_for_update()
    result = await session.exec(statement)
    survey = result.first()
    if not survey:
        raise AppError("Survey not found.", status_code=status.HTTP_404_NOT_FOUND)
    return survey


async def get_survey_for_structure_edit(session: AsyncSession, survey_id: UUID) -> Survey:
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
        select(func.count())
        .select_from(SurveyResponse)
        .where(col(SurveyResponse.survey_id) == survey_id)
    )
    if response_count_result.one() > 0:
        raise structure_edit_conflict_error()
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
    if not sections:
        return survey, []

    questions_result = await session.exec(
        select(SurveyQuestion)
        .where(
            col(SurveyQuestion.survey_id) == survey.id,
            col(SurveyQuestion.is_deleted).is_(False),
            col(SurveyQuestion.section_id).in_([section.id for section in sections]),
        )
        .order_by(col(SurveyQuestion.order_index), col(SurveyQuestion.id))
    )
    questions_by_section: dict[UUID, list[SurveyQuestion]] = {}
    for question in questions_result.all():
        questions_by_section.setdefault(question.section_id, []).append(question)

    return survey, [
        (section, questions_by_section.get(section.id, [])) for section in sections
    ]


async def create_survey(
    session: AsyncSession,
    payload: SurveyCreate,
    actor_id: UUID,
    ip_address: str | None = None,
) -> Survey:
    if payload.status == "Active":
        raise _activation_readiness_error(
            [
                {
                    "code": "no_sections",
                    "message": "Active surveys must contain at least one section.",
                }
            ],
            status.HTTP_422_UNPROCESSABLE_CONTENT,
        )
    survey_data = payload.model_dump()
    survey_data["survey_id"] = generate_business_id("SURV")
    survey = Survey.model_validate(survey_data)
    survey.performed_by = actor_id
    session.add(survey)
    await commit_with_audit(
        session,
        [
            AuditEvent(
                action="create",
                resource_type="survey",
                resource_id=survey.survey_id,
                performed_by=actor_id,
                ip_address=ip_address,
            )
        ],
    )
    await session.refresh(survey)
    return survey


async def create_survey_with_structure(
    session: AsyncSession,
    payload: SurveyCreateWithStructure,
    actor_id: UUID,
    ip_address: str | None = None,
) -> Survey:
    if payload.status == "Active":
        readiness_errors = _payload_readiness_errors(payload)
        if readiness_errors:
            raise _activation_readiness_error(
                readiness_errors,
                status.HTTP_422_UNPROCESSABLE_CONTENT,
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

    survey_data = payload.model_dump(exclude={"sections"})
    survey_data["survey_id"] = generate_business_id("SURV")
    survey = Survey.model_validate(survey_data)
    survey.performed_by = actor_id
    session.add(survey)
    # PostgreSQL enforces the section/question survey-consistency foreign keys immediately.
    await session.flush()

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
            performed_by=actor_id,
        )
        session.add(section)
        await session.flush()
        events.append(
            AuditEvent(
                action="create",
                resource_type="survey_section",
                resource_id=str(section.id),
                performed_by=actor_id,
                ip_address=ip_address,
            )
        )
        for question_index, question_input in enumerate(section_input.questions):
            question: SurveyQuestion = SurveyQuestion(
                survey_id=survey.id,
                section_id=section.id,
                question_text=question_input.question_text,
                question_type=question_input.question_type,
                options=question_input.options,
                config=question_input.config,
                order_index=question_index,
                is_required=question_input.is_required,
                performed_by=actor_id,
            )
            session.add(question)
            events.append(
                AuditEvent(
                    action="create",
                    resource_type="survey_question",
                    resource_id=str(question.id),
                    performed_by=actor_id,
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
    actor_id: UUID,
    ip_address: str | None = None,
) -> Survey:
    survey = await get_survey(session, survey_id, for_update=True)
    updates = payload.model_dump(exclude_unset=True)
    if "retention_enabled" in updates or "retention_days" in updates:
        response_count_result = await session.exec(
            select(func.count())
            .select_from(SurveyResponse)
            .where(col(SurveyResponse.survey_id) == survey.id)
        )
        if response_count_result.one() > 0:
            raise AppError(
                "Retention policy cannot be changed after responses exist.",
                status_code=status.HTTP_409_CONFLICT,
                errors={"code": "retention_policy_immutable"},
            )
    resulting_status = updates.get("status", survey.status)
    if resulting_status == "Active":
        await ensure_survey_ready_for_activation(
            session,
            survey.id,
            status.HTTP_409_CONFLICT,
        )

    changes = {}
    for key, val in updates.items():
        old_val = getattr(survey, key)
        if old_val != val:
            changes[key] = {"before": old_val, "after": val}

    apply_updates(survey, updates)
    survey.performed_by = actor_id
    session.add(survey)
    await commit_with_audit(
        session,
        [
            AuditEvent(
                action="update",
                resource_type="survey",
                resource_id=survey.survey_id,
                performed_by=actor_id,
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
    actor_id: UUID,
    ip_address: str | None = None,
) -> Survey:
    survey = await get_survey(session, survey_id, for_update=True)
    survey.is_deleted = True
    survey.deleted_at = utc_now()
    survey.performed_by = actor_id
    survey.updated_at = utc_now()
    session.add(survey)

    await commit_with_audit(
        session,
        [
            AuditEvent(
                action="archive",
                resource_type="survey",
                resource_id=survey.survey_id,
                performed_by=actor_id,
                ip_address=ip_address,
            ),
        ],
    )
    await session.refresh(survey)
    return survey


async def restore_survey(
    session: AsyncSession,
    survey_id: str,
    payload: SurveyRestore,
    actor_id: UUID,
    ip_address: str | None = None,
) -> Survey:
    survey = await get_survey(
        session,
        survey_id,
        include_deleted=True,
        for_update=True,
    )
    if not survey.is_deleted:
        raise AppError("Survey is not deleted.", status_code=status.HTTP_400_BAD_REQUEST)
    survey.is_deleted = False
    survey.deleted_at = None
    survey.status = "Inactive"
    survey.performed_by = actor_id
    survey.updated_at = utc_now()
    session.add(survey)
    await commit_with_audit(
        session,
        [
            AuditEvent(
                action="restore",
                resource_type="survey",
                resource_id=survey.survey_id,
                performed_by=actor_id,
                ip_address=ip_address,
            )
        ],
    )
    await session.refresh(survey)
    return survey
