from uuid import UUID

from fastapi import status
from sqlalchemy import func
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from core.exceptions import AppError
from models.survey import Survey
from models.survey_question import SurveyQuestion
from models.survey_section import SurveySection
from schemas.survey_section import SurveySectionCreate, SurveySectionUpdate
from services.audit_service import AuditEvent, commit_with_audit
from services.base_service import apply_updates, utc_now
from services.distribution_service import revoke_for_structure_change
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


async def list_sections(session: AsyncSession, survey_id: UUID) -> list[SurveySection]:
    await _validate_survey_exists(session, survey_id)
    result = await session.exec(
        select(SurveySection)
        .where(
            col(SurveySection.survey_id) == survey_id,
            col(SurveySection.is_deleted).is_(False),
        )
        .order_by(col(SurveySection.order_index), col(SurveySection.id))
    )
    return list(result.all())


async def get_section(session: AsyncSession, survey_id: UUID, section_id: UUID) -> SurveySection:
    await _validate_survey_exists(session, survey_id)
    result = await session.exec(
        select(SurveySection).where(
            col(SurveySection.id) == section_id,
            col(SurveySection.survey_id) == survey_id,
            col(SurveySection.is_deleted).is_(False),
        )
    )
    section = result.first()
    if not section:
        raise AppError("Section not found.", status_code=status.HTTP_404_NOT_FOUND)
    return section


async def get_section_with_questions(
    session: AsyncSession, survey_id: UUID, section_id: UUID
) -> tuple[SurveySection, list[SurveyQuestion]]:
    section = await get_section(session, survey_id, section_id)
    questions_result = await session.exec(
        select(SurveyQuestion)
        .where(
            col(SurveyQuestion.section_id) == section_id,
            col(SurveyQuestion.survey_id) == survey_id,
            col(SurveyQuestion.is_deleted).is_(False),
        )
        .order_by(col(SurveyQuestion.order_index), col(SurveyQuestion.id))
    )
    return section, list(questions_result.all())


async def create_section(
    session: AsyncSession,
    survey_id: UUID,
    payload: SurveySectionCreate,
    actor_id: UUID,
    ip_address: str | None = None,
) -> SurveySection:
    survey = await get_survey_for_structure_edit(session, survey_id)
    max_order_result = await session.exec(
        select(func.max(SurveySection.order_index)).where(
            col(SurveySection.survey_id) == survey.id,
            col(SurveySection.is_deleted).is_(False),
        )
    )
    current_max = max_order_result.one()
    section = SurveySection(
        survey_id=survey.id,
        title=payload.title,
        description=payload.description,
        order_index=(current_max if current_max is not None else -1) + 1,
        performed_by=actor_id,
    )
    session.add(section)
    events = await revoke_for_structure_change(
        session, survey, performed_by=actor_id, ip_address=ip_address
    )
    await commit_with_audit(
        session,
        [
            AuditEvent(
                action="create",
                resource_type="survey_section",
                resource_id=str(section.id),
                performed_by=actor_id,
                ip_address=ip_address,
            ),
            *events,
        ],
    )
    await session.refresh(section)
    return section


async def update_section(
    session: AsyncSession,
    survey_id: UUID,
    section_id: UUID,
    payload: SurveySectionUpdate,
    actor_id: UUID,
    ip_address: str | None = None,
) -> SurveySection:
    survey = await get_survey_for_structure_edit(session, survey_id)
    result = await session.exec(
        select(SurveySection).where(
            col(SurveySection.id) == section_id,
            col(SurveySection.survey_id) == survey.id,
            col(SurveySection.is_deleted).is_(False),
        )
    )
    section = result.first()
    if not section:
        raise AppError("Section not found.", status_code=status.HTTP_404_NOT_FOUND)

    updates = payload.model_dump(exclude_unset=True)
    changes = {
        key: {"before": getattr(section, key), "after": value}
        for key, value in updates.items()
        if getattr(section, key) != value
    }
    if not changes:
        return section

    apply_updates(section, updates)
    section.performed_by = actor_id
    session.add(section)
    revoke_events = await revoke_for_structure_change(
        session, survey, performed_by=actor_id, ip_address=ip_address
    )
    await commit_with_audit(
        session,
        [
            AuditEvent(
                action="update",
                resource_type="survey_section",
                resource_id=str(section.id),
                performed_by=actor_id,
                changes=changes,
                ip_address=ip_address,
            ),
            *revoke_events,
        ],
    )
    await session.refresh(section)
    return section


