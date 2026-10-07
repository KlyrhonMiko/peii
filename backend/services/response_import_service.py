"""Import survey responses from a Google Forms export (.xlsx or .csv).

The upload is read as-is: columns are mapped onto the survey's current questions
(see ``response_import_mapping``), the user may override that mapping, and every
row is converted and checked against the current question definitions before
anything is written. Historical rows carry no Google identity or consent evidence.

No respondent gets a second response from an import. A row is the same respondent
as an existing response (or an earlier row in the file) when, in order:

1. personal details match: an email address, a contact number, or the full name;
2. every survey answer matches. A personal-detail answer may be blank on one side,
   so an anonymized export and a later full export describe the same responses.

A matched row only fills answers that are blank in the response it matches. It never
overwrites an answer; differences are reported as conflicts.
"""

from __future__ import annotations

import hashlib
import json
from collections import defaultdict
from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Literal
from uuid import UUID

from fastapi import status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from core.analytics_cache import ainvalidate_survey_analytics
from core.cache import cache_invalidate_prefix
from core.exceptions import AppError
from models.survey import Survey
from models.survey_question import SurveyQuestion
from models.survey_response import SurveyResponse
from models.survey_section import SurveySection
from schemas.survey_response import (
    SurveyResponseImportColumn,
    SurveyResponseImportError,
    SurveyResponseImportMatch,
    SurveyResponseImportOverrides,
    SurveyResponseImportPreview,
    SurveyResponseImportQuestion,
    SurveyResponseImportResult,
    SurveyResponseImportRowSummary,
    SurveyResponseImportValueIssue,
)
from services.audit_service import AuditEvent, commit_with_audit
from services.base_service import utc_now
from services.response_import_mapping import (
    ColumnMapping,
    ImportQuestion,
    answer_key,
    apply_column_overrides,
    cell_text,
    comparison_key,
    convert_cell,
    day_first_dates,
    email_keys,
    find_consent_question,
    follow_ups_by_question,
    issue_options,
    name_key,
    parse_timestamp,
    personal_data_kind,
    phone_keys,
    propose_mapping,
    sample_values,
    suggest_option,
)
from services.response_service import (
    _is_blank_answer,
    _load_json,
    _question_is_visible,
    _question_key_to_id,
    _validate_answer,
)
from services.survey_service import resolve_survey
from utils.spreadsheet import CellValue, Sheet, SpreadsheetError, read_spreadsheet

MAX_IMPORT_BYTES = 4 * 1024 * 1024
MAX_IMPORT_OVERRIDES_BYTES = 64 * 1024
MAX_IMPORT_ROWS = 5000
MAX_REPORTED_ITEMS = 100
DEFAULT_UTC_OFFSET_MINUTES = 480
MIN_UTC_OFFSET_MINUTES = -12 * 60
MAX_UTC_OFFSET_MINUTES = 14 * 60

MatchRule = Literal["email", "contact_number", "name", "answers"]


# ------------------------------------------------------------------ data shapes


@dataclass(slots=True)
class _Person:
    emails: set[str] = field(default_factory=set)
    phones: set[str] = field(default_factory=set)
    name: str | None = None


@dataclass(slots=True)
class _Row:
    number: int
    submitted_at: datetime | None
    answers: dict[str, object]
    person: _Person
    has_error: bool = False
    needs_review: bool = False


@dataclass(slots=True)
class _Candidate:
    """A response that later rows can match: an existing row or a new file row."""

    answers: dict[str, object]
    person: _Person
    response_id: UUID | None = None
    row: _Row | None = None
    filled: bool = False


@dataclass(slots=True)
class _Issue:
    column: str
    count: int = 0


@dataclass(slots=True)
class _Plan:
    preview: SurveyResponseImportPreview
    new_rows: list[_Candidate]
    updates: list[_Candidate]
    merged_in_file: int
    unchanged: int
    filled_answer_count: int
    source: str


