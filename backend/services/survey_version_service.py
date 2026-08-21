import json
from uuid import UUID

from fastapi import status
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from core.exceptions import AppError
from models.survey import Survey
from models.survey_question import SurveyQuestion
from models.survey_section import SurveySection
from models.survey_version import SurveyVersion
from services.audit_service import AuditEvent, commit_with_audit  # noqa: F401
from services.base_service import utc_now
from services.question_validation import validate_question_definition
from utils.identifiers import generate_business_id


async def get_version_for_read(
    session: AsyncSession, survey_id: UUID
) -> SurveyVersion:
    result = await session.exec(
        select(SurveyVersion)
        .where(
            col(SurveyVersion.survey_id) == survey_id,
            col(SurveyVersion.is_deleted).is_(False),
            col(SurveyVersion.status) == "draft",
        )
        .order_by(col(SurveyVersion.version_number).desc())
    )
    draft = result.first()
    if draft:
        return draft

    result = await session.exec(
        select(SurveyVersion)
        .where(
            col(SurveyVersion.survey_id) == survey_id,
            col(SurveyVersion.is_deleted).is_(False),
            col(SurveyVersion.status) == "published",
        )
        .order_by(col(SurveyVersion.version_number).desc())
    )
    version = result.first()
    if version:
        return version

    raise AppError(
        "Survey structure version not found.",
        status_code=status.HTTP_404_NOT_FOUND,
    )


async def create_initial_version(
    session: AsyncSession,
    survey: Survey,
) -> tuple[SurveyVersion, AuditEvent]:
    version = SurveyVersion(
        survey_id=survey.id,
        version_id=generate_business_id("VER"),
        version_number=1,
        status="draft",
        performed_by=survey.performed_by,
    )
    session.add(version)
    return version, AuditEvent(
        action="create",
        resource_type="survey_version",
        resource_id=str(version.id),
        performed_by=survey.performed_by,
    )


async def ensure_draft_version(
    session: AsyncSession,
    survey: Survey,
) -> tuple[SurveyVersion, list[AuditEvent]]:
    result = await session.exec(
        select(SurveyVersion)
        .where(
            col(SurveyVersion.survey_id) == survey.id,
            col(SurveyVersion.status) == "draft",
            col(SurveyVersion.is_deleted).is_(False),
        )
        .order_by(col(SurveyVersion.version_number).desc())
        .with_for_update()
    )
    draft = result.first()
    if draft:
        return draft, []

    survey_lock_result = await session.exec(
        select(Survey.id).where(col(Survey.id) == survey.id).with_for_update()
    )
    if survey_lock_result.first() is None:
        raise AppError("Survey not found.", status_code=status.HTTP_404_NOT_FOUND)

    result = await session.exec(
        select(SurveyVersion)
        .where(
            col(SurveyVersion.survey_id) == survey.id,
            col(SurveyVersion.status) == "draft",
            col(SurveyVersion.is_deleted).is_(False),
        )
        .order_by(col(SurveyVersion.version_number).desc())
        .with_for_update()
    )
    draft = result.first()
    if draft:
        return draft, []

    latest_result = await session.exec(
        select(SurveyVersion)
        .where(
            col(SurveyVersion.survey_id) == survey.id,
            col(SurveyVersion.is_deleted).is_(False),
        )
        .order_by(col(SurveyVersion.version_number).desc())
    )
    latest = latest_result.first()
    next_number = (latest.version_number + 1) if latest else 1
    draft = SurveyVersion(
        survey_id=survey.id,
        version_id=generate_business_id("VER"),
        version_number=next_number,
        status="draft",
        performed_by=survey.performed_by,
    )
    session.add(draft)
    await session.flush()

    events = [
        AuditEvent(
            action="create",
            resource_type="survey_version",
            resource_id=str(draft.id),
            performed_by=survey.performed_by,
            changes={"source_version_id": str(latest.id)} if latest else None,
        )
    ]
    if latest is None:
        return draft, events

    sections_result = await session.exec(
        select(SurveySection).where(
            col(SurveySection.version_id) == latest.id,
            col(SurveySection.survey_id) == survey.id,
            col(SurveySection.is_deleted).is_(False),
        )
    )
    sections = list(sections_result.all())
    section_map: dict[UUID, SurveySection] = {}
    for section_source in sections:
        section_clone = SurveySection(
            survey_id=survey.id,
            version_id=draft.id,
            title=section_source.title,
            description=section_source.description,
            order_index=section_source.order_index,
            performed_by=survey.performed_by,
        )
        session.add(section_clone)
        section_map[section_source.id] = section_clone
        events.append(
            AuditEvent(
                action="create",
                resource_type="survey_section",
                resource_id=str(section_clone.id),
                performed_by=survey.performed_by,
                changes={
                    "reason": "version_clone",
                    "source_id": str(section_source.id),
                },
            )
        )
    await session.flush()

    questions_result = await session.exec(
        select(SurveyQuestion).where(
            col(SurveyQuestion.version_id) == latest.id,
            col(SurveyQuestion.survey_id) == survey.id,
            col(SurveyQuestion.is_deleted).is_(False),
        )
    )
    for question_source in questions_result.all():
        target_section = section_map.get(question_source.section_id)
        if target_section is None:
            continue
        question_clone = SurveyQuestion(
            survey_id=survey.id,
            version_id=draft.id,
            section_id=target_section.id,
            question_text=question_source.question_text,
            question_type=question_source.question_type,
            options=question_source.options,
            config=question_source.config,
            order_index=question_source.order_index,
            is_required=question_source.is_required,
            performed_by=survey.performed_by,
        )
        session.add(question_clone)
        events.append(
            AuditEvent(
                action="create",
                resource_type="survey_question",
                resource_id=str(question_clone.id),
                performed_by=survey.performed_by,
                changes={
                    "reason": "version_clone",
                    "source_id": str(question_source.id),
                },
            )
        )

    await session.flush()
    return draft, events


