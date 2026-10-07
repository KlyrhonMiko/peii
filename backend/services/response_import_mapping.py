"""Pure helpers that map a response spreadsheet onto one survey's questions.

Google Forms exports one column per question (``Title [row]`` for grid rows),
human-readable answers (``"3 = Neutral"``), and sometimes several mutually exclusive
columns for what this system models as one dependent question. Nothing here touches
the database, so the matching rules stay fast to test in isolation.
"""

from __future__ import annotations

import difflib
import json
import math
import re
import unicodedata
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta, timezone
from typing import Literal

from models.question_type import QuestionType
from services.question_validation import get_scale_bounds
from utils.spreadsheet import CellValue

ColumnTarget = Literal["submitted_at", "question", "match_only", "ignore"]
ColumnStatus = Literal["matched", "check", "unmatched", "ignored"]
ColumnMatch = Literal["timestamp", "header", "values", "merged", "fuzzy", "manual", "none"]

IMPORTABLE_TYPES = frozenset(
    {
        QuestionType.SINGLE_CHOICE,
        QuestionType.MULTIPLE_CHOICE,
        QuestionType.TEXT,
        QuestionType.NUMBER,
        QuestionType.SCALE,
        QuestionType.BOOLEAN,
        QuestionType.DATETIME,
    }
)
CHOICE_TYPES = frozenset(
    {
        QuestionType.SINGLE_CHOICE,
        QuestionType.MULTIPLE_CHOICE,
        QuestionType.SCALE,
        QuestionType.BOOLEAN,
    }
)

VALUE_MATCH_THRESHOLD = 0.6
CONFIDENT_VALUE_MATCH = 0.9
FUZZY_HEADER_THRESHOLD = 0.75
MAX_SAMPLES = 5

_INVISIBLE = dict.fromkeys(
    [*range(0x200B, 0x2010), *range(0x2028, 0x202F), 0x2060, 0xFEFF],
    None,
)
_WHITESPACE = re.compile(r"\s+")
_NON_ALNUM = re.compile(r"[^0-9a-z]+")
_GRID_HEADER = re.compile(r"^(?P<title>.*?)\s*\[(?P<row>[^\[\]]+)\]\s*$", re.S)
_SCALE_PREFIX = re.compile(r"^\s*([+-]?\d+)\s*(?:$|[=:.)\-–—]\s*)")
_NUMBER = re.compile(r"^[+-]?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?$")
# Common abbreviations in Philippine place names (e.g. "Sta. Lucia" for "Santa Lucia").
_TOKEN_ALIASES = {"sta": "santa", "sto": "santo", "brgy": "barangay", "bgy": "barangay"}
_TIMESTAMP_HEADERS = frozenset(
    {"timestamp", "submitted at", "submission time", "date submitted", "time stamp"}
)
_MATCH_ONLY_HEADERS = frozenset({"email address", "email", "e mail address", "e mail"})
_UNSUPPORTED_HEADERS = {"score": "Quiz scores are not survey answers."}
_BEFORE_WORDS = re.compile(r"\b(before|pre|baseline)\b")
_AFTER_WORDS = re.compile(r"\b(after|post)\b")
_NAME_QUESTION = re.compile(r"\b(name|surname)\b")
_EMAIL_QUESTION = re.compile(r"\be ?mail\b")
_PHONE_QUESTION = re.compile(r"\b(contact (number|no)|phone|mobile|cellphone|telephone)\b")
_CONSENT_QUESTION = re.compile(r"\b(consent|data privacy)\b")


# --------------------------------------------------------------------------- text


def clean_text(value: str) -> str:
    """Return display text with invisible characters removed and spaces collapsed."""
    normalized = unicodedata.normalize("NFKC", value).translate(_INVISIBLE)
    return _WHITESPACE.sub(" ", normalized).strip()


def comparison_key(value: str) -> str:
    """Return a case-, punctuation-, and abbreviation-insensitive comparison key."""
    folded = _NON_ALNUM.sub(" ", clean_text(value).casefold())
    return " ".join(_TOKEN_ALIASES.get(token, token) for token in folded.split())


