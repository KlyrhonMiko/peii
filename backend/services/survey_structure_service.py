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
from schemas.survey_structure import (
    SurveyStructureQuestion,
    SurveyStructureReplace,
    SurveyStructureSection,
)
from services.audit_service import AuditEvent, commit_with_audit
from services.base_service import utc_now
from services.question_validation import validate_question_definition
from services.survey_version_service import ensure_draft_version


def _serialize_options(options: list[str] | None) -> str | None:
    return json.dumps(options) if options is not None else None


def _serialize_config(config: dict | None) -> str | None:
    return json.dumps(config) if config is not None else None


async def replace_draft_structure(
    session: AsyncSession,
    survey: Survey,
    payload: SurveyStructureReplace,
    performed_by: UUID | None = None,
    ip_address: str | None = None,
) -> SurveyVersion:
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

    draft, version_events = await ensure_draft_version(session, survey)
    if (
        payload.expected_revision is not None
        and payload.expected_revision != draft.structure_revision
    ):
        raise AppError(
            "Survey structure has changed. Refresh the draft before saving.",
            status_code=status.HTTP_409_CONFLICT,
        )

    sections_result = await session.exec(
        select(SurveySection).where(
            col(SurveySection.survey_id) == survey.id,
            col(SurveySection.version_id) == draft.id,
            col(SurveySection.is_deleted).is_(False),
        )
    )
    existing_sections = {section.id: section for section in sections_result.all()}
    questions_result = await session.exec(
        select(SurveyQuestion).where(
            col(SurveyQuestion.survey_id) == survey.id,
            col(SurveyQuestion.version_id) == draft.id,
            col(SurveyQuestion.is_deleted).is_(False),
        )
    )
    existing_questions = {question.id: question for question in questions_result.all()}

    submitted_section_ids = {
        section.id for section in payload.sections if section.id is not None
    }
    unknown_section_ids = submitted_section_ids - set(existing_sections)
    if unknown_section_ids:
        raise AppError(
            "Structure contains a section from another survey version.",
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    submitted_question_ids = {
        question.id
        for section in payload.sections
        for question in section.questions
        if question.id is not None
    }
    unknown_question_ids = submitted_question_ids - set(existing_questions)
    if unknown_question_ids:
        raise AppError(
            "Structure contains a question from another survey version.",
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    removed_section_ids = set(existing_sections) - submitted_section_ids
    cascade_ids = set(payload.cascade_section_ids)
    if cascade_ids - removed_section_ids:
        raise AppError(
            "Only removed sections may be included in cascade_section_ids.",
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    removed_question_ids = set(existing_questions) - submitted_question_ids
    events = [*version_events]
    deleted_at = utc_now()
    for section_id in removed_section_ids:
        section = existing_sections[section_id]
        section_questions = [
            question
            for question in existing_questions.values()
            if question.section_id == section_id
        ]
        if section_questions and section_id not in cascade_ids:
            raise AppError(
                "A nonempty section requires explicit cascade confirmation.",
                status_code=status.HTTP_409_CONFLICT,
            )
        section.is_deleted = True
        section.deleted_at = deleted_at
        section.updated_at = deleted_at
        section.performed_by = performed_by
        session.add(section)
        events.append(
            AuditEvent(
                action="delete",
                resource_type="survey_section",
                resource_id=str(section.id),
                performed_by=performed_by,
                changes={"reason": "structure_replace"},
                ip_address=ip_address,
            )
        )
        for question in section_questions:
            question.is_deleted = True
            question.deleted_at = deleted_at
            question.updated_at = deleted_at
            question.performed_by = performed_by
            session.add(question)
            removed_question_ids.discard(question.id)
            events.append(
                AuditEvent(
                    action="delete",
                    resource_type="survey_question",
                    resource_id=str(question.id),
                    performed_by=performed_by,
                    changes={"reason": "section_cascade"},
                    ip_address=ip_address,
                )
            )

    for question_id in removed_question_ids:
        question = existing_questions[question_id]
        question.is_deleted = True
        question.deleted_at = deleted_at
        question.updated_at = deleted_at
        question.performed_by = performed_by
        session.add(question)
        events.append(
            AuditEvent(
                action="delete",
                resource_type="survey_question",
                resource_id=str(question.id),
                performed_by=performed_by,
                changes={"reason": "structure_replace"},
                ip_address=ip_address,
            )
        )

    canonical_sections: list[tuple[SurveySection, SurveyStructureSection]] = []
    for index, section_input in enumerate(payload.sections):
        if section_input.id is None:
            section = SurveySection(
                survey_id=survey.id,
                version_id=draft.id,
                title=section_input.title,
                description=section_input.description,
                order_index=index,
                performed_by=performed_by,
            )
            session.add(section)
            events.append(
                AuditEvent(
                    action="create",
                    resource_type="survey_section",
                    resource_id=str(section.id),
                    performed_by=performed_by,
                    ip_address=ip_address,
                )
            )
        else:
            section = existing_sections[section_input.id]
            section.title = section_input.title
            section.description = section_input.description
            section.order_index = index
            section.updated_at = utc_now()
            section.performed_by = performed_by
            session.add(section)
        canonical_sections.append((section, section_input))

    await session.flush()
    canonical_questions: list[tuple[SurveyQuestion, SurveyStructureQuestion]] = []
    for section, section_input in canonical_sections:
        for index, question_input in enumerate(section_input.questions):
            if question_input.id is None:
                question = SurveyQuestion(
                    survey_id=survey.id,
                    version_id=draft.id,
                    section_id=section.id,
                    question_text=question_input.question_text,
                    question_type=question_input.question_type,
                    options=_serialize_options(question_input.options),
                    config=_serialize_config(question_input.config),
                    order_index=index,
                    is_required=question_input.is_required,
                    performed_by=performed_by,
                )
                session.add(question)
                events.append(
                    AuditEvent(
                        action="create",
                        resource_type="survey_question",
                        resource_id=str(question.id),
                        performed_by=performed_by,
                        ip_address=ip_address,
                    )
                )
            else:
                question = existing_questions[question_input.id]
                question.section_id = section.id
                question.question_text = question_input.question_text
                question.question_type = question_input.question_type
                question.options = _serialize_options(question_input.options)
                question.config = _serialize_config(question_input.config)
                question.order_index = index
                question.is_required = question_input.is_required
                question.updated_at = utc_now()
                question.performed_by = performed_by
                session.add(question)
            canonical_questions.append((question, question_input))

    # Temporarily move active rows outside their final ranges before applying the
    # requested permutation and cross-section moves.
    all_active_sections = list(existing_sections.values()) + [
        section for section, _ in canonical_sections if section.id not in existing_sections
    ]
    temporary_base = max(
        [section.order_index for section in all_active_sections] or [0]
    ) + len(all_active_sections) + 1
    for index, section in enumerate(all_active_sections):
        if not section.is_deleted:
            section.order_index = temporary_base + index
            session.add(section)

    all_active_questions = list(existing_questions.values()) + [
        question for question, _ in canonical_questions if question.id not in existing_questions
    ]
    question_base = max(
        [question.order_index for question in all_active_questions] or [0]
    ) + len(all_active_questions) + 1
    for index, question in enumerate(all_active_questions):
        if not question.is_deleted:
            question.order_index = question_base + index
            session.add(question)
    await session.flush()

    for index, (section, _) in enumerate(canonical_sections):
        section.order_index = index
        session.add(section)
    for section, section_input in canonical_sections:
        for index, question_input in enumerate(section_input.questions):
            question = next(
                question
                for question, candidate in canonical_questions
                if candidate is question_input
            )
            question.section_id = section.id
            question.order_index = index
            session.add(question)

    previous_revision = draft.structure_revision
    draft.structure_revision += 1
    draft.updated_at = utc_now()
    draft.performed_by = performed_by
    session.add(draft)
    events.append(
        AuditEvent(
            action="update",
            resource_type="survey_version",
            resource_id=str(draft.id),
            performed_by=performed_by,
            changes={
                "structure_revision": {
                    "before": previous_revision,
                    "after": draft.structure_revision,
                }
            },
            ip_address=ip_address,
        )
    )
    await commit_with_audit(session, events)
    await session.refresh(draft)
    return draft
