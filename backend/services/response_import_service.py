"""Survey-scoped CSV imports for historical response data.

The import contract deliberately differs from the public response-submission
flow. Historical rows do not carry Google identity or consent evidence, and
blank question cells are allowed because older exports may predate questions
that are now required. Every non-blank value is still normalized and checked
against the current survey question definition before any row is persisted.
"""

from __future__ import annotations

import csv
import io
import json
import math
import re
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import status
from sqlalchemy import func
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from core.analytics_cache import ainvalidate_survey_analytics
from core.cache import cache_invalidate_prefix
from core.exceptions import AppError
from models.question_type import QuestionType
from models.survey import Survey
from models.survey_question import SurveyQuestion
from models.survey_response import SurveyResponse
from models.survey_section import SurveySection
from schemas.survey_response import (
    SurveyResponseImportError,
    SurveyResponseImportResult,
    SurveyResponseImportValidation,
)
from services.audit_service import AuditEvent, commit_with_audit
from services.base_service import utc_now
from services.response_service import (
    _question_is_visible,
    _question_key_to_id,
    _validate_answer,
)
from services.survey_service import resolve_survey

MAX_IMPORT_BYTES = 2 * 1024 * 1024
MAX_IMPORT_ROWS = 1000
MAX_IMPORT_ERRORS = 100
IMPORT_TEMPLATE_FILENAME = "survey-response-import-template.csv"
_INTEGER_PATTERN = re.compile(r"^[+-]?\d+$")


@dataclass(frozen=True, slots=True)
class _ImportRow:
    row_number: int
    submitted_at: datetime
    answers: dict[str, object]


@dataclass(slots=True)
class _ParsedImport:
    row_count: int
    rows: list[_ImportRow]
    errors: list[SurveyResponseImportError]


def _append_error(
    errors: list[SurveyResponseImportError],
    *,
    row: int | None,
    column: str | None,
    code: str,
    message: str,
) -> None:
    if len(errors) >= MAX_IMPORT_ERRORS:
        return
    errors.append(
        SurveyResponseImportError(
            row=row,
            column=column,
            code=code,
            message=message,
        )
    )


def _question_header(index: int, question: SurveyQuestion, section_title: str) -> str:
    section = " ".join(section_title.split())
    text = " ".join(question.question_text.split())
    return f"Q{index:03d} | {section} | {text}"


def _headers_for_questions(questions: list[tuple[SurveyQuestion, str]]) -> list[str]:
    return ["submitted_at"] + [
        _question_header(index, question, section_title)
        for index, (question, section_title) in enumerate(questions, 1)
    ]


def _csv_template(headers: list[str]) -> bytes:
    output = io.StringIO(newline="")
    writer = csv.writer(output, lineterminator="\r\n")
    writer.writerow(headers)
    return b"\xef\xbb\xbf" + output.getvalue().encode("utf-8")


def _decode_csv(raw: bytes) -> str:
    if len(raw) > MAX_IMPORT_BYTES:
        raise AppError(
            "Import CSV exceeds the 2 MiB limit.",
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
        )
    try:
        # utf-8-sig accepts the generated template and also permits clients to
        # omit the BOM when producing a UTF-8 CSV themselves.
        return raw.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise ValueError("CSV must be UTF-8 encoded") from exc