@dataclass(slots=True)
class _Reporter:
    errors: list[SurveyResponseImportError] = field(default_factory=list)
    error_count: int = 0
    file_error_count: int = 0
    conflicts: list[SurveyResponseImportError] = field(default_factory=list)
    conflict_count: int = 0
    matches: list[SurveyResponseImportMatch] = field(default_factory=list)

    def error(self, row: int | None, column: str | None, code: str, message: str) -> None:
        self.error_count += 1
        if row is None:
            self.file_error_count += 1
        if len(self.errors) < MAX_REPORTED_ITEMS:
            self.errors.append(
                SurveyResponseImportError(row=row, column=column, code=code, message=message)
            )

    def conflict(self, row: int, column: str | None, code: str, message: str) -> None:
        self.conflict_count += 1
        if len(self.conflicts) < MAX_REPORTED_ITEMS:
            self.conflicts.append(
                SurveyResponseImportError(row=row, column=column, code=code, message=message)
            )


# --------------------------------------------------------------------- loading


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


def _import_questions(rows: list[tuple[SurveyQuestion, str]]) -> list[ImportQuestion]:
    questions: list[ImportQuestion] = []
    for order, (question, section_title) in enumerate(rows):
        try:
            options = _load_json(question.options, "options")
            config = _load_json(question.config, "config")
        except ValueError:
            options, config = None, None
        questions.append(
            ImportQuestion(
                id=str(question.id),
                text=question.question_text,
                section_title=section_title,
                question_type=question.question_type,
                options=[item for item in options if isinstance(item, str)]
                if isinstance(options, list)
                else [],
                config=config if isinstance(config, dict) else {},
                order=order,
            )
        )
    return questions


