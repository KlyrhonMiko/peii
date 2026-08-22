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
        questions_to_delete = [
            question
            for question in section_questions
            if question.id not in submitted_question_ids
        ]
        if questions_to_delete and section_id not in cascade_ids:
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
        for question in questions_to_delete:
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

    active_existing_sections = [
        section for section in existing_sections.values() if not section.is_deleted
    ]
    new_section_count = sum(section.id is None for section in payload.sections)
    section_temporary_base = (
        max([section.order_index for section in active_existing_sections] or [0])
        + len(active_existing_sections)
        + new_section_count
        + 1
    )
    canonical_sections: list[tuple[SurveySection, SurveyStructureSection]] = []
    new_section_offset = 0
    for index, section_input in enumerate(payload.sections):
        if section_input.id is None:
            section = SurveySection(
                survey_id=survey.id,
                version_id=draft.id,
                title=section_input.title,
                description=section_input.description,
                order_index=section_temporary_base
                + len(active_existing_sections)
                + new_section_offset,
                performed_by=performed_by,
            )
            new_section_offset += 1
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
            section_changes: dict[str, dict[str, object]] = {}
            if section.title != section_input.title:
                section_changes["title"] = {
                    "before": section.title,
                    "after": section_input.title,
                }
            if section.description != section_input.description:
                section_changes["description"] = {
                    "before": section.description,
                    "after": section_input.description,
                }
            if section.order_index != index:
                section_changes["order_index"] = {
                    "before": section.order_index,
                    "after": index,
                }
            section.title = section_input.title
            section.description = section_input.description
            section.updated_at = utc_now()
            section.performed_by = performed_by
            session.add(section)
            if section_changes:
                event_action = (
                    "reorder"
                    if set(section_changes) == {"order_index"}
                    else "update"
                )
                events.append(
                    AuditEvent(
                        action=event_action,
                        resource_type="survey_section",
                        resource_id=str(section.id),
                        performed_by=performed_by,
                        changes=section_changes,
                        ip_address=ip_address,
                    )
                )
        canonical_sections.append((section, section_input))

    await session.flush()

    for index, (section, _) in enumerate(canonical_sections):
        section.order_index = section_temporary_base + index
        session.add(section)
    await session.flush()

    active_existing_questions = [
        question
        for question in existing_questions.values()
        if not question.is_deleted and question.id not in removed_question_ids
    ]
    new_question_count = sum(
        question.id is None
        for section_input in payload.sections
        for question in section_input.questions
    )
    question_temporary_base = (
        max([question.order_index for question in active_existing_questions] or [0])
        + len(active_existing_questions)
        + new_question_count
        + 1
    )
    for index, question in enumerate(active_existing_questions):
        question.order_index = question_temporary_base + index
        session.add(question)
    await session.flush()

    canonical_questions: list[tuple[SurveyQuestion, SurveyStructureQuestion]] = []
    new_question_offset = 0
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
                    order_index=question_temporary_base
                    + len(active_existing_questions)
                    + new_question_offset,
                    is_required=question_input.is_required,
                    performed_by=performed_by,
                )
                new_question_offset += 1
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
                question_changes: dict[str, dict[str, object]] = {}
                if question.section_id != section.id:
                    question_changes["section_id"] = {
                        "before": question.section_id,
                        "after": section.id,
                    }
                if question.order_index != index:
                    question_changes["order_index"] = {
                        "before": question.order_index,
                        "after": index,
                    }
                if question.question_text != question_input.question_text:
                    question_changes["question_text"] = {
                        "before": question.question_text,
                        "after": question_input.question_text,
                    }
                if question.question_type != question_input.question_type:
                    question_changes["question_type"] = {
                        "before": question.question_type,
                        "after": question_input.question_type,
                    }
                serialized_options = _serialize_options(question_input.options)
                serialized_config = _serialize_config(question_input.config)
                if question.options != serialized_options:
                    question_changes["options"] = {
                        "before": question.options,
                        "after": serialized_options,
                    }
                if question.config != serialized_config:
                    question_changes["config"] = {
                        "before": question.config,
                        "after": serialized_config,
                    }
                if question.is_required != question_input.is_required:
                    question_changes["is_required"] = {
                        "before": question.is_required,
                        "after": question_input.is_required,
                    }
                question.section_id = section.id
                question.question_text = question_input.question_text
                question.question_type = question_input.question_type
                question.options = serialized_options
                question.config = serialized_config
                question.is_required = question_input.is_required
                question.is_deleted = False
                question.deleted_at = None
                question.updated_at = utc_now()
                question.performed_by = performed_by
                session.add(question)
                if question_changes:
                    event_action = (
                        "move"
                        if "section_id" in question_changes
                        else "reorder"
                        if set(question_changes) == {"order_index"}
                        else "update"
                    )
                    events.append(
                        AuditEvent(
                            action=event_action,
                            resource_type="survey_question",
                            resource_id=str(question.id),
                            performed_by=performed_by,
                            changes=question_changes,
                            ip_address=ip_address,
                        )
                    )
            canonical_questions.append((question, question_input))

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