def cell_text(value: CellValue) -> str:
    """Return the display text for one raw cell; blank cells become ``""``."""
    if value is None:
        return ""
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, datetime):
        if value.hour == value.minute == value.second == value.microsecond == 0:
            return value.date().isoformat()
        return value.isoformat(sep=" ")
    if isinstance(value, float):
        return repr(value)
    return clean_text(str(value))


# ---------------------------------------------------------------------- questions


@dataclass(frozen=True, slots=True)
class ImportQuestion:
    id: str
    text: str
    section_title: str
    question_type: QuestionType
    options: list[str]
    config: dict[str, object]
    order: int
    option_lookup: dict[str, str] = field(default_factory=dict, compare=False)

    def __post_init__(self) -> None:
        lookup: dict[str, str] = {}
        for option in self.options:
            lookup.setdefault(comparison_key(option), option)
        object.__setattr__(self, "option_lookup", lookup)

    @property
    def key(self) -> str | None:
        value = self.config.get("question_key")
        return value if isinstance(value, str) and value.strip() else None

    @property
    def phase(self) -> int | None:
        value = self.config.get("survey_phase")
        return value if isinstance(value, int) and not isinstance(value, bool) else None

    @property
    def importable(self) -> bool:
        return self.question_type in IMPORTABLE_TYPES


@dataclass(frozen=True, slots=True)
class FollowUp:
    """A text question shown when its source question takes one of ``trigger_options``."""

    question_id: str
    trigger_options: tuple[str, ...]


def follow_ups_by_question(questions: Sequence[ImportQuestion]) -> dict[str, FollowUp]:
    """Map a choice question id to its "Other, please specify" text question."""
    by_key = {question.key: question for question in questions if question.key}
    result: dict[str, FollowUp] = {}
    for question in questions:
        if question.question_type != QuestionType.TEXT:
            continue
        condition = question.config.get("visible_when")
        if not isinstance(condition, dict):
            continue
        source = by_key.get(condition.get("question_key"))  # type: ignore[arg-type]
        if source is None or source.question_type != QuestionType.SINGLE_CHOICE:
            continue
        if isinstance(condition.get("equals"), str):
            triggers: tuple[str, ...] = (str(condition["equals"]),)
        elif isinstance(condition.get("one_of"), list):
            triggers = tuple(item for item in condition["one_of"] if isinstance(item, str))
        else:
            continue
        if source.id not in result:
            result[source.id] = FollowUp(question_id=question.id, trigger_options=triggers)
    return result


def personal_data_kind(question: ImportQuestion) -> Literal["name", "email", "phone"] | None:
    """Classify text questions that hold identifying respondent details."""
    if question.question_type != QuestionType.TEXT:
        return None
    key = comparison_key(question.text)
    if _EMAIL_QUESTION.search(key):
        return "email"
    if _PHONE_QUESTION.search(key):
        return "phone"
    if _NAME_QUESTION.search(key):
        return "name"
    return None


def find_consent_question(questions: Sequence[ImportQuestion]) -> ImportQuestion | None:
    for question in questions:
        if question.question_type != QuestionType.SINGLE_CHOICE:
            continue
        option_keys = {comparison_key(option) for option in question.options}
        if {"yes", "no"} <= option_keys and _CONSENT_QUESTION.search(
            comparison_key(question.text)
        ):
            return question
    return None


# ------------------------------------------------------------------------ values


@dataclass(frozen=True, slots=True)
class Converted:
    """Outcome of converting one cell for one question.

    Exactly one of ``value`` (with ``ok=True``), ``issue`` (an unresolved choice value
    the user must map), or ``error`` (a row error) is meaningful.
    """

    ok: bool
    value: object = None
    issue: bool = False
    error: str | None = None
    matched_exactly: bool = True


def _match_option(raw: str, question: ImportQuestion) -> str | None:
    if raw in question.options:
        return raw
    return question.option_lookup.get(comparison_key(raw))


def _scale_labels(question: ImportQuestion) -> list[str]:
    try:
        minimum, maximum = get_scale_bounds(question.options or None, question.config)
    except ValueError:
        return []
    labels = question.options if len(question.options) == maximum - minimum + 1 else []
    return [
        f"{number} = {labels[index]}" if labels else str(number)
        for index, number in enumerate(range(minimum, maximum + 1))
    ]


