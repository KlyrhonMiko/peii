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
from services.audit_service import record_audit
from services.base_service import apply_updates, utc_now


async def _validate_survey_exists(session: AsyncSession, survey_id: UUID) -> Survey:
    result = await session.exec(
        select(Survey).where(col(Survey.id) == survey_id, col(Survey.is_deleted).is_(False))
    )
    survey = result.first()
    if not survey:
        raise AppError("Survey not found.", status_code=status.HTTP_404_NOT_FOUND)
    return survey


async def list_sections(
    session: AsyncSession, survey_id: UUID
) -> list[SurveySection]:
    await _validate_survey_exists(session, survey_id)
    result = await session.exec(
        select(SurveySection)
        .where(
            col(SurveySection.survey_id) == survey_id,
            col(SurveySection.is_deleted).is_(False),
        )
        .order_by(col(SurveySection.order_index))
    )
    return list(result.all())


async def get_section(
    session: AsyncSession, survey_id: UUID, section_id: UUID
) -> SurveySection:
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
            col(SurveyQuestion.is_deleted).is_(False),
        )
        .order_by(col(SurveyQuestion.order_index))
    )
    questions = list(questions_result.all())
    return section, questions


async def create_section(
    session: AsyncSession,
    survey_id: UUID,
    payload: SurveySectionCreate,
    ip_address: str | None = None,
) -> SurveySection:
    await _validate_survey_exists(session, survey_id)

    max_order_result = await session.exec(
        select(func.count()).select_from(SurveySection).where(
            col(SurveySection.survey_id) == survey_id,
            col(SurveySection.is_deleted).is_(False),
        )
    )
    next_order = max_order_result.one()

    section = SurveySection(
        survey_id=survey_id,
        title=payload.title,
        description=payload.description,
        order_index=next_order,
        performed_by=payload.performed_by,
    )
    session.add(section)
    await session.commit()
    await session.refresh(section)
    await record_audit(
        session,
        action="create",
        resource_type="survey_section",
        resource_id=str(section.id),
        performed_by=payload.performed_by,
        ip_address=ip_address,
    )
    return section


async def update_section(
    session: AsyncSession,
    survey_id: UUID,
    section_id: UUID,
    payload: SurveySectionUpdate,
    ip_address: str | None = None,
) -> SurveySection:
    section = await get_section(session, survey_id, section_id)

    updates = payload.model_dump(exclude_unset=True)

    changes = {}
    for key, val in updates.items():
        if key == "performed_by":
            continue
        old_val = getattr(section, key)
        if old_val != val:
            changes[key] = val

    apply_updates(section, updates)
    session.add(section)
    await session.commit()
    await session.refresh(section)
    await record_audit(
        session,
        action="update",
        resource_type="survey_section",
        resource_id=str(section.id),
        performed_by=payload.performed_by,
        changes=changes if changes else None,
        ip_address=ip_address,
    )
    return section


async def delete_section(
    session: AsyncSession,
    survey_id: UUID,
    section_id: UUID,
    performed_by: UUID | None = None,
    ip_address: str | None = None,
) -> SurveySection:
    section = await get_section(session, survey_id, section_id)

    section.is_deleted = True
    section.deleted_at = utc_now()
    section.performed_by = performed_by
    section.updated_at = utc_now()
    session.add(section)
    await session.commit()
    await session.refresh(section)
    await record_audit(
        session,
        action="delete",
        resource_type="survey_section",
        resource_id=str(section.id),
        performed_by=performed_by,
        ip_address=ip_address,
    )
    return section


async def reorder_sections(
    session: AsyncSession,
    survey_id: UUID,
    section_ids: list[UUID],
    performed_by: UUID | None = None,
    ip_address: str | None = None,
) -> list[SurveySection]:
    await _validate_survey_exists(session, survey_id)

    existing_result = await session.exec(
        select(SurveySection.id).where(
            col(SurveySection.survey_id) == survey_id,
            col(SurveySection.is_deleted).is_(False),
        )
    )
    existing_ids = set(existing_result.all())

    if set(section_ids) != existing_ids:
        raise AppError(
            "Provided section IDs do not match the survey's active sections.",
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    sections = []
    for idx, sid in enumerate(section_ids):
        result = await session.exec(
            select(SurveySection).where(
                col(SurveySection.id) == sid,
                col(SurveySection.survey_id) == survey_id,
            )
        )
        section = result.first()
        if section:
            section.order_index = idx
            session.add(section)
            sections.append(section)

    await session.commit()
    for s in sections:
        await session.refresh(s)

    sections.sort(key=lambda s: s.order_index)
    await record_audit(
        session,
        action="update",
        resource_type="survey_section",
        resource_id="reorder",
        performed_by=performed_by,
        changes={"reordered": True},
        ip_address=ip_address,
    )
    return sections