def _parse_submitted_at(
    value: str,
    *,
    survey: Survey,
    now: datetime,
) -> datetime:
    normalized = value.strip()
    if not normalized:
        raise ValueError("submitted_at is required")
    try:
        # datetime.fromisoformat supports the ISO-8601 ``Z`` suffix on the
        # supported Python versions; normalize it explicitly for portability.
        parsed = datetime.fromisoformat(normalized.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError("submitted_at must be an ISO-8601 timestamp") from exc
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ValueError("submitted_at must include a timezone offset")
    submitted_at = parsed.astimezone(UTC).replace(tzinfo=None)
    if submitted_at > now:
        raise ValueError("submitted_at cannot be in the future")
    if survey.retention_enabled and (
        submitted_at + timedelta(days=survey.retention_days) <= now
    ):
        raise ValueError("submitted_at is outside the survey retention period")
    return submitted_at


def _parse_number(value: str) -> int | float:
    normalized = value.strip()
    if _INTEGER_PATTERN.fullmatch(normalized):
        return int(normalized)
    try:
        parsed = float(normalized)
    except ValueError as exc:
        raise ValueError("must be a number") from exc
    if not math.isfinite(parsed):
        raise ValueError("must be a finite number")
    return parsed


def _parse_cell(question: SurveyQuestion, value: str) -> object:
    normalized = value.strip()
    question_type = QuestionType(question.question_type)
    if question_type in {
        QuestionType.SINGLE_CHOICE,
        QuestionType.TEXT,
        QuestionType.DATETIME,
    }:
        return normalized
    if question_type in {QuestionType.NUMBER, QuestionType.SCALE}:
        return _parse_number(normalized)
    if question_type == QuestionType.BOOLEAN:
        lowered = normalized.casefold()
        if lowered == "true":
            return True
        if lowered == "false":
            return False
        raise ValueError("must be true or false")
    if question_type in {QuestionType.MULTIPLE_CHOICE, QuestionType.RANKING}:
        try:
            parsed = json.loads(normalized)
        except json.JSONDecodeError as exc:
            raise ValueError("must be a JSON array") from exc
        if not isinstance(parsed, list):
            raise ValueError("must be a JSON array")
        return parsed
    if question_type == QuestionType.MATRIX:
        try:
            parsed = json.loads(normalized)
        except json.JSONDecodeError as exc:
            raise ValueError("must be a JSON object") from exc
        if not isinstance(parsed, dict):
            raise ValueError("must be a JSON object")
        return parsed
    if question_type == QuestionType.FILE:
        raise ValueError("file questions cannot be imported")
    raise ValueError("question type is not supported for import")


def _parse_rows(
    raw: bytes,
    *,
    survey: Survey,
    questions: list[tuple[SurveyQuestion, str]],
    now: datetime,
) -> _ParsedImport:
    errors: list[SurveyResponseImportError] = []
    try:
        text = _decode_csv(raw)
    except AppError:
        raise
    except ValueError as exc:
        _append_error(
            errors,
            row=None,
            column=None,
            code="invalid_encoding",
            message=str(exc),
        )
        return _ParsedImport(row_count=0, rows=[], errors=errors)

    try:
        reader = csv.reader(io.StringIO(text, newline=""), strict=True)
        records = list(reader)
    except (csv.Error, UnicodeError):
        _append_error(
            errors,
            row=None,
            column=None,
            code="invalid_csv",
            message="CSV could not be parsed.",
        )
        return _ParsedImport(row_count=0, rows=[], errors=errors)

    expected_headers = _headers_for_questions(questions)
    if not records:
        _append_error(
            errors,
            row=1,
            column=None,
            code="missing_header",
            message="CSV must include the survey import header.",
        )
        return _ParsedImport(row_count=0, rows=[], errors=errors)

    headers = records[0]
    if len(headers) != len(set(headers)):
        _append_error(
            errors,
            row=1,
            column=None,
            code="duplicate_header",
            message="CSV headers must be unique.",
        )
    if headers != expected_headers:
        _append_error(
            errors,
            row=1,
            column=None,
            code="invalid_header",
            message="CSV headers must exactly match this survey's import template and order.",
        )
        # The exact ordered header is the contract for this survey's current
        # structure. Never guess a mapping from matching question text alone.
        return _ParsedImport(row_count=max(0, len(records) - 1), rows=[], errors=errors)

    data_records = records[1:]
    row_count = len(data_records)
    if row_count == 0:
        _append_error(
            errors,
            row=2,
            column=None,
            code="no_rows",
            message="CSV must contain at least one response row.",
        )
        return _ParsedImport(row_count=0, rows=[], errors=errors)
    if row_count > MAX_IMPORT_ROWS:
        _append_error(
            errors,
            row=MAX_IMPORT_ROWS + 2,
            column=None,
            code="too_many_rows",
            message=f"CSV cannot contain more than {MAX_IMPORT_ROWS} response rows.",
        )

    question_by_column = {
        index: question for index, (question, _) in enumerate(questions, 1)
    }
    question_by_id = {str(question.id): question for question, _ in questions}
    question_header_by_id = {
        str(question.id): _question_header(index, question, section_title)
        for index, (question, section_title) in enumerate(questions, 1)
    }
    question_key_to_id = _question_key_to_id(question_by_id)
    parsed_rows: list[_ImportRow] = []
    for row_offset, record in enumerate(data_records, 2):
        if row_offset > MAX_IMPORT_ROWS + 1:
            # The row-count error above is sufficient; keep validation bounded
            # even when a large but still request-size-compliant CSV is sent.
            continue
        if len(record) != len(expected_headers):
            _append_error(
                errors,
                row=row_offset,
                column=None,
                code="ragged_row",
                message="Each response row must have the same columns as the header.",
            )
            continue

        submitted_at: datetime | None = None
        row_is_valid = True
        try:
            submitted_at = _parse_submitted_at(record[0], survey=survey, now=now)
        except ValueError as exc:
            row_is_valid = False
            _append_error(
                errors,
                row=row_offset,
                column="submitted_at",
                code="invalid_submitted_at",
                message=str(exc),
            )

        answers: dict[str, object] = {}
        for column_index, value in enumerate(record[1:], 1):
            if not value.strip():
                continue
            question = question_by_column[column_index]
            column = expected_headers[column_index]
            question_id = str(question.id)
            try:
                answers[question_id] = _parse_cell(question, value)
            except (TypeError, ValueError) as exc:
                row_is_valid = False
                _append_error(
                    errors,
                    row=row_offset,
                    column=column,
                    code="invalid_answer",
                    message=str(exc),
                )

        if not answers:
            row_is_valid = False
            _append_error(
                errors,
                row=row_offset,
                column=None,
                code="no_answers",
                message="Each response row must contain at least one non-blank answer.",
            )

        for question_id, answer in answers.items():
            question = question_by_id[question_id]
            column = question_header_by_id[question_id]
            if not _question_is_visible(question, answers, question_key_to_id):
                row_is_valid = False
                _append_error(
                    errors,
                    row=row_offset,
                    column=column,
                    code="hidden_question",
                    message="Question is not visible for the selected answers.",
                )
                continue
            try:
                _validate_answer(
                    question,
                    answer,
                    answers=answers,
                    question_key_to_id=question_key_to_id,
                )
            except (TypeError, ValueError, json.JSONDecodeError) as exc:
                row_is_valid = False
                _append_error(
                    errors,
                    row=row_offset,
                    column=column,
                    code="invalid_answer",
                    message=str(exc),
                )

        if submitted_at is not None and row_is_valid:
            parsed_rows.append(
                _ImportRow(
                    row_number=row_offset,
                    submitted_at=submitted_at,
                    answers=answers,
                )
            )

    return _ParsedImport(
        row_count=row_count,
        rows=parsed_rows,
        errors=errors,
    )


async def _load_ordered_questions(
    session: AsyncSession,
    survey_id: UUID,
) -> list[tuple[SurveyQuestion, str]]:
    result = await session.exec(
        select(SurveyQuestion, SurveySection.title)
        .join(SurveySection, col(SurveySection.id) == SurveyQuestion.section_id)
        .where(
            col(SurveyQuestion.survey_id) == survey_id,
            col(SurveySection.survey_id) == survey_id,
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
    return [(question, section_title) for question, section_title in result.all()]


async def _resolve_import_survey(
    session: AsyncSession,
    survey_id: UUID,
    *,
    for_update: bool = False,
) -> Survey:
    survey = await resolve_survey(session, survey_id, for_update=for_update)
    if survey.is_template:
        raise AppError(
            "Response imports are not available for questionnaire templates.",
            status_code=status.HTTP_409_CONFLICT,
        )
    return survey


def _require_questions(questions: list[tuple[SurveyQuestion, str]]) -> None:
    if not questions:
        raise AppError(
            "Survey has no active questions available for response import.",
            status_code=status.HTTP_409_CONFLICT,
        )


def _validation_result(
    survey_id: UUID,
    parsed: _ParsedImport,
) -> SurveyResponseImportValidation:
    return SurveyResponseImportValidation(
        survey_id=survey_id,
        valid=not parsed.errors and bool(parsed.rows),
        row_count=parsed.row_count,
        error_count=len(parsed.errors),
        errors=parsed.errors,
    )


async def get_import_template(
    session: AsyncSession,
    survey_id: UUID,
) -> bytes:
    """Return the exact wide CSV header for one survey's active questions."""
    survey = await _resolve_import_survey(session, survey_id)
    questions = await _load_ordered_questions(session, survey.id)
    _require_questions(questions)
    return _csv_template(_headers_for_questions(questions))


async def validate_response_import(
    session: AsyncSession,
    survey_id: UUID,
    raw: bytes,
) -> SurveyResponseImportValidation:
    """Validate a CSV without mutating the selected survey or its responses."""
    survey = await _resolve_import_survey(session, survey_id)
    questions = await _load_ordered_questions(session, survey.id)
    _require_questions(questions)
    parsed = _parse_rows(raw, survey=survey, questions=questions, now=utc_now())
    return _validation_result(survey.id, parsed)


async def import_response_csv(
    session: AsyncSession,
    survey_id: UUID,
    raw: bytes,
    *,
    actor_id: UUID,
    ip_address: str | None = None,
) -> SurveyResponseImportResult:
    """Validate and append every row in one audited transaction."""
    survey = await _resolve_import_survey(session, survey_id, for_update=True)
    questions = await _load_ordered_questions(session, survey.id)
    _require_questions(questions)
    parsed = _parse_rows(raw, survey=survey, questions=questions, now=utc_now())
    if parsed.errors or not parsed.rows:
        raise AppError(
            "Import CSV validation failed.",
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            errors=[issue.model_dump(mode="json") for issue in parsed.errors],
        )

    responses = [
        SurveyResponse(
            survey_id=survey.id,
            created_at=row.submitted_at,
            updated_at=row.submitted_at,
            retention_expires_at=(
                row.submitted_at + timedelta(days=survey.retention_days)
                if survey.retention_enabled
                else None
            ),
            answers=row.answers,
            performed_by=actor_id,
        )
        for row in parsed.rows
    ]

    try:
        session.add_all(responses)
        await session.flush()
        live_count_result = await session.exec(
            select(func.count())
            .select_from(SurveyResponse)
            .where(
                col(SurveyResponse.survey_id) == survey.id,
                col(SurveyResponse.is_deleted).is_(False),
            )
        )
        survey.responses_count = live_count_result.one()
        survey.updated_at = utc_now()
        survey.performed_by = actor_id
        session.add(survey)
        await commit_with_audit(
            session,
            [
                AuditEvent(
                    action="responses_imported",
                    resource_type="survey",
                    resource_id=survey.survey_id,
                    performed_by=actor_id,
                    changes={
                        "imported_count": len(responses),
                        "source": "csv",
                    },
                    ip_address=ip_address,
                )
            ],
        )
    except Exception:
        # commit_with_audit rolls back commit failures. This boundary also
        # covers flush/serialization failures before the audit helper runs.
        await session.rollback()
        raise

    await ainvalidate_survey_analytics(survey.id)
    await cache_invalidate_prefix("surveys")
    return SurveyResponseImportResult(
        survey_id=survey.id,
        imported_count=len(responses),
    )