def issue_options(question: ImportQuestion) -> list[str]:
    """Options a user can pick when resolving an unmatched value."""
    if question.question_type == QuestionType.SCALE:
        return _scale_labels(question)
    if question.question_type == QuestionType.BOOLEAN:
        return ["Yes", "No"]
    return list(question.options)


def _convert_scale(question: ImportQuestion, raw: str) -> Converted:
    match = _SCALE_PREFIX.match(raw)
    if match:
        return Converted(ok=True, value=int(match.group(1)))
    try:
        minimum, _ = get_scale_bounds(question.options or None, question.config)
    except ValueError:
        minimum = 1
    label = _match_option(raw, question)
    if label is not None:
        return Converted(ok=True, value=minimum + question.options.index(label))
    return Converted(ok=False, issue=True)


def _convert_boolean(raw: str) -> Converted:
    key = comparison_key(raw)
    if key in {"yes", "true", "y", "1"}:
        return Converted(ok=True, value=True)
    if key in {"no", "false", "n", "0"}:
        return Converted(ok=True, value=False)
    return Converted(ok=False, issue=True)


def _convert_multiple(question: ImportQuestion, raw: str) -> Converted:
    whole = _match_option(raw, question)
    if whole is not None:
        return Converted(ok=True, value=[whole])
    # Google joins checkbox answers with ", " while options may contain commas.
    pieces = raw.split(",")
    selected: list[str] = []
    start = 0
    while start < len(pieces):
        for end in range(len(pieces), start, -1):
            option = _match_option(",".join(pieces[start:end]).strip(), question)
            if option is not None:
                if option not in selected:
                    selected.append(option)
                start = end
                break
        else:
            return Converted(ok=False, issue=True)
    return Converted(ok=True, value=selected)


def _parse_number(raw: str) -> int | float:
    normalized = raw.strip().replace(" ", "")
    if not _NUMBER.fullmatch(normalized):
        raise ValueError("must be a number")
    normalized = normalized.replace(",", "")
    if "." not in normalized:
        return int(normalized)
    parsed = float(normalized)
    if not math.isfinite(parsed):
        raise ValueError("must be a finite number")
    return parsed


_DATE_FORMATS = ("%m/%d/%Y", "%Y/%m/%d", "%B %d, %Y", "%b %d, %Y", "%d %B %Y")


def _parse_date(raw: CellValue) -> str:
    if isinstance(raw, datetime):
        return raw.date().isoformat()
    text = cell_text(raw)
    try:
        return date.fromisoformat(text[:10]).isoformat()
    except ValueError:
        pass
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(text, fmt).date().isoformat()
        except ValueError:
            continue
    raise ValueError("must be a date")


def convert_cell(
    question: ImportQuestion,
    raw: CellValue,
    value_overrides: Mapping[str, str | None] | None = None,
) -> Converted:
    """Convert one non-blank cell into the answer shape stored for ``question``."""
    text = cell_text(raw)
    overrides = value_overrides or {}
    question_type = question.question_type

    if question_type in CHOICE_TYPES and text in overrides:
        chosen = overrides[text]
        if chosen is None:
            return Converted(ok=True, value=None, matched_exactly=False)
        converted = convert_cell(question, chosen)
        if not converted.ok:
            return Converted(ok=False, error="override is not one of the question's options")
        return Converted(ok=True, value=converted.value, matched_exactly=False)

    if question_type == QuestionType.SINGLE_CHOICE:
        option = _match_option(text, question)
        if option is None:
            return Converted(ok=False, issue=True)
        return Converted(ok=True, value=option, matched_exactly=option == text)
    if question_type == QuestionType.MULTIPLE_CHOICE:
        return _convert_multiple(question, text)
    if question_type == QuestionType.SCALE:
        return _convert_scale(question, text)
    if question_type == QuestionType.BOOLEAN:
        if isinstance(raw, bool):
            return Converted(ok=True, value=raw)
        return _convert_boolean(text)
    if question_type == QuestionType.NUMBER:
        if isinstance(raw, (int, float)) and not isinstance(raw, bool):
            return Converted(ok=True, value=raw)
        try:
            return Converted(ok=True, value=_parse_number(text))
        except ValueError as exc:
            return Converted(ok=False, error=str(exc))
    if question_type == QuestionType.DATETIME:
        try:
            return Converted(ok=True, value=_parse_date(raw))
        except ValueError as exc:
            return Converted(ok=False, error=str(exc))
    if question_type == QuestionType.TEXT:
        return Converted(ok=True, value=text)
    return Converted(ok=False, error="this question type cannot be imported")