def _structure_version(rows: list[tuple[SurveyQuestion, str]]) -> str:
    payload = [
        {
            "id": str(question.id),
            "section_id": str(question.section_id),
            "type": str(question.question_type),
            "options": question.options,
            "config": question.config,
            "required": question.is_required,
        }
        for question, _ in rows
    ]
    encoded = json.dumps(payload, sort_keys=True, default=str, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


async def _existing_candidates(
    session: AsyncSession,
    survey_id: UUID,
    personal_kinds: Mapping[str, str],
) -> list[_Candidate]:
    result = await session.exec(
        select(SurveyResponse.id, SurveyResponse.answers, SurveyResponse.email).where(
            col(SurveyResponse.survey_id) == survey_id,
            col(SurveyResponse.is_deleted).is_(False),
        )
    )
    candidates: list[_Candidate] = []
    for response_id, answers, email in result.all():
        stored = dict(answers) if isinstance(answers, dict) else {}
        candidates.append(
            _Candidate(
                answers=stored,
                person=_person_from(stored, personal_kinds, [email]),
                response_id=response_id,
            )
        )
    return candidates


# ------------------------------------------------------------------ the parsing


def _read_upload(raw: bytes, filename: str | None) -> tuple[str, list[Sheet]]:
    if len(raw) > MAX_IMPORT_BYTES:
        raise AppError(
            "The import file exceeds the 4 MiB limit.",
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
        )
    try:
        workbook = read_spreadsheet(raw, filename)
    except SpreadsheetError as exc:
        raise AppError(str(exc), status_code=status.HTTP_400_BAD_REQUEST) from exc
    sheets = [sheet for sheet in workbook.sheets if sheet.rows]
    if not sheets:
        raise AppError("The file has no rows.", status_code=status.HTTP_400_BAD_REQUEST)
    return workbook.format, sheets


def _headers(sheet: Sheet) -> list[str]:
    return [cell_text(cell) for cell in sheet.rows[0]]


def _select_sheet(
    sheets: list[Sheet],
    requested: str | None,
    questions: list[ImportQuestion],
) -> Sheet:
    if requested is not None:
        for sheet in sheets:
            if sheet.name == requested:
                return sheet
        raise AppError(
            "The selected sheet is not in this file.",
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        )
    if len(sheets) == 1:
        return sheets[0]
    # A response sheet is the one whose headers map to the most survey questions;
    # side sheets such as an Apps Script "Logs" tab map to few or none.
    best = sheets[0]
    best_score = -1
    for sheet in sheets:
        mapping = propose_mapping(_headers(sheet), sheet.rows[1:201], questions)
        score = sum(1 for item in mapping if item.target == "question")
        if score > best_score:
            best, best_score = sheet, score
    return best


def _check_submitted_at(value: datetime, *, survey: Survey, now: datetime) -> None:
    if value > now:
        raise ValueError("cannot be in the future")
    if survey.retention_enabled and value + timedelta(days=survey.retention_days) <= now:
        raise ValueError("is outside the survey's retention period")


def _person_from(
    answers: dict[str, object],
    personal_kinds: Mapping[str, str],
    extra_cells: list[CellValue],
) -> _Person:
    person = _Person()
    for question_id, kind in personal_kinds.items():
        value = answers.get(question_id)
        if kind == "email":
            person.emails |= email_keys(value)
        elif kind == "phone":
            person.phones |= phone_keys(value)
        elif kind == "name" and person.name is None:
            person.name = name_key(value)
    for cell in extra_cells:
        text = cell_text(cell)
        person.emails |= email_keys(text)
        person.phones |= phone_keys(text)
    return person


def _parse_overrides(raw: str | None) -> SurveyResponseImportOverrides:
    if raw is None:
        return SurveyResponseImportOverrides()
    if len(raw.encode("utf-8")) > MAX_IMPORT_OVERRIDES_BYTES:
        raise AppError(
            "The mapping changes exceed the 64 KiB limit.",
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
        )
    if not raw.strip():
        return SurveyResponseImportOverrides()
    try:
        return SurveyResponseImportOverrides.model_validate_json(raw)
    except ValueError as exc:
        raise AppError(
            "The mapping changes could not be read.",
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        ) from exc


# ------------------------------------------------------------------- duplicates


class _Index:
    """Lookups from personal details and answer signatures to candidates."""

    def __init__(self, personal_ids: set[str]) -> None:
        self.personal_ids = personal_ids
        self.by_email: dict[str, _Candidate] = {}
        self.by_phone: dict[str, _Candidate] = {}
        self.by_name: dict[str, list[_Candidate]] = defaultdict(list)
        self.by_answers: dict[tuple[tuple[str, object], ...], list[_Candidate]] = defaultdict(
            list
        )

    def signature(self, answers: dict[str, object]) -> tuple[tuple[str, object], ...]:
        return tuple(
            sorted(
                (question_id, answer_key(value))
                for question_id, value in answers.items()
                if question_id not in self.personal_ids and not _is_blank_answer(value)
            )
        )

    def add(self, candidate: _Candidate) -> None:
        for email in candidate.person.emails:
            self.by_email.setdefault(email, candidate)
        for phone in candidate.person.phones:
            self.by_phone.setdefault(phone, candidate)
        if candidate.person.name:
            if candidate not in self.by_name[candidate.person.name]:
                self.by_name[candidate.person.name].append(candidate)
        signature = self.signature(candidate.answers)
        if signature and candidate not in self.by_answers[signature]:
            self.by_answers[signature].append(candidate)

    @staticmethod
    def _conflicting_identity(left: _Person, right: _Person) -> bool:
        return bool(
            (left.emails and right.emails and not left.emails & right.emails)
            or (left.phones and right.phones and not left.phones & right.phones)
        )

    def _personal_answers_agree(self, row: _Row, candidate: _Candidate) -> bool:
        for question_id in self.personal_ids:
            left = row.answers.get(question_id)
            right = candidate.answers.get(question_id)
            if _is_blank_answer(left) or _is_blank_answer(right):
                continue
            if answer_key(left) != answer_key(right):
                return False
        return True

    def find(self, row: _Row) -> tuple[_Candidate, MatchRule] | None:
        person = row.person
        for email in sorted(person.emails):
            if email in self.by_email:
                return self.by_email[email], "email"
        for phone in sorted(person.phones):
            if phone in self.by_phone:
                return self.by_phone[phone], "contact_number"
        if person.name:
            for candidate in self.by_name.get(person.name, []):
                if not self._conflicting_identity(person, candidate.person):
                    return candidate, "name"
        signature = self.signature(row.answers)
        if signature:
            for candidate in self.by_answers.get(signature, []):
                if self._personal_answers_agree(row, candidate):
                    return candidate, "answers"
        return None


# ------------------------------------------------------------------- the plan


async def _build_plan(
    session: AsyncSession,
    survey: Survey,
    raw: bytes,
    *,
    filename: str | None,
    overrides: SurveyResponseImportOverrides,
    utc_offset_minutes: int,
    sheet_name: str | None,
) -> _Plan:
    if not MIN_UTC_OFFSET_MINUTES <= utc_offset_minutes <= MAX_UTC_OFFSET_MINUTES:
        raise AppError(
            "The UTC offset is out of range.",
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        )
    question_rows = await _load_ordered_questions(session, survey.id)
    if not question_rows:
        raise AppError(
            "Survey has no active questions available for response import.",
            status_code=status.HTTP_409_CONFLICT,
        )
    file_format, sheets = _read_upload(raw, filename)
    questions = _import_questions(question_rows)
    questions_by_id = {question.id: question for question in questions}
    survey_questions = {str(question.id): question for question, _ in question_rows}
    question_key_to_id = _question_key_to_id(survey_questions)
    follow_ups = follow_ups_by_question(questions)
    consent = find_consent_question(questions)
    personal_kinds = {
        question.id: kind
        for question in questions
        if (kind := personal_data_kind(question)) is not None
    }
    now = utc_now()
    report = _Reporter()

    sheet = _select_sheet(sheets, sheet_name, questions)
    headers = _headers(sheet)
    data = [
        (number, row)
        for number, row in enumerate(sheet.rows[1:], 2)
        if any(cell_text(cell) for cell in row)
    ]
    data_rows = [row for _, row in data]
    mappings = propose_mapping(headers, data_rows, questions)
    for problem in apply_column_overrides(
        mappings, overrides.columns, questions_by_id
    ):
        report.error(None, None, "invalid_mapping", problem)

    timestamp_columns = [item.index for item in mappings if item.target == "submitted_at"]
    if not timestamp_columns:
        report.error(
            None,
            None,
            "missing_timestamp",
            "Choose the column that holds the submission time (Google's Timestamp column).",
        )
    if not data:
        report.error(None, None, "no_rows", "The sheet has no response rows.")
    if len(data) > MAX_IMPORT_ROWS:
        report.error(
            None,
            None,
            "too_many_rows",
            f"The sheet has more than {MAX_IMPORT_ROWS} response rows.",
        )
        data = []

    columns_by_question: dict[str, list[ColumnMapping]] = defaultdict(list)
    for item in mappings:
        if item.target == "question" and item.question_id:
            columns_by_question[item.question_id].append(item)
    match_only_columns = [item.index for item in mappings if item.target == "match_only"]
    value_overrides = {str(key): value for key, value in overrides.values.items()}
    timestamp_index = timestamp_columns[0] if timestamp_columns else None
    day_first = (
        day_first_dates(row[timestamp_index] for row in data_rows)
        if timestamp_index is not None
        else False
    )

    issues: dict[tuple[str, str], _Issue] = {}
    rows: list[_Row] = []
    for number, cells in data:

        def cell(index: int, cells: list[CellValue] = cells) -> CellValue:
            return cells[index] if index < len(cells) else None

        row = _Row(number=number, submitted_at=None, answers={}, person=_Person())
        if timestamp_index is not None:
            raw_time = cell(timestamp_index)
            try:
                if not cell_text(raw_time):
                    raise ValueError("is blank")
                row.submitted_at = parse_timestamp(
                    raw_time, utc_offset_minutes=utc_offset_minutes, day_first=day_first
                )
                _check_submitted_at(row.submitted_at, survey=survey, now=now)
            except ValueError as exc:
                row.has_error = True
                report.error(
                    number,
                    headers[timestamp_index],
                    "invalid_submitted_at",
                    f"The submission time {exc}.",
                )

        follow_up_texts: dict[str, str] = {}
        for question_id, columns in columns_by_question.items():
            question = questions_by_id[question_id]
            filled = [(item, cell(item.index)) for item in columns if cell_text(cell(item.index))]
            if len(filled) > 1:
                row.has_error = True
                report.error(
                    number,
                    ", ".join(item.header for item, _ in filled),
                    "multiple_values",
                    "Only one of these columns can have a value in a row.",
                )
                continue
            if not filled:
                continue
            item, raw_value = filled[0]
            converted = convert_cell(question, raw_value, value_overrides.get(question_id))
            if converted.issue:
                row.needs_review = True
                issue = issues.setdefault(
                    (question_id, cell_text(raw_value)), _Issue(column=item.header)
                )
                issue.count += 1
                continue
            if not converted.ok:
                row.has_error = True
                report.error(
                    number, item.header, "invalid_answer", f"The value {converted.error}."
                )
                continue
            if converted.value is None:
                continue
            row.answers[question_id] = converted.value
            follow_up = follow_ups.get(question_id)
            text = cell_text(raw_value)
            if (
                follow_up is not None
                and converted.value in follow_up.trigger_options
                and comparison_key(text) != comparison_key(str(converted.value))
            ):
                follow_up_texts[follow_up.question_id] = text
        for question_id, text in follow_up_texts.items():
            row.answers.setdefault(question_id, text)

        if consent is not None and row.answers.get(consent.id) is not None:
            if comparison_key(str(row.answers[consent.id])) == "no":
                row.has_error = True
                report.error(
                    number,
                    None,
                    "consent_declined",
                    "The respondent did not give consent. The row is not imported.",
                )
        if not row.answers and not row.needs_review and not row.has_error:
            row.has_error = True
            report.error(number, None, "no_answers", "The row has no answers to import.")

        if not row.has_error and not row.needs_review:
            for question_id, answer in row.answers.items():
                question_model = survey_questions[question_id]
                mapped_columns = columns_by_question.get(question_id)
                column = mapped_columns[0].header if mapped_columns else None
                if not _question_is_visible(question_model, row.answers, question_key_to_id):
                    row.has_error = True
                    report.error(
                        number,
                        column,
                        "hidden_question",
                        "This question does not apply for the row's other answers.",
                    )
                    continue
                try:
                    _validate_answer(
                        question_model,
                        answer,
                        answers=row.answers,
                        question_key_to_id=question_key_to_id,
                    )
                except (TypeError, ValueError, json.JSONDecodeError) as exc:
                    row.has_error = True
                    report.error(number, column, "invalid_answer", f"The value {exc}.")

        row.person = _person_from(
            row.answers, personal_kinds, [cell(index) for index in match_only_columns]
        )
        rows.append(row)

    # Duplicate detection against existing responses, then earlier rows in the file.
    index = _Index(set(personal_kinds))
    for candidate in await _existing_candidates(session, survey.id, personal_kinds):
        index.add(candidate)
    new_rows: list[_Candidate] = []
    updates: dict[UUID, _Candidate] = {}
    merged_in_file = unchanged = filled_answer_count = will_update_rows = 0
    first_column = {
        question_id: columns[0].header for question_id, columns in columns_by_question.items()
    }
    for row in rows:
        if row.has_error or row.needs_review:
            continue
        found = index.find(row)
        if found is None:
            candidate = _Candidate(answers=dict(row.answers), person=row.person, row=row)
            new_rows.append(candidate)
            index.add(candidate)
            continue
        target, rule = found
        fill = {
            question_id: value
            for question_id, value in row.answers.items()
            if _is_blank_answer(target.answers.get(question_id))
        }
        conflicts = 0
        for question_id, value in row.answers.items():
            existing = target.answers.get(question_id)
            if question_id in fill or _is_blank_answer(existing):
                continue
            if answer_key(existing) != answer_key(value):
                conflicts += 1
                report.conflict(
                    row.number,
                    first_column.get(question_id),
                    "kept_existing",
                    "The matched response already has a different answer. It is kept.",
                )
        merged = {**target.answers, **fill}
        for question_id in list(fill):
            question_model = survey_questions[question_id]
            try:
                if not _question_is_visible(question_model, merged, question_key_to_id):
                    raise ValueError("does not apply")
                _validate_answer(
                    question_model,
                    fill[question_id],
                    answers=merged,
                    question_key_to_id=question_key_to_id,
                )
            except (TypeError, ValueError, json.JSONDecodeError):
                del fill[question_id]
                del merged[question_id]
                conflicts += 1
                report.conflict(
                    row.number,
                    first_column.get(question_id),
                    "not_added",
                    "The answer does not fit the matched response and is not added.",
                )
        action: Literal["update", "unchanged"] = "update" if fill else "unchanged"
        if fill:
            target.answers = merged
            target.person.emails |= row.person.emails
            target.person.phones |= row.person.phones
            target.person.name = target.person.name or row.person.name
            target.filled = True
            filled_answer_count += len(fill)
            index.add(target)
        if target.response_id is not None:
            if fill:
                will_update_rows += 1
                updates[target.response_id] = target
            else:
                unchanged += 1
        else:
            merged_in_file += 1
        if len(report.matches) < MAX_REPORTED_ITEMS * 2:
            report.matches.append(
                SurveyResponseImportMatch(
                    row=row.number,
                    matched_by=rule,
                    target="existing" if target.response_id is not None else "file",
                    target_row=target.row.number if target.row is not None else None,
                    action=action,
                    filled_answer_count=len(fill),
                    conflict_count=conflicts,
                )
            )

    needs_review = sum(1 for row in rows if row.needs_review and not row.has_error)
    invalid = sum(1 for row in rows if row.has_error)
    value_issues = [
        SurveyResponseImportValueIssue(
            question_id=UUID(question_id),
            column=issue.column,
            raw_value=raw_value,
            count=issue.count,
            suggestion=suggest_option(
                questions_by_id[question_id], raw_value, follow_ups.get(question_id)
            ),
            options=issue_options(questions_by_id[question_id]),
        )
        for (question_id, raw_value), issue in issues.items()
    ]
    mapped_ids = set(columns_by_question)
    mapped_personal = sorted(mapped_ids & set(personal_kinds))
    warnings: list[str] = []
    unmatched_columns = sum(1 for item in mappings if item.status == "unmatched")
    if unmatched_columns:
        warnings.append(
            f"{unmatched_columns} column(s) with answers match no question in this survey. "
            "Their answers will not be imported unless you choose a question for them."
        )
    if consent is None:
        warnings.append(
            "No consent question was found in this survey, so rows are not checked for consent."
        )

    columns_out = [
        SurveyResponseImportColumn(
            index=item.index,
            header=item.header,
            target=item.target,
            question_id=UUID(item.question_id) if item.question_id else None,
            status=item.status,
            match=item.match,
            reason=item.reason,
            samples=(
                sample_values(
                    row[item.index] if item.index < len(row) else None for row in data_rows
                )
                if item.target in {"question", "submitted_at"}
                else []
            ),
        )
        for item in mappings
    ]
    new_count = len(new_rows)
    preview = SurveyResponseImportPreview(
        survey_id=survey.id,
        file_format=file_format,  # type: ignore[arg-type]
        sheet_names=[item.name for item in sheets],
        sheet=sheet.name if file_format == "xlsx" else None,
        utc_offset_minutes=utc_offset_minutes,
        columns=columns_out,
        questions=[
            SurveyResponseImportQuestion(
                question_id=UUID(question.id),
                section_title=question.section_title,
                question_text=question.text,
                question_type=str(question.question_type),
                survey_phase=question.phase,
                mapped=question.id in mapped_ids,
                importable=question.importable,
            )
            for question in questions
        ],
        value_issues=value_issues,
        rows=SurveyResponseImportRowSummary(
            total=len(rows),
            new=new_count,
            will_update=will_update_rows,
            unchanged=unchanged,
            merged_in_file=merged_in_file,
            needs_review=needs_review,
            invalid=invalid,
        ),
        error_count=report.error_count,
        errors=report.errors,
        conflict_count=report.conflict_count,
        conflicts=report.conflicts,
        match_count=len(rows) - new_count - needs_review - invalid,
        matches=report.matches,
        personal_data_question_ids=[UUID(question_id) for question_id in mapped_personal],
        consent_question_id=UUID(consent.id) if consent is not None else None,
        includes_personal_data=bool(mapped_personal or match_only_columns),
        warnings=warnings,
        structure_version=_structure_version(question_rows),
        can_import=(
            report.file_error_count == 0
            and not value_issues
            and (new_count > 0 or bool(updates))
        ),
    )
    return _Plan(
        preview=preview,
        new_rows=new_rows,
        updates=list(updates.values()),
        merged_in_file=merged_in_file,
        unchanged=unchanged,
        filled_answer_count=filled_answer_count,
        source=file_format,
    )


# ----------------------------------------------------------------- public API


async def preview_response_import(
    session: AsyncSession,
    survey_id: UUID,
    raw: bytes,
    *,
    filename: str | None = None,
    overrides: str | None = None,
    utc_offset_minutes: int = DEFAULT_UTC_OFFSET_MINUTES,
    sheet: str | None = None,
) -> SurveyResponseImportPreview:
    """Map and check an upload without writing anything."""
    survey = await _resolve_import_survey(session, survey_id)
    plan = await _build_plan(
        session,
        survey,
        raw,
        filename=filename,
        overrides=_parse_overrides(overrides),
        utc_offset_minutes=utc_offset_minutes,
        sheet_name=sheet,
    )
    return plan.preview


async def import_responses(
    session: AsyncSession,
    survey_id: UUID,
    raw: bytes,
    *,
    actor_id: UUID,
    structure_version: str,
    filename: str | None = None,
    overrides: str | None = None,
    utc_offset_minutes: int = DEFAULT_UTC_OFFSET_MINUTES,
    sheet: str | None = None,
    ip_address: str | None = None,
) -> SurveyResponseImportResult:
    """Insert new rows and fill blank answers of matched responses in one transaction."""
    parsed_overrides = _parse_overrides(overrides)
    survey = await _resolve_import_survey(session, survey_id, for_update=True)
    question_rows = await _load_ordered_questions(session, survey.id)
    if question_rows and _structure_version(question_rows) != structure_version:
        raise AppError(
            "Survey questions changed since this file was checked. Check the file again.",
            status_code=status.HTTP_409_CONFLICT,
            errors=[{"code": "survey_changed"}],
        )
    plan = await _build_plan(
        session,
        survey,
        raw,
        filename=filename,
        overrides=parsed_overrides,
        utc_offset_minutes=utc_offset_minutes,
        sheet_name=sheet,
    )
    preview = plan.preview
    if not preview.can_import:
        if preview.rows.new == 0 and preview.rows.will_update == 0 and not (
            preview.value_issues or any(error.row is None for error in preview.errors)
        ):
            return SurveyResponseImportResult(
                survey_id=survey.id,
                imported_count=0,
                updated_count=0,
                unchanged_count=plan.unchanged,
                merged_in_file_count=plan.merged_in_file,
                filled_answer_count=0,
            )
        errors = [issue.model_dump(mode="json") for issue in preview.errors if issue.row is None]
        if preview.value_issues:
            errors.append(
                {
                    "row": None,
                    "column": None,
                    "code": "unresolved_values",
                    "message": "Some values do not match the survey options yet.",
                }
            )
        raise AppError(
            "The import file cannot be imported yet.",
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            errors=errors,
        )

    now = utc_now()
    responses = [
        SurveyResponse(
            survey_id=survey.id,
            created_at=candidate.row.submitted_at,
            updated_at=candidate.row.submitted_at,
            retention_expires_at=(
                candidate.row.submitted_at + timedelta(days=survey.retention_days)
                if survey.retention_enabled
                else None
            ),
            answers=candidate.answers,
            performed_by=actor_id,
        )
        for candidate in plan.new_rows
        if candidate.row is not None and candidate.row.submitted_at is not None
    ]
    updated: list[SurveyResponse] = []
    if plan.updates:
        update_by_id = {
            candidate.response_id: candidate
            for candidate in plan.updates
            if candidate.response_id is not None
        }
        result = await session.exec(
            select(SurveyResponse)
            .where(
                col(SurveyResponse.id).in_(list(update_by_id)),
                col(SurveyResponse.survey_id) == survey.id,
                col(SurveyResponse.is_deleted).is_(False),
            )
            .with_for_update()
        )
        for response in result.all():
            response.answers = dict(update_by_id[response.id].answers)
            response.updated_at = now
            response.performed_by = actor_id
            session.add(response)
            updated.append(response)

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
        survey.updated_at = now
        survey.performed_by = actor_id
        session.add(survey)
        events = [
            AuditEvent(
                action="responses_imported",
                resource_type="survey",
                resource_id=survey.survey_id,
                performed_by=actor_id,
                changes={
                    "imported_count": len(responses),
                    "updated_count": len(updated),
                    "unchanged_count": plan.unchanged,
                    "merged_in_file_count": plan.merged_in_file,
                    "skipped_invalid_count": preview.rows.invalid,
                    "source": plan.source,
                },
                ip_address=ip_address,
            )
        ]
        if updated:
            events.append(
                AuditEvent(
                    action="responses_import_updated",
                    resource_type="survey",
                    resource_id=survey.survey_id,
                    performed_by=actor_id,
                    changes={
                        "updated_count": len(updated),
                        "filled_answer_count": plan.filled_answer_count,
                    },
                    ip_address=ip_address,
                )
            )
        await commit_with_audit(session, events)
    except IntegrityError as exc:
        await session.rollback()
        raise AppError(
            "Responses changed while importing. Check the file again.",
            status_code=status.HTTP_409_CONFLICT,
            errors=[{"code": "import_conflict"}],
        ) from exc
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
        updated_count=len(updated),
        unchanged_count=plan.unchanged,
        merged_in_file_count=plan.merged_in_file,
        filled_answer_count=plan.filled_answer_count,
    )