async def delete_section(
    session: AsyncSession,
    survey_id: UUID,
    section_id: UUID,
    actor_id: UUID,
    cascade_questions: bool = False,
    ip_address: str | None = None,
) -> SurveySection:
    survey = await get_survey_for_structure_edit(session, survey_id)
    result = await session.exec(
        select(SurveySection).where(
            col(SurveySection.id) == section_id,
            col(SurveySection.survey_id) == survey.id,
            col(SurveySection.is_deleted).is_(False),
        )
    )
    section = result.first()
    if not section:
        raise AppError("Section not found.", status_code=status.HTTP_404_NOT_FOUND)

    questions_result = await session.exec(
        select(SurveyQuestion).where(
            col(SurveyQuestion.section_id) == section.id,
            col(SurveyQuestion.survey_id) == survey.id,
            col(SurveyQuestion.is_deleted).is_(False),
        )
    )
    questions = list(questions_result.all())
    if questions and not cascade_questions:
        raise AppError(
            "Section contains active questions. Confirm cascade_questions to delete it.",
            status_code=status.HTTP_409_CONFLICT,
        )

    now = utc_now()
    section.is_deleted = True
    section.deleted_at = now
    section.performed_by = actor_id
    section.updated_at = now
    session.add(section)
    events = [
        AuditEvent(
            action="delete",
            resource_type="survey_section",
            resource_id=str(section.id),
            performed_by=actor_id,
            ip_address=ip_address,
        )
    ]
    for question in questions:
        question.is_deleted = True
        question.deleted_at = now
        question.performed_by = actor_id
        question.updated_at = now
        session.add(question)
        events.append(
            AuditEvent(
                action="delete",
                resource_type="survey_question",
                resource_id=str(question.id),
                performed_by=actor_id,
                changes={"reason": "section_cascade"},
                ip_address=ip_address,
            )
        )
    events.extend(
        await revoke_for_structure_change(
            session, survey, performed_by=actor_id, ip_address=ip_address
        )
    )
    await commit_with_audit(session, events)
    await session.refresh(section)
    return section


async def reorder_sections(
    session: AsyncSession,
    survey_id: UUID,
    section_ids: list[UUID],
    actor_id: UUID,
    ip_address: str | None = None,
) -> list[SurveySection]:
    survey = await get_survey_for_structure_edit(session, survey_id)
    existing_result = await session.exec(
        select(SurveySection).where(
            col(SurveySection.survey_id) == survey.id,
            col(SurveySection.is_deleted).is_(False),
        )
    )
    sections_by_id = {section.id: section for section in existing_result.all()}
    if len(section_ids) != len(sections_by_id) or set(section_ids) != set(sections_by_id):
        raise AppError(
            "Provided section IDs do not match the survey's active sections.",
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    changes = [
        AuditEvent(
            action="reorder",
            resource_type="survey_section",
            resource_id=str(section_id),
            performed_by=actor_id,
            changes={
                "order_index": {
                    "before": sections_by_id[section_id].order_index,
                    "after": index,
                }
            },
            ip_address=ip_address,
        )
        for index, section_id in enumerate(section_ids)
        if sections_by_id[section_id].order_index != index
    ]
    if not changes:
        return sorted(sections_by_id.values(), key=lambda s: (s.order_index, s.id))

    changed_section_ids = {event.resource_id for event in changes}
    sections = [sections_by_id[section_id] for section_id in section_ids]
    temporary_base = max(section.order_index for section in sections) + len(sections) + 1
    for index, section in enumerate(sections):
        section.order_index = temporary_base + index
        session.add(section)
    await session.flush()
    for index, section in enumerate(sections):
        section.order_index = index
        if str(section.id) in changed_section_ids:
            section.performed_by = actor_id
        session.add(section)

    revoke_events = await revoke_for_structure_change(
        session, survey, performed_by=actor_id, ip_address=ip_address
    )
    await commit_with_audit(session, [*changes, *revoke_events])
    for section in sections:
        await session.refresh(section)
    return sections