def suggest_option(
    question: ImportQuestion,
    raw: str,
    follow_up: FollowUp | None,
) -> str | None:
    """Suggest the closest option, or the "Other" option when one takes free text."""
    options = issue_options(question)
    lookup = {comparison_key(option): option for option in options}
    close = difflib.get_close_matches(comparison_key(raw), list(lookup), n=1, cutoff=0.8)
    if close:
        return lookup[close[0]]
    if follow_up is not None:
        generic = [option for option in follow_up.trigger_options if option in options]
        preferred = [option for option in generic if comparison_key(option) == "other specify"]
        choices = preferred or generic
        return choices[0] if choices else None
    return None


# --------------------------------------------------------------------- timestamps


_TZ_SUFFIX = re.compile(r"\s*(?:GMT|UTC)\s*([+-])(\d{1,2})(?::?(\d{2}))?\s*$", re.I)
_SLASH_DATE = re.compile(r"^\s*(\d{1,2})/(\d{1,2})/(\d{4})\b")
_TIMESTAMP_FORMATS_MONTH_FIRST = (
    "%m/%d/%Y %H:%M:%S",
    "%m/%d/%Y %H:%M",
    "%m/%d/%Y %I:%M:%S %p",
    "%m/%d/%Y %I:%M %p",
    "%m/%d/%Y",
)
_TIMESTAMP_FORMATS_OTHER = (
    "%Y/%m/%d %I:%M:%S %p",
    "%Y/%m/%d %H:%M:%S",
    "%Y/%m/%d %I:%M %p",
    "%Y/%m/%d %H:%M",
    "%Y-%m-%d %I:%M:%S %p",
)


def day_first_dates(values: Iterable[CellValue]) -> bool:
    """Detect D/M/Y text dates: true only if some first part cannot be a month."""
    day_first = False
    for value in values:
        if not isinstance(value, str):
            continue
        match = _SLASH_DATE.match(value)
        if not match:
            continue
        first, second = int(match.group(1)), int(match.group(2))
        if second > 12:
            return False
        if first > 12:
            day_first = True
    return day_first


def _round_to_second(value: datetime) -> datetime:
    rounded = value + timedelta(microseconds=500_000)
    return rounded.replace(microsecond=0)


def parse_timestamp(
    raw: CellValue,
    *,
    utc_offset_minutes: int,
    day_first: bool,
) -> datetime:
    """Return a naive UTC datetime rounded to the second."""
    local_zone = timezone(timedelta(minutes=utc_offset_minutes))
    parsed: datetime | None = None
    if isinstance(raw, datetime):
        parsed = raw
    elif isinstance(raw, (int, float)) and not isinstance(raw, bool):
        # An unformatted Excel serial date (days since 1899-12-30).
        if 20_000 < raw < 100_000:
            parsed = datetime(1899, 12, 30) + timedelta(days=float(raw))
    elif isinstance(raw, str):
        text = clean_text(raw)
        zone = local_zone
        suffix = _TZ_SUFFIX.search(text)
        if suffix:
            sign = -1 if suffix.group(1) == "-" else 1
            minutes = int(suffix.group(2)) * 60 + int(suffix.group(3) or 0)
            zone = timezone(sign * timedelta(minutes=minutes))
            text = text[: suffix.start()].strip()
        try:
            parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
        except ValueError:
            formats: tuple[str, ...] = _TIMESTAMP_FORMATS_MONTH_FIRST
            if day_first:
                formats = tuple(fmt.replace("%m/%d", "%d/%m") for fmt in formats)
            for fmt in (*formats, *_TIMESTAMP_FORMATS_OTHER):
                try:
                    parsed = datetime.strptime(text, fmt)
                    break
                except ValueError:
                    continue
        if parsed is not None and parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=zone)
    if parsed is None:
        raise ValueError("is not a recognized date and time")
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=local_zone)
    return _round_to_second(parsed.astimezone(UTC).replace(tzinfo=None))


# ----------------------------------------------------------------------- mapping