async def publish_draft(
    session: AsyncSession,
    survey: Survey,
    draft: SurveyVersion,
) -> list[AuditEvent]:
    if draft.status != "draft":
        raise AppError(
            "Only a draft survey version can be published.",
            status_code=status.HTTP_409_CONFLICT,
        )

    sections_result = await session.exec(
        select(SurveySection).where(
            col(SurveySection.version_id) == draft.id,
            col(SurveySection.survey_id) == survey.id,
            col(SurveySection.is_deleted).is_(False),
        )
    )
    sections = list(sections_result.all())
    if not sections:
        raise AppError(
            "A survey must contain at least one section before publishing.",
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        )

    for section in sections:
        questions_result = await session.exec(
            select(SurveyQuestion).where(
                col(SurveyQuestion.section_id) == section.id,
                col(SurveyQuestion.version_id) == draft.id,
                col(SurveyQuestion.is_deleted).is_(False),
            )
        )
        questions = list(questions_result.all())
        if not questions:
            raise AppError(
                "Every section must contain at least one question before publishing.",
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            )
        for question in questions:
            try:
                options = json.loads(question.options) if question.options else None
                config = json.loads(question.config) if question.config else None
                validate_question_definition(question.question_type, options, config)
            except (TypeError, ValueError, json.JSONDecodeError) as exc:
                raise AppError(
                    f"Question {question.id} is not publishable: {exc}",
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                ) from exc

    previous_result = await session.exec(
        select(SurveyVersion).where(
            col(SurveyVersion.survey_id) == survey.id,
            col(SurveyVersion.status) == "published",
            col(SurveyVersion.is_deleted).is_(False),
        )
    )
    events: list[AuditEvent] = []
    for previous in previous_result.all():
        previous.status = "superseded"
        previous.updated_at = utc_now()
        session.add(previous)
        events.append(
            AuditEvent(
                action="supersede",
                resource_type="survey_version",
                resource_id=str(previous.id),
                performed_by=survey.performed_by,
            )
        )

    draft.status = "published"
    draft.published_at = utc_now()
    draft.structure_revision += 1
    draft.updated_at = utc_now()
    session.add(draft)
    events.append(
        AuditEvent(
            action="publish",
            resource_type="survey_version",
            resource_id=str(draft.id),
            performed_by=survey.performed_by,
            changes={"status": {"before": "draft", "after": "published"}},
        )
    )
    return events


async def ensure_editable_draft(
    session: AsyncSession,
    survey: Survey,
    ip_address: str | None = None,
) -> SurveyVersion:
    draft, events = await ensure_draft_version(session, survey)
    if events:
        await commit_with_audit(session, events)
        await session.refresh(draft)
    return draft


async def publish_current_draft(
    session: AsyncSession,
    survey: Survey,
    ip_address: str | None = None,
) -> SurveyVersion:
    draft, clone_events = await ensure_draft_version(session, survey)
    publish_events = await publish_draft(session, survey, draft)
    await commit_with_audit(session, [*clone_events, *publish_events])
    await session.refresh(draft)
    return draft