@dataclass(slots=True)
class ColumnMapping:
    index: int
    header: str
    target: ColumnTarget = "ignore"
    question_id: str | None = None
    status: ColumnStatus = "unmatched"
    match: ColumnMatch = "none"
    reason: str | None = None


@dataclass(slots=True)
class _Column:
    index: int
    header: str
    row_text: str
    title_text: str
    values: list[CellValue] = field(default_factory=list)

    @property
    def distinct_texts(self) -> set[str]:
        return {text for text in (cell_text(value) for value in self.values) if text}


def _split_header(header: str) -> tuple[str, str]:
    match = _GRID_HEADER.match(header)
    if match:
        return clean_text(match.group("row")), clean_text(match.group("title"))
    return clean_text(header), ""


def _phase_hint(title: str) -> int | None:
    key = comparison_key(title)
    if _BEFORE_WORDS.search(key):
        return 1
    if _AFTER_WORDS.search(key):
        return 2
    return None


def _value_coverage(question: ImportQuestion, values: set[str]) -> float:
    if not values:
        return 0.0
    allowed_failures = math.floor(len(values) * (1 - VALUE_MATCH_THRESHOLD))
    failures = 0
    for value in values:
        if not convert_cell(question, value).ok:
            failures += 1
            if failures > allowed_failures:
                return 0.0
    return (len(values) - failures) / len(values)


def _pick_by_phase(
    candidates: list[ImportQuestion],
    phase_hint: int | None,
) -> ImportQuestion | None:
    if not candidates:
        return None
    if phase_hint is not None:
        for question in candidates:
            if question.phase == phase_hint:
                return question
    return candidates[0]


def propose_mapping(
    headers: Sequence[str],
    rows: Sequence[Sequence[CellValue]],
    questions: Sequence[ImportQuestion],
) -> list[ColumnMapping]:
    """Propose a target for every column, strongest evidence first."""
    columns: list[_Column] = []
    for index, header in enumerate(headers):
        row_text, title_text = _split_header(header)
        columns.append(
            _Column(
                index=index,
                header=clean_text(header),
                row_text=row_text,
                title_text=title_text,
                values=[row[index] if index < len(row) else None for row in rows],
            )
        )
    mappings = {column.index: ColumnMapping(column.index, column.header) for column in columns}
    importable = [question for question in questions if question.importable]
    assigned: set[str] = set()
    unassigned_columns = {column.index for column in columns}

    def assign(
        column: _Column,
        question: ImportQuestion,
        match: ColumnMatch,
        status: ColumnStatus = "matched",
        reason: str | None = None,
    ) -> None:
        mapping = mappings[column.index]
        mapping.target = "question"
        mapping.question_id = question.id
        mapping.status = status
        mapping.match = match
        mapping.reason = reason
        assigned.add(question.id)
        unassigned_columns.discard(column.index)

    # 1. Fixed headers: submission time, identity columns, and unsupported extras.
    has_timestamp = False
    for column in columns:
        key = comparison_key(column.header)
        mapping = mappings[column.index]
        if not key and not column.distinct_texts:
            mapping.status, mapping.reason = "ignored", "The column is empty."
            unassigned_columns.discard(column.index)
        elif key in _TIMESTAMP_HEADERS and not has_timestamp:
            has_timestamp = True
            mapping.target, mapping.status, mapping.match = "submitted_at", "matched", "timestamp"
            unassigned_columns.discard(column.index)
        elif key in _MATCH_ONLY_HEADERS:
            mapping.target, mapping.status, mapping.match = "match_only", "matched", "header"
            mapping.reason = "Used only to find duplicate respondents. It is not saved."
            unassigned_columns.discard(column.index)
        elif key in _UNSUPPORTED_HEADERS:
            mapping.status, mapping.reason = "ignored", _UNSUPPORTED_HEADERS[key]
            unassigned_columns.discard(column.index)

    question_keys = {question.id: comparison_key(question.text) for question in importable}

    # 2. Exact header text (or grid row text) against question text.
    for column in columns:
        if column.index not in unassigned_columns:
            continue
        key = comparison_key(column.row_text)
        exact = [
            question
            for question in importable
            if question.id not in assigned and question_keys[question.id] == key
        ]
        chosen = _pick_by_phase(exact, _phase_hint(column.title_text))
        if chosen is not None:
            assign(column, chosen, "header")

    # 3. Header text contained in the question text, or the reverse.
    for column in columns:
        if column.index not in unassigned_columns:
            continue
        key = comparison_key(column.row_text)
        if len(key.split()) < 3:
            continue
        contained = []
        for question in importable:
            question_key = question_keys[question.id]
            if question.id in assigned or not question_key:
                continue
            shorter, longer = sorted((key, question_key), key=len)
            if f" {shorter} " in f" {longer} " and len(shorter) / len(longer) >= 0.5:
                contained.append(question)
        chosen = _pick_by_phase(contained, _phase_hint(column.title_text))
        if chosen is not None:
            assign(column, chosen, "header")

    # 4. Column values that fit exactly one unassigned choice question. Values that do
    #    not fit become value issues the user resolves, so a partial fit still maps.
    def value_candidates(
        column: _Column,
        pool: Iterable[ImportQuestion],
    ) -> list[tuple[ImportQuestion, float]]:
        values = column.distinct_texts
        scored = [
            (question, _value_coverage(question, values))
            for question in pool
            if question.question_type in CHOICE_TYPES
        ]
        return [(question, coverage) for question, coverage in scored if coverage > 0]

    partial_reason = "Some values do not match the question's options. Check the choice."
    for column in columns:
        if column.index not in unassigned_columns or not column.distinct_texts:
            continue
        candidates = value_candidates(
            column, (question for question in importable if question.id not in assigned)
        )
        if len(candidates) == 1:
            question, coverage = candidates[0]
            confident = coverage >= CONFIDENT_VALUE_MATCH
            assign(
                column,
                question,
                "values",
                status="matched" if confident else "check",
                reason=None if confident else partial_reason,
            )
        elif len(candidates) > 1:
            ranked = sorted(
                candidates,
                key=lambda item: (
                    item[1],
                    difflib.SequenceMatcher(
                        None, comparison_key(column.row_text), question_keys[item[0].id]
                    ).ratio(),
                ),
                reverse=True,
            )
            assign(
                column,
                ranked[0][0],
                "values",
                status="check",
                reason="Several questions accept these values. Check the choice.",
            )

    # 5. Mutually exclusive sibling columns merged into a single-choice question that
    #    is already mapped by its values (Google's per-branch "Categories for …").
    def shared_prefix(column: _Column, question_id: str) -> int:
        header_words = comparison_key(column.header).split()
        best = 0
        for other in columns:
            if other.index == column.index or mappings[other.index].question_id != question_id:
                continue
            count = 0
            for left, right in zip(
                header_words, comparison_key(other.header).split(), strict=False
            ):
                if left != right:
                    break
                count += 1
            best = max(best, count)
        return best

    def mergeable_questions() -> list[ImportQuestion]:
        ids = {
            mapping.question_id
            for mapping in mappings.values()
            if mapping.match in {"values", "merged"} and mapping.question_id
        }
        return [
            question
            for question in importable
            if question.id in ids and question.question_type == QuestionType.SINGLE_CHOICE
        ]

    for column in columns:
        if column.index not in unassigned_columns or not column.distinct_texts:
            continue
        merge_candidates = [
            question
            for question, coverage in value_candidates(column, mergeable_questions())
            if coverage >= CONFIDENT_VALUE_MATCH
        ]
        if len(merge_candidates) > 1:
            # Values fit several questions; prefer the one whose columns share this
            # header's leading words, e.g. "Categories for …".
            prefix_scores = sorted(
                ((shared_prefix(column, question.id), question) for question in merge_candidates),
                key=lambda item: -item[0],
            )
            if prefix_scores[0][0] >= 2 and prefix_scores[0][0] > prefix_scores[1][0]:
                merge_candidates = [prefix_scores[0][1]]
        if len(merge_candidates) == 1:
            assign(
                column,
                merge_candidates[0],
                "merged",
                reason="Combined with other columns for the same question.",
            )

    # 5b. A sibling column whose values are mostly unknown still belongs with its
    #     group when its header starts like the group's headers.
    for column in columns:
        if column.index not in unassigned_columns or not column.distinct_texts:
            continue
        sibling_scores = sorted(
            (
                (shared_prefix(column, question.id), question)
                for question in mergeable_questions()
            ),
            key=lambda item: -item[0],
        )
        if not sibling_scores or sibling_scores[0][0] < 2:
            continue
        if len(sibling_scores) > 1 and sibling_scores[1][0] == sibling_scores[0][0]:
            continue
        assign(
            column,
            sibling_scores[0][1],
            "merged",
            status="check",
            reason="Combined with similar columns, but some values do not match. Check it.",
        )

    # 6. Close header text; always flagged for review.
    for column in columns:
        if column.index not in unassigned_columns:
            continue
        key = comparison_key(column.row_text)
        best: tuple[float, ImportQuestion] | None = None
        for question in importable:
            if question.id in assigned:
                continue
            ratio = difflib.SequenceMatcher(None, key, question_keys[question.id]).ratio()
            if ratio >= FUZZY_HEADER_THRESHOLD and (best is None or ratio > best[0]):
                best = (ratio, question)
        if best is not None:
            assign(
                column,
                best[1],
                "fuzzy",
                status="check",
                reason="The header is similar but not the same. Check the choice.",
            )

    for index in unassigned_columns:
        mapping = mappings[index]
        if not columns[index].distinct_texts:
            mapping.status, mapping.reason = "ignored", "The column is empty."
        else:
            mapping.reason = "No matching survey question. The column is not imported."

    return [mappings[column.index] for column in columns]


def apply_column_overrides(
    mappings: list[ColumnMapping],
    overrides: Mapping[int, str],
    questions_by_id: Mapping[str, ImportQuestion],
) -> list[str]:
    """Apply user column choices in place; return messages for invalid choices."""
    problems: list[str] = []
    by_index = {mapping.index: mapping for mapping in mappings}
    for index, target in overrides.items():
        mapping = by_index.get(index)
        if mapping is None:
            problems.append(f"Column {index + 1} does not exist in this file.")
            continue
        mapping.match, mapping.status, mapping.reason = "manual", "matched", None
        mapping.question_id = None
        if target in {"submitted_at", "match_only"}:
            mapping.target = target  # type: ignore[assignment]
        elif target == "ignore":
            mapping.target, mapping.status = "ignore", "ignored"
        else:
            question = questions_by_id.get(target)
            if question is None or not question.importable:
                problems.append(f"Column {index + 1} points to a question that cannot be imported.")
                mapping.target, mapping.status = "ignore", "ignored"
                continue
            mapping.target, mapping.question_id = "question", question.id
    timestamp_columns = [mapping for mapping in mappings if mapping.target == "submitted_at"]
    if len(timestamp_columns) > 1:
        problems.append("Only one column can be the submission time.")
    return problems


def sample_values(values: Iterable[CellValue]) -> list[str]:
    samples: list[str] = []
    for value in values:
        text = cell_text(value)
        if text and text not in samples:
            samples.append(text[:120])
        if len(samples) >= MAX_SAMPLES:
            break
    return samples


# ------------------------------------------------------------------- duplicates


_EMAIL_PATTERN = re.compile(r"[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}")
_PHONE_PATTERN = re.compile(r"\+?\d[\d\s().\-]{5,}\d")


def email_keys(value: object) -> set[str]:
    if not isinstance(value, str):
        return set()
    return set(_EMAIL_PATTERN.findall(clean_text(value).casefold()))


def phone_keys(value: object) -> set[str]:
    if not isinstance(value, (str, int)) or isinstance(value, bool):
        return set()
    keys: set[str] = set()
    for match in _PHONE_PATTERN.findall(str(value)):
        digits = re.sub(r"\D", "", match)
        if len(digits) >= 7:
            keys.add(digits[-10:])
    return keys


def name_key(value: object) -> str | None:
    """Order-insensitive name key that tolerates a missing middle initial."""
    if not isinstance(value, str):
        return None
    tokens = sorted(token for token in comparison_key(value).split() if len(token) > 1)
    return " ".join(tokens) if len(tokens) >= 2 else None


def answer_key(value: object) -> object:
    """Normalize a stored answer so equal answers compare equal."""
    if isinstance(value, str):
        return clean_text(value).casefold()
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, list):
        return tuple(answer_key(item) for item in value)
    if isinstance(value, dict):
        return tuple(sorted((str(key), answer_key(item)) for key, item in value.items()))
    return json.dumps(value, sort_keys=True, default=str)
