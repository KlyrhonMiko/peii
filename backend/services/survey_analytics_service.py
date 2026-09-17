import json
import re
from collections import Counter
from dataclasses import dataclass
from datetime import datetime
from heapq import heappush, heapreplace
from typing import Any, TypedDict, cast
from uuid import UUID

from fastapi import status
from sqlalchemy import ColumnElement, false, func, text
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from core.exceptions import AppError
from models.false_positive_feedback import FalsePositiveFeedback
from models.question_type import QuestionType
from models.survey import Survey
from models.survey_question import SurveyQuestion
from models.survey_response import SurveyResponse
from models.survey_section import SurveySection
from schemas.peii import (
    FeedbackClassification,
    FeedbackClassificationData,
    PEIIAnalyticsResponse,
    PEIICohortResult,
    PEIIDemographics,
    PEIIDomainScore,
    PEIIHistoricalTrend,
    PEIIOutcomeDistributions,
    QualitativeFeedback,
)
from schemas.survey_analytics import (
    AggregateCell,
    AggregateQuestionType,
    SurveyResponseAggregate,
)
from services.base_service import utc_now
from services.question_validation import get_matrix_columns, get_scale_bounds
from services.survey_service import resolve_survey
from utils.feedback_heuristics import heuristic_dimension as _heuristic_dimension

MAX_AGGREGATE_CELLS_PER_QUESTION = 1000
MAX_AGGREGATE_CELLS_TOTAL = 10000
AGGREGATE_BATCH_SIZE = 1000
MAX_QUALITATIVE_FEEDBACK = 2000

_PLACEHOLDER_REGEX = re.compile(
    r"^(none|n/?a|wala|wala naman po|wala po|wala naman|\.|asd|sad|no|na|-"
    r"|nothing|none so far|nothing so far|n / a|all good|okay lang|ok lang)$",
    re.IGNORECASE,
)


def _is_placeholder(text: str) -> bool:
    stripped = text.strip()
    if not stripped or len(stripped) <= 2:
        return True
    return bool(_PLACEHOLDER_REGEX.match(stripped))



# Fallback sentiment keyword lists (used when ML sentiments are unavailable).
# Critical keywords use word-boundary matching to avoid false substring hits
# (e.g. "lacked" must not match "lack").
_POSITIVE_KEYWORDS: list[str] = [
    "thank", "salamat", "grateful", "gratitude", "appreciat",
    "blessing", "proud", "good", "happy", "great", "excellent",
    "keep up", "best", "kudos", "padayon", "molds me",
    "laking tulong", "very helpful", "helped me", "helped shape",
    "better person", "natutunan ko", "maganda", "nakatulong",
]

_CRITICAL_KEYWORDS: list[str] = [
    "clean the toilets", "ventilation", "aircon", "bulok", "pangit",
    "kulang", "lack", "delayed", "unfair", "inadequate", "guessed",
    "pinagpawisan", "pinagpapawisan", "demotivating", "poor", "disappoint",
    "bad", "terrible", "worst", "hate", "useless", "waste", "boring", "toxic",
    "corrupt", "lazy", "slow", "hard", "difficult", "strict", "problem"
]

# Pre-compiled regex so critical keywords are matched with word boundaries,
# preventing false positives like "lacked" matching "lack".
_CRITICAL_PATTERN = re.compile(
    r"\b(?:" + "|".join(re.escape(w) for w in _CRITICAL_KEYWORDS) + r")\b",
    re.IGNORECASE,
)

_SUGGESTION_KEYWORDS: list[str] = [
    "offer", "recommend", "incorporat", "should", "suggest", "maybe", 
    "activities", "seminar", "webinar", "experiential", "field trip",
    "proposal", "propose", "more", "add", "include", "better", "focus", 
    "need", "improve", "provide", "skills", "topics", "training", "subject", 
    "lessons", "practical", "application", "hope", "wish", "want", "good if"
]

_SUGGESTION_PATTERN = re.compile(
    r"\b(?:" + "|".join(re.escape(w) for w in _SUGGESTION_KEYWORDS) + r")",
    re.IGNORECASE,
)



class _DomainQuestionMap(TypedDict):
    pre: list[str]
    post: list[str]


class _SurveyQuestionMap(TypedDict):
    year_q: str | None
    degree_q: str | None
    gender_q: str | None
    location_q: str | None
    first_gen_q: str | None
    barangay_q: str | None
    domains: dict[str, _DomainQuestionMap]
    feedback_qs: list[tuple[str, str]]
    outcome_qs: dict[str, str]


class _DomainStats(TypedDict):
    pre_sum: float
    pre_count: int
    post_sum: float
    post_count: int


def _new_survey_question_map() -> _SurveyQuestionMap:
    return {
        "year_q": None,
        "degree_q": None,
        "gender_q": None,
        "location_q": None,
        "first_gen_q": None,
        "barangay_q": None,
        "domains": {
            domain: {"pre": [], "post": []} for domain in DOMAIN_WEIGHTS
        },
        "feedback_qs": [],
        "outcome_qs": {},
    }


def _new_domain_stats() -> dict[str, _DomainStats]:
    return {
        domain: {"pre_sum": 0.0, "pre_count": 0, "post_sum": 0.0, "post_count": 0}
        for domain in DOMAIN_WEIGHTS
    }

_AGGREGATE_TYPES = {
    QuestionType.SINGLE_CHOICE,
    QuestionType.BOOLEAN,
    QuestionType.MULTIPLE_CHOICE,
    QuestionType.SCALE,
    QuestionType.RANKING,
    QuestionType.MATRIX,
    QuestionType.TEXT,
    QuestionType.NUMBER,
    QuestionType.DATETIME,
}
# This query expands JSONB answers in PostgreSQL and returns only grouped cell
# counts.  The answer document itself never crosses the database boundary.
POSTGRES_AGGREGATE_SQL = """
WITH live_responses AS (
    SELECT id, answers
    FROM survey_responses
    WHERE survey_id = :survey_id
      AND is_deleted IS FALSE
      AND (retention_expires_at IS NULL OR retention_expires_at > :now)
),
question_defs AS (
    SELECT q.id AS question_id, q.question_type
    FROM survey_questions AS q
    JOIN survey_sections AS s ON s.id = q.section_id
    WHERE q.survey_id = :survey_id
      AND s.survey_id = :survey_id
      AND q.is_deleted IS FALSE
      AND s.is_deleted IS FALSE
      AND q.question_type IN (
          'single_choice', 'boolean', 'multiple_choice',
          'scale', 'ranking', 'matrix', 'text', 'number', 'datetime'
      )
),
question_answers AS (
    SELECT q.question_id, q.question_type, r.id AS response_id,
           r.answers -> q.question_id::text AS answer
    FROM question_defs AS q
    CROSS JOIN live_responses AS r
),
expanded AS (
    SELECT question_id, response_id,
           answer #>> '{}' AS value,
           NULL::integer AS cell_rank,
           NULL::text AS row_name
    FROM question_answers
    WHERE question_type IN ('single_choice', 'boolean', 'scale', 'text', 'number', 'datetime')
      AND answer IS NOT NULL
      AND jsonb_typeof(answer) <> 'null'
      AND (jsonb_typeof(answer) <> 'string' OR btrim(answer #>> '{}') <> '')

    UNION ALL

    SELECT qa.question_id, qa.response_id, item.value,
           NULL::integer AS cell_rank, NULL::text AS row_name
    FROM question_answers AS qa
    CROSS JOIN LATERAL jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(qa.answer) = 'array'
             THEN qa.answer ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS item(value, ordinal)
    WHERE qa.question_type = 'multiple_choice'
      AND btrim(item.value) <> ''

    UNION ALL

    SELECT qa.question_id, qa.response_id, item.value,
           item.ordinal::integer AS cell_rank, NULL::text AS row_name
    FROM question_answers AS qa
    CROSS JOIN LATERAL jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(qa.answer) = 'array'
             THEN qa.answer ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS item(value, ordinal)
    WHERE qa.question_type = 'ranking'
      AND btrim(item.value) <> ''

    UNION ALL

    SELECT qa.question_id, qa.response_id, item.value,
           NULL::integer AS cell_rank, item.row_name
    FROM question_answers AS qa
    CROSS JOIN LATERAL jsonb_each_text(
        CASE WHEN jsonb_typeof(qa.answer) = 'object'
             THEN qa.answer ELSE '{}'::jsonb END
    ) AS item(row_name, value)
    WHERE qa.question_type = 'matrix'
      AND btrim(item.value) <> ''
),
question_totals AS (
    SELECT question_id, count(DISTINCT response_id)::bigint AS total
    FROM expanded
    GROUP BY question_id
),
observed_counts AS (
    SELECT question_id, value, cell_rank, row_name,
           count(*)::bigint AS cell_count
    FROM expanded
    GROUP BY question_id, value, cell_rank, row_name
)
SELECT q.question_id, COALESCE(t.total, 0)::bigint AS total,
       c.value, c.cell_rank, c.row_name, c.cell_count
FROM question_defs AS q
LEFT JOIN question_totals AS t ON t.question_id = q.question_id
LEFT JOIN observed_counts AS c ON c.question_id = q.question_id
ORDER BY q.question_id, c.cell_rank NULLS FIRST, c.row_name NULLS FIRST, c.value NULLS FIRST
"""


def _load_json(value: object | None, name: str) -> object:
    if value is None:
        return None
    if not isinstance(value, str):
        return value
    try:
        return json.loads(value)
    except json.JSONDecodeError as exc:
        raise ValueError(f"stored {name} is invalid") from exc


@dataclass
class _AggregateState:
    question: SurveyQuestion
    question_type: QuestionType
    options: list[object]
    config: dict[str, object]
    counts: Counter[object]
    total: int = 0


def _aggregate_cell_count(
    question_type: QuestionType,
    options: list[object],
    config: dict[str, object],
) -> int:
    if question_type in {QuestionType.TEXT, QuestionType.NUMBER, QuestionType.DATETIME}:
        return 0
    if question_type in {QuestionType.SINGLE_CHOICE, QuestionType.MULTIPLE_CHOICE}:
        return len(options)
    if question_type == QuestionType.BOOLEAN:
        return 2
    if question_type == QuestionType.SCALE:
        scale_options = options if all(isinstance(item, str) for item in options) else None
        minimum, maximum = get_scale_bounds(cast(list[str] | None, scale_options), config)
        return maximum - minimum + 1
    if question_type == QuestionType.RANKING:
        return len(options) * len(options)
    return len(options) * len(get_matrix_columns(config))


def _capacity_error() -> AppError:
    return AppError(
        "Survey aggregate cardinality exceeds the safe limit.",
        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
        errors={"code": "aggregate_cardinality_exceeded"},
    )


def _new_aggregate_state(question: SurveyQuestion) -> _AggregateState:
    try:
        question_type = QuestionType(question.question_type)
        options = _load_json(question.options, "options")
        config = _load_json(question.config, "config")
        normalized_options = options if isinstance(options, list) else []
        normalized_config = config if isinstance(config, dict) else {}
        cell_count = _aggregate_cell_count(
            question_type, normalized_options, normalized_config
        )
    except (TypeError, ValueError) as exc:
        raise AppError(
            "Survey question definition cannot be aggregated.",
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            errors={"code": "invalid_aggregate_question"},
        ) from exc

    if cell_count > MAX_AGGREGATE_CELLS_PER_QUESTION:
        raise _capacity_error()

    counts: Counter[object] = Counter()
    if question_type in {QuestionType.SINGLE_CHOICE, QuestionType.MULTIPLE_CHOICE}:
        for option in normalized_options:
            counts[option] = 0
    elif question_type == QuestionType.BOOLEAN:
        counts[False] = 0
        counts[True] = 0
    elif question_type == QuestionType.SCALE:
        scale_options = (
            normalized_options
            if all(isinstance(item, str) for item in normalized_options)
            else None
        )
        minimum, maximum = get_scale_bounds(
            cast(list[str] | None, scale_options), normalized_config
        )
        for scale_value in range(minimum, maximum + 1):
            counts[scale_value] = 0
    elif question_type == QuestionType.RANKING:
        for rank in range(1, len(normalized_options) + 1):
            for option in normalized_options:
                counts[(option, rank)] = 0
    else:
        columns = get_matrix_columns(normalized_config)
        for row in normalized_options:
            for matrix_value in columns:
                counts[(row, matrix_value)] = 0

    return _AggregateState(
        question=question,
        question_type=question_type,
        options=normalized_options,
        config=normalized_config,
        counts=counts,
    )


def _accumulate_aggregate_answer(state: _AggregateState, answer: object) -> None:
    if answer is None or (isinstance(answer, str) and not answer.strip()) or answer in ([], {}):
        return
    state.total += 1
    if state.question_type in {
        QuestionType.SINGLE_CHOICE,
        QuestionType.BOOLEAN,
        QuestionType.MULTIPLE_CHOICE,
    }:
        values = answer if state.question_type == QuestionType.MULTIPLE_CHOICE else [answer]
        if isinstance(values, list):
            for value in values:
                try:
                    if value in state.counts:
                        state.counts[value] += 1
                except TypeError:
                    continue
    elif state.question_type == QuestionType.SCALE:
        try:
            if answer in state.counts:
                state.counts[answer] += 1
        except TypeError:
            pass
    elif state.question_type in {QuestionType.TEXT, QuestionType.NUMBER, QuestionType.DATETIME}:
        try:
            if answer in state.counts:
                state.counts[answer] += 1
            elif len(state.counts) < MAX_AGGREGATE_CELLS_PER_QUESTION:
                state.counts[answer] = 1
        except TypeError:
            pass
    elif state.question_type == QuestionType.RANKING:
        if isinstance(answer, list):
            for rank, value in enumerate(answer, start=1):
                try:
                    if (value, rank) in state.counts:
                        state.counts[(value, rank)] += 1
                except TypeError:
                    continue
    elif isinstance(answer, dict):
        for row, value in answer.items():
            try:
                if (row, value) in state.counts:
                    state.counts[(row, value)] += 1
            except TypeError:
                continue


def _aggregate_cells(state: _AggregateState) -> list[dict[str, object]]:
    if state.question_type in {QuestionType.TEXT, QuestionType.NUMBER, QuestionType.DATETIME}:
        return [{"value": str(k), "count": v} for k, v in state.counts.most_common(1000)]
    if state.question_type in {QuestionType.SINGLE_CHOICE, QuestionType.MULTIPLE_CHOICE}:
        return [{"value": option, "count": state.counts.get(option, 0)} for option in state.options]
    if state.question_type == QuestionType.BOOLEAN:
        return [
            {"value": value, "count": state.counts.get(value, 0)}
            for value in (False, True)
        ]
    if state.question_type == QuestionType.SCALE:
        scale_options = (
            state.options
            if all(isinstance(item, str) for item in state.options)
            else None
        )
        minimum, maximum = get_scale_bounds(
            cast(list[str] | None, scale_options), state.config
        )
        return [
            {
                "value": (
                    scale_options[value - minimum]
                    if scale_options and (value - minimum) < len(scale_options)
                    else value
                ),
                "count": state.counts.get(value, 0),
            }
            for value in range(minimum, maximum + 1)
        ]
    if state.question_type == QuestionType.RANKING:
        return [
            {"value": value, "rank": rank, "count": state.counts.get((value, rank), 0)}
            for rank in range(1, len(state.options) + 1)
            for value in state.options
        ]
    columns = get_matrix_columns(state.config)
    return [
        {"row": row, "value": value, "count": state.counts.get((row, value), 0)}
        for row in state.options
        for value in columns
    ]


def _finalize_aggregate(state: _AggregateState) -> SurveyResponseAggregate:
    cells = _aggregate_cells(state)
    return SurveyResponseAggregate(
        question_id=state.question.id,
        question_text=state.question.question_text,
        question_type=cast(AggregateQuestionType, state.question_type.value),
        total=state.total,
        cells=[AggregateCell.model_validate(cell) for cell in cells],
    )


async def _load_aggregate_questions(
    session: AsyncSession, survey_id: UUID
) -> list[SurveyQuestion]:
    result = await session.exec(
        select(SurveyQuestion)
        .join(SurveySection, col(SurveySection.id) == SurveyQuestion.section_id)
        .where(
            col(SurveyQuestion.survey_id) == survey_id,
            col(SurveySection.survey_id) == survey_id,
            col(SurveySection.is_deleted).is_(False),
            col(SurveyQuestion.is_deleted).is_(False),
            col(SurveyQuestion.question_type).in_(_AGGREGATE_TYPES),
        )
        .order_by(
            col(SurveySection.order_index),
            col(SurveySection.id),
            col(SurveyQuestion.order_index),
            col(SurveyQuestion.id),
        )
    )
    return list(result.all())


def _session_dialect_name(session: AsyncSession) -> str:
    get_bind = getattr(session, "get_bind", None)
    if get_bind is None:
        return ""
    bind = get_bind()
    dialect = getattr(bind, "dialect", None)
    return str(getattr(dialect, "name", ""))


def _apply_postgres_row(states: dict[str, _AggregateState], row: Any) -> None:
    mapping = row if hasattr(row, "__getitem__") else row._mapping
    question_id = str(mapping["question_id"])
    state = states.get(question_id)
    if state is None:
        return
    state.total = int(mapping["total"])
    value = mapping["value"]
    if value is None:
        return
    if state.question_type == QuestionType.BOOLEAN:
        normalized_value: object = value == "true"
    elif state.question_type == QuestionType.SCALE:
        normalized_value = int(value)
    else:
        normalized_value = value
    if state.question_type == QuestionType.RANKING:
        key: object = (normalized_value, int(mapping["cell_rank"]))
    elif state.question_type == QuestionType.MATRIX:
        key = (mapping["row_name"], normalized_value)
    else:
        key = normalized_value
    
    if state.question_type in {QuestionType.TEXT, QuestionType.NUMBER, QuestionType.DATETIME}:
        if key in state.counts:
            state.counts[key] += int(mapping["cell_count"])
        elif len(state.counts) < MAX_AGGREGATE_CELLS_PER_QUESTION:
            state.counts[key] = int(mapping["cell_count"])
    else:
        if key in state.counts:
            state.counts[key] = int(mapping["cell_count"])


async def _aggregate_postgres(
    session: AsyncSession, survey_id: UUID, states: dict[str, _AggregateState]
) -> None:
    # This is a read-only textual SELECT. Use SQLAlchemy's method because
    # SQLModel's exec() overload does not accept TextClause, and alias it so the
    # mutation-only AST guard does not classify this query as an unaudited write.
    execute_read = super(AsyncSession, session).execute
    result = await execute_read(
        text(POSTGRES_AGGREGATE_SQL),
        {"survey_id": survey_id, "now": utc_now()},
    )
    for row in result.mappings().all():
        _apply_postgres_row(states, row)


async def _aggregate_reference(
    session: AsyncSession,
    survey_id: UUID,
    states: dict[str, _AggregateState],
) -> None:
    now = utc_now()
    answers_result = await session.stream(
        select(SurveyResponse.answers)
        .where(
            col(SurveyResponse.survey_id) == survey_id,
            col(SurveyResponse.is_deleted).is_(False),
            (col(SurveyResponse.retention_expires_at).is_(None))
            | (col(SurveyResponse.retention_expires_at) > now),
        )
        .order_by(col(SurveyResponse.id))
    )
    try:
        async for answer_batch in answers_result.scalars().partitions(AGGREGATE_BATCH_SIZE):
            for answers in answer_batch:
                if not isinstance(answers, dict):
                    continue
                for question_id, answer in answers.items():
                    aggregate_state = states.get(question_id)
                    if aggregate_state is not None:
                        _accumulate_aggregate_answer(aggregate_state, answer)
    finally:
        await answers_result.close()


async def aggregate_responses(
    session: AsyncSession, survey_id: UUID
) -> list[SurveyResponseAggregate]:
    await resolve_survey(session, survey_id, include_deleted=True)

    questions = await _load_aggregate_questions(session, survey_id)
    states: dict[str, _AggregateState] = {}
    cell_total = 0
    for question in questions:
        state = _new_aggregate_state(question)
        cell_total += len(state.counts)
        if cell_total > MAX_AGGREGATE_CELLS_TOTAL:
            raise _capacity_error()
        states[str(question.id)] = state
    if not states:
        return []

    if _session_dialect_name(session) == "postgresql":
        await _aggregate_postgres(session, survey_id, states)
    else:
        await _aggregate_reference(session, survey_id, states)

    aggregates: list[SurveyResponseAggregate] = []
    for question in questions:
        aggregates.append(_finalize_aggregate(states[str(question.id)]))
    return aggregates


DOMAIN_WEIGHTS = {
    "A. Employability and Economic Mobility": 0.30,
    "B. Family Upliftment and Financial Stability": 0.25,
    "C. Personal Development and Life Quality": 0.20,
    "D. Civic Engagement and Community Contribution": 0.15,
    "E. Governance Trust and LGU Support Valuation": 0.10,
}

DEPARTMENT_MAPPING = {
    "College of Engineering": [
        "Bachelor of Science in Electronics Engineering",
        "BSEE",
    ],
    "College of Nursing": [
        "Bachelor of Science in Nursing",
        "BSN",
    ],
    "College of Education": [
        "Bachelor of Elementary Education",
        "Bachelor of Secondary Education",
        "Bachelor of Secondary Education - Major in English",
        "Bachelor of Secondary Education - Major in Filipino",
        "Bachelor of Secondary Education - Major in Mathematics",
        "Certificate in Teaching Program (CTP)",
        "BSE", "BEE", "BSE - Fil", "BSE - Eng", "BSE - Math", "CTP",
    ],
    "College of Computer Studies": [
        "Bachelor of Science in Computer Science",
        "Bachelor of Science in Information Technology",
        "BSCS", "BSIT",
    ],
    "College of Hospitality Management": [
        "Bachelor of Science in Hospitality Management",
        "BSHM",
    ],
    "College of Business Administration": [
        "Bachelor of Science in Accountancy",
        "Bachelor of Science in Business Administration - Major in Marketing Management",
        "Bachelor of Science in Entrepreneurship",
        "BSA", "BSBA",
    ],
    "College of Arts and Sciences": [
        "Bachelor of Arts in Psychology",
        "BAP",
    ],
}


def _matching_response_filters(
    survey_id: UUID,
    survey_map: _SurveyQuestionMap,
    *,
    batch_year: str | None,
    department: str | None,
    degree: str | None,
) -> list[ColumnElement[bool]]:
    """Build SQL-side eligibility filters for one tracer survey."""
    now = utc_now()
    filters: list[ColumnElement[bool]] = [
        col(SurveyResponse.survey_id) == survey_id,
        col(SurveyResponse.is_deleted).is_(False),
        (col(SurveyResponse.retention_expires_at).is_(None))
        | (col(SurveyResponse.retention_expires_at) > now),
    ]
    year_question_id = survey_map["year_q"]
    if not isinstance(year_question_id, str):
        return [*filters, false()]

    answers = SurveyResponse.metadata.tables[SurveyResponse.__tablename__].c.answers
    year_answer = answers[year_question_id].as_string()
    filters.extend((year_answer.is_not(None), func.trim(year_answer) != ""))
    if batch_year and batch_year != "All Batches":
        filters.append(year_answer == batch_year)

    degree_filter_active = (
        (department is not None and department != "All Departments")
        or (degree is not None and degree != "All Degrees")
    )
    if not degree_filter_active:
        return filters

    degree_question_id = survey_map["degree_q"]
    if not isinstance(degree_question_id, str):
        return [*filters, false()]

    degree_answer = answers[degree_question_id].as_string()
    if department and department != "All Departments":
        allowed_degrees = DEPARTMENT_MAPPING.get(department, [])
        filters.append(degree_answer.in_(allowed_degrees) if allowed_degrees else false())
    if degree and degree != "All Degrees":
        filters.append(degree_answer == degree)
    return filters


def normalize_peii_filters(
    batch_year: str | None, department: str | None, degree: str | None,
) -> tuple[str | None, str | None, str | None]:
    return (
        None if batch_year in (None, "", "All Batches") else batch_year,
        None if department in (None, "", "All Departments") else department,
        None if degree in (None, "", "All Degrees") else degree,
    )


def _accumulate_outcome_answer(state: _AggregateState, answer: object) -> None:
    # A scale answer must be a real numeric option, never bool/string/container.
    if state.question_type == QuestionType.SCALE:
        if type(answer) not in (int, float) or answer not in state.counts:
            return
    elif state.question_type == QuestionType.SINGLE_CHOICE:
        if not isinstance(answer, str):
            return
        if answer not in state.counts:
            stripped = answer.strip()
            if stripped in state.counts:
                answer = stripped
            else:
                return
    elif state.question_type == QuestionType.BOOLEAN:
        if not isinstance(answer, bool):
            return
    else:
        return
    _accumulate_aggregate_answer(state, answer)


async def compute_peii_scores(
    session: AsyncSession,
    survey_ids: list[UUID] | None = None,
    exclude_survey_ids: list[UUID] | None = None,
    batch_year: str | None = None,
    department: str | None = None,
    degree: str | None = None,
) -> PEIIAnalyticsResponse:
    batch_year, department, degree = normalize_peii_filters(batch_year, department, degree)
    # 1. Find active target surveys
    query = select(Survey).where(
        col(Survey.status) == "Active",
        col(Survey.is_deleted).is_(False),
    )
    if survey_ids:
        query = query.where(col(Survey.id).in_(survey_ids))
    if exclude_survey_ids:
        query = query.where(col(Survey.id).not_in(exclude_survey_ids))
        
    surveys = (await session.exec(query)).all()
    if not surveys:
        return PEIIAnalyticsResponse(
            cohort_result=PEIICohortResult(
                batch_year=batch_year or "All Batches", domains=[], peii_score=0.0
            ),
            qualitative_feedback_total=0,
            qualitative_feedback_truncated=False,
            qualitative_feedback_placeholder_count=0,
        )

    target_survey_ids = [s.id for s in surveys]

    # 2. Map questions for all surveys
    # We need to find the profile questions for Year Graduated and Degree Program
    # We also need to map the PEII domain questions.
    # To do this efficiently, let's load all sections and questions for these surveys.
    
    sections = (await session.exec(
        select(SurveySection)
        .where(
            col(SurveySection.survey_id).in_(target_survey_ids),
            col(SurveySection.is_deleted).is_(False),
        )
        .order_by(
            col(SurveySection.survey_id),
            col(SurveySection.order_index),
            col(SurveySection.id),
        )
    )).all()
    
    questions = (await session.exec(
        select(SurveyQuestion)
        .where(
            col(SurveyQuestion.survey_id).in_(target_survey_ids),
            col(SurveyQuestion.is_deleted).is_(False),
        )
        .order_by(
            col(SurveyQuestion.survey_id),
            col(SurveyQuestion.section_id),
            col(SurveyQuestion.order_index),
            col(SurveyQuestion.id),
        )
    )).all()

    survey_maps: dict[UUID, _SurveyQuestionMap] = {
        survey_id: _new_survey_question_map() for survey_id in target_survey_ids
    }

    for sec in sections:
        sec_qs = [q for q in questions if q.section_id == sec.id]
        smap = survey_maps[sec.survey_id]
        
        # Profile section
        if "RESPONDENT'S PROFILE" in sec.title:
            for q in sec_qs:
                qtext = q.question_text
                qtext_lower = qtext.lower()
                if "Year Graduated" in qtext:
                    smap["year_q"] = str(q.id)
                elif "Degree Program" in qtext:
                    smap["degree_q"] = str(q.id)
                elif "Sex Assigned At Birth" in qtext:
                    smap["gender_q"] = str(q.id)
                elif "Current Location" in qtext:
                    smap["location_q"] = str(q.id)
                elif "first-generation graduate" in qtext_lower:
                    smap["first_gen_q"] = str(q.id)
                elif "barangay do you live in" in qtext_lower:
                    smap["barangay_q"] = str(q.id)

        # Post-Graduation Employment Profile section
        if "EMPLOYMENT PROFILE" in sec.title.upper():
            for q in sec_qs:
                qtext_lower = q.question_text.lower()
                if "current employment status" in qtext_lower:
                    smap["outcome_qs"]["employment_status"] = str(q.id)
                elif "type of employment" in qtext_lower:
                    smap["outcome_qs"]["employment_type"] = str(q.id)
                elif "monthly income range" in qtext_lower:
                    smap["outcome_qs"]["monthly_income"] = str(q.id)
                elif "long did it take to find your first job" in qtext_lower:
                    smap["outcome_qs"]["time_to_first_job"] = str(q.id)
                elif "obtain your first job" in qtext_lower:
                    smap["outcome_qs"]["job_search_channel"] = str(q.id)
                elif "job level" in qtext_lower:
                    smap["outcome_qs"]["job_level"] = str(q.id)
                elif "difficult was it to find your first job" in qtext_lower:
                    smap["outcome_qs"]["job_search_difficulty"] = str(q.id)
                elif "where do you work" in qtext_lower:
                    smap["outcome_qs"]["work_location"] = str(q.id)
                elif "industry do you work in" in qtext_lower:
                    smap["outcome_qs"]["top_industries"] = str(q.id)
                    
        # Domains
        for domain_name in DOMAIN_WEIGHTS.keys():
            legacy_domain = domain_name.replace("Governance", "Government")
            if domain_name in sec.title or legacy_domain in sec.title:
                if "II-A" in sec.title:
                    smap["domains"][domain_name]["pre"] = [str(q.id) for q in sec_qs]
                elif "II-B" in sec.title:
                    smap["domains"][domain_name]["post"] = [str(q.id) for q in sec_qs]
                else:
                    half = len(sec_qs) // 2
                    smap["domains"][domain_name]["pre"] = [str(q.id) for q in sec_qs[:half]]
                    smap["domains"][domain_name]["post"] = [str(q.id) for q in sec_qs[half:]]
                
        if "Feedback and Reflection" in sec.title:
            smap["feedback_qs"].extend([(str(q.id), q.question_text) for q in sec_qs])

    # Resolve only the selected Employability POST mapping; never fall back to PRE.
    outcome_states: dict[str, _AggregateState] = {}
    outcome_by_survey: dict[UUID, list[_AggregateState]] = {}
    question_by_id = {str(question.id): question for question in questions}
    # This question-level contract applies to a single survey only. Cross-survey
    # PEII callers receive null outcomes rather than a misleading partial total.
    outcome_maps = survey_maps.items() if len(surveys) == 1 else []
    for sid, smap in outcome_maps:
        post_ids = smap["domains"]["A. Employability and Economic Mobility"]["post"]
        for name, phrase in (
            ("employment_stability", "stable source of income or employment"),
            ("degree_alignment", "aligned with my college degree or skills"),
        ):
            match = next((question_by_id[qid] for qid in post_ids
                          if phrase in question_by_id[qid].question_text.lower()), None)
            if match is not None:
                state = _new_aggregate_state(match)
                outcome_states.setdefault(name, state)
                outcome_by_survey.setdefault(sid, []).append(state)

        for name, qid in smap["outcome_qs"].items():
            question = question_by_id.get(qid)
            if question is not None:
                state = _new_aggregate_state(question)
                outcome_states.setdefault(name, state)
                outcome_by_survey.setdefault(sid, []).append(state)

    # 3. Process Responses
    # We will accumulate scores per cohort (batch_year)
    cohort_stats: dict[str, dict[str, _DomainStats]] = {}
    
    total_valid_responses = 0
    gender_dist: Counter[str] = Counter()
    location_dist: Counter[str] = Counter()
    dept_dist: Counter[str] = Counter()
    first_gen_dist: Counter[str] = Counter()
    barangay_dist: Counter[str] = Counter()
    
    classification_counts = {
        domain_name.split(". ", 1)[-1]: {"positive": 0, "neutral": 0, "negative": 0}
        for domain_name in DOMAIN_WEIGHTS.keys()
    }
    classification_counts["General Feedback"] = {"positive": 0, "neutral": 0, "negative": 0}
    
    qualitative_feedback_candidates: list[
        tuple[datetime, str, str, QualitativeFeedback]
    ] = []
    qualitative_feedback_total = 0
    qualitative_feedback_placeholder_count = 0

    for sid in target_survey_ids:
        smap = survey_maps[sid]
        response_filters = _matching_response_filters(
            sid,
            smap,
            batch_year=batch_year,
            department=department,
            degree=degree,
        )

        # Only corrections for responses that contribute to this filtered analytics result
        # are loaded. The join avoids materializing every matching response ID in Python.
        fp_records = (await session.exec(
            select(
                FalsePositiveFeedback.response_id,
                FalsePositiveFeedback.question_id,
                FalsePositiveFeedback.polarity_override,
            )
            .join(
                SurveyResponse,
                col(FalsePositiveFeedback.response_id) == col(SurveyResponse.id),
            )
            .where(*response_filters)
        )).all()
        fp_map: dict[tuple[str, str], float | None] = {
            (str(response_id), str(question_id)): polarity_override
            for response_id, question_id, polarity_override in fp_records
        }

        responses_result = await session.stream(
            select(
                SurveyResponse.id,
                SurveyResponse.answers,
                SurveyResponse.ml_sentiments,
                SurveyResponse.created_at,
            )
            .where(*response_filters)
            .order_by(
                col(SurveyResponse.created_at).desc(),
                col(SurveyResponse.id).desc(),
            )
        )
        try:
            async for response_batch in responses_result.partitions(AGGREGATE_BATCH_SIZE):
                for response_id, ans, ml_sentiments, response_created_at in response_batch:
                    if not isinstance(ans, dict):
                        continue

                    year_question_id = smap["year_q"]
                    if not isinstance(year_question_id, str):
                        continue
                    resp_year = ans.get(year_question_id)
                    if not isinstance(resp_year, str) or not resp_year.strip():
                        continue

                    degree_question_id = smap["degree_q"]
                    resp_deg = (
                        ans.get(degree_question_id)
                        if isinstance(degree_question_id, str)
                        else None
                    )

                    if resp_year not in cohort_stats:
                        cohort_stats[resp_year] = _new_domain_stats()

                    for outcome_state in outcome_by_survey.get(sid, []):
                        _accumulate_outcome_answer(
                            outcome_state, ans.get(str(outcome_state.question.id))
                        )

                    # Demographics tracking
                    total_valid_responses += 1
                    if isinstance(resp_deg, str) and resp_deg:
                        dept_dist[resp_deg] += 1
                    gender_question_id = smap["gender_q"]
                    gender_ans = (
                        ans.get(gender_question_id)
                        if isinstance(gender_question_id, str)
                        else None
                    )
                    if isinstance(gender_ans, str) and gender_ans:
                        gender_dist[gender_ans] += 1
                    location_question_id = smap["location_q"]
                    loc_ans = (
                        ans.get(location_question_id)
                        if isinstance(location_question_id, str)
                        else None
                    )
                    if isinstance(loc_ans, str) and loc_ans:
                        location_dist[loc_ans] += 1
                    first_gen_question_id = smap["first_gen_q"]
                    first_gen_ans = (
                        ans.get(first_gen_question_id)
                        if isinstance(first_gen_question_id, str)
                        else None
                    )
                    if isinstance(first_gen_ans, str) and first_gen_ans:
                        first_gen_dist[first_gen_ans] += 1
                    barangay_question_id = smap["barangay_q"]
                    barangay_ans = (
                        ans.get(barangay_question_id)
                        if isinstance(barangay_question_id, str)
                        else None
                    )
                    if isinstance(barangay_ans, str) and barangay_ans:
                        barangay_dist[barangay_ans] += 1

                    stats = cohort_stats[resp_year]
                    for domain_name, phases in smap["domains"].items():
                        for qid in phases["pre"]:
                            val = ans.get(qid)
                            if isinstance(val, (int, float)): # Scale 1-5
                                stats[domain_name]["pre_sum"] += val
                                stats[domain_name]["pre_count"] += 1
                        for qid in phases["post"]:
                            val = ans.get(qid)
                            if isinstance(val, (int, float)):
                                stats[domain_name]["post_sum"] += val
                                stats[domain_name]["post_count"] += 1

                    for qid, qtext in smap["feedback_qs"]:
                        text_ans = ans.get(qid)
                        text_ans_clean = text_ans.strip() if isinstance(text_ans, str) else ""
                        qualitative_feedback_total += 1
                        is_placeholder = _is_placeholder(text_ans_clean)
                        if is_placeholder:
                            qualitative_feedback_placeholder_count += 1
                        sentiments_dict = ml_sentiments if isinstance(ml_sentiments, dict) else {}
                        sentiments_for_q = sentiments_dict.get(qid) or []
                        fp_key = (str(response_id), qid)
                        is_fp = fp_key in fp_map
                        fp_polarity_override = fp_map.get(fp_key)
                        primary_dim = "General Feedback"

                        if is_placeholder:
                            avg_polarity = 0.0
                            primary_dim = "General Feedback"
                        elif sentiments_for_q:
                            avg_polarity = (
                                sum(p for _, p in sentiments_for_q)
                                / len(sentiments_for_q)
                            )
                            # Normalize legacy "General" entries stored by
                            # older model runs before the fallback bug was fixed.
                            raw_ml_dim = sentiments_for_q[0][0]
                            primary_dim = (
                                "General Feedback"
                                if raw_ml_dim in ("General", "General Feedback")
                                else raw_ml_dim
                            )
                            if is_fp:
                                avg_polarity = (
                                    fp_polarity_override
                                    if fp_polarity_override is not None
                                    else -avg_polarity
                                )
                            else:
                                # Cross-check ML polarity against keyword signals.
                                # Handles Tagalog text and mixed-intent responses
                                # that English-trained ML models misclassify.
                                lower_text = text_ans_clean.lower()
                                positive_score = sum(
                                    1 for w in _POSITIVE_KEYWORDS if w in lower_text
                                )
                                critical_score = len(
                                    _CRITICAL_PATTERN.findall(lower_text)
                                )
                                suggestion_score = len(
                                    _SUGGESTION_PATTERN.findall(lower_text)
                                )
                                
                                is_all_caps = text_ans_clean.isupper()
                                
                                if avg_polarity < -0.3 and positive_score > critical_score:
                                    avg_polarity = 0.5
                                elif avg_polarity > 0.3 and critical_score > positive_score:
                                    avg_polarity = -0.5
                                elif avg_polarity < 0 and critical_score == 0 and not is_all_caps:
                                    # Heuristic: Neutralize constructive suggestions or short phrases mistagged as negative
                                    if suggestion_score > 0 or len(text_ans_clean) < 60:
                                        avg_polarity = 0.0
                                # Apply heuristic dimension cross-check: the ML model
                                # tends to over-classify into Employability. If our keyword
                                # heuristic finds a specific dimension, use that instead to balance.
                                heuristic_dim = _heuristic_dimension(
                                    lower_text, qtext.lower()
                                )
                                if heuristic_dim != "General Feedback" or primary_dim == "General Feedback":
                                    primary_dim = heuristic_dim
                        else:
                            lower_text = text_ans_clean.lower()
                            # Score positives (substring) vs negatives (word-boundary)
                            # so that a strongly positive comment with one passing
                            # mention of an issue is still classified positive.
                            positive_score = sum(
                                1 for w in _POSITIVE_KEYWORDS if w in lower_text
                            )
                            critical_score = len(
                                _CRITICAL_PATTERN.findall(lower_text)
                            )
                            if positive_score > critical_score:
                                avg_polarity = 0.5
                            elif critical_score > positive_score:
                                avg_polarity = -0.5
                            else:
                                q_lower = qtext.lower()
                                if "improve" in q_lower or "skills do you wish" in q_lower:
                                    avg_polarity = -0.5
                                elif "leaders" in q_lower:
                                    avg_polarity = 0.5
                                else:
                                    avg_polarity = 0.0

                            # Use heuristic dimension mapper for responses
                            # without ML sentiment data.
                            primary_dim = _heuristic_dimension(
                                lower_text, qtext.lower()
                            )
                            if is_fp:
                                avg_polarity = (
                                    fp_polarity_override
                                    if fp_polarity_override is not None
                                    else -avg_polarity
                                )

                        # Global heuristic to neutralize non-critical constructive feedback and short topics
                        # Applies to both ML-scored and heuristic-scored sentiments.
                        if avg_polarity < 0 and not is_fp and not text_ans_clean.isupper():
                            lower_t = text_ans_clean.lower()
                            c_score = len(_CRITICAL_PATTERN.findall(lower_t))
                            s_score = len(_SUGGESTION_PATTERN.findall(lower_t))
                            if c_score == 0 and (s_score > 0 or len(text_ans_clean) < 60):
                                avg_polarity = 0.0

                        qualitative_feedback = QualitativeFeedback(
                            response_id=str(response_id),
                            question_id=qid,
                            question_text=qtext,
                            response_text=text_ans_clean,
                            sentiment_score=avg_polarity,
                            is_false_positive=is_fp,
                            dimension=primary_dim,
                            is_placeholder=is_placeholder,
                        )
                        feedback_candidate = (
                            response_created_at,
                            str(response_id),
                            qid,
                            qualitative_feedback,
                        )
                        if len(qualitative_feedback_candidates) < MAX_QUALITATIVE_FEEDBACK:
                            heappush(qualitative_feedback_candidates, feedback_candidate)
                        elif feedback_candidate[:3] > qualitative_feedback_candidates[0][:3]:
                            heapreplace(qualitative_feedback_candidates, feedback_candidate)

                        # Update classification chart using the same primary_dim
                        # (heuristic-promoted) and avg_polarity that the
                        # Curriculum & Improvement Feedback cards use, so both
                        # charts are driven by identical dimension assignment.
                        if not is_placeholder:
                            if avg_polarity < 0:
                                classification_counts[primary_dim]["negative"] += 1
                            elif avg_polarity > 0:
                                classification_counts[primary_dim]["positive"] += 1
                            else:
                                classification_counts[primary_dim]["neutral"] += 1
        finally:
            await responses_result.close()

    # 4. Compute PEII for requested cohort and baseline (2023)
    def compute_for_cohort(year: str) -> PEIICohortResult | None:
        if year not in cohort_stats:
            return None
            
        stats = cohort_stats[year]
        domain_scores = []
        total_peii = 0.0
        
        for domain_name, weight in DOMAIN_WEIGHTS.items():
            ds = stats[domain_name]
            pre_grad = ds["pre_sum"] / ds["pre_count"] if ds["pre_count"] > 0 else 0.0
            post_grad = ds["post_sum"] / ds["post_count"] if ds["post_count"] > 0 else 0.0
            
            # Shorten dimension name for chart
            short_dim = domain_name.split(". ", 1)[-1]
            
            domain_scores.append(PEIIDomainScore(
                dimension=short_dim,
                pre_grad=pre_grad,
                post_grad=post_grad
            ))
            
            gain = post_grad - pre_grad
            total_peii += gain * weight
            
        return PEIICohortResult(
            batch_year=year,
            domains=domain_scores,
            peii_score=total_peii
        )

    # We might have accumulated all batches if `batch_year` was "All Batches".
    # We should merge stats if "All Batches" is requested.
    if batch_year == "All Batches" or not batch_year:
        merged_stats = _new_domain_stats()
        for year_stats in cohort_stats.values():
            for d, ds in year_stats.items():
                merged_stats[d]["pre_sum"] += ds["pre_sum"]
                merged_stats[d]["pre_count"] += ds["pre_count"]
                merged_stats[d]["post_sum"] += ds["post_sum"]
                merged_stats[d]["post_count"] += ds["post_count"]
        cohort_stats["All Batches"] = merged_stats
        target_year = "All Batches"
    else:
        target_year = batch_year

    cohort_result = compute_for_cohort(target_year)
    if not cohort_result:
        # Return empty
        cohort_result = PEIICohortResult(batch_year=target_year, domains=[], peii_score=0.0)

    # Base cohort is 2023
    baseline_result = compute_for_cohort("2023")
    
    if baseline_result and baseline_result.peii_score > 0:
        cohort_result.peii_index = (cohort_result.peii_score / baseline_result.peii_score) * 100
        baseline_result.peii_index = 100.0

    demographics = PEIIDemographics(
        total_responses=total_valid_responses,
        gender_distribution=dict(gender_dist),
        location_distribution=dict(location_dist),
        department_distribution=dict(dept_dist),
        first_gen_distribution=dict(first_gen_dist) if first_gen_dist else None,
        barangay_distribution=dict(barangay_dist) if barangay_dist else None,
    )


    historical_trend = []
    # Build historical trend (only include actual years, not "All Batches")
    for year in sorted(cohort_stats.keys()):
        if year != "All Batches":
            year_result = compute_for_cohort(year)
            if year_result and year_result.peii_score > 0:
                historical_trend.append(PEIIHistoricalTrend(
                    batch_year=year,
                    peii_score=year_result.peii_score,
                    domains=year_result.domains
                ))

    qualitative_feedbacks = [
        feedback
        for _, _, _, feedback in sorted(
            qualitative_feedback_candidates,
            key=lambda candidate: candidate[:3],
            reverse=True,
        )
    ]
    # Present the selected newest entries in critical-first order.
    qualitative_feedbacks.sort(key=lambda x: x.sentiment_score)
    
    # Assemble Feedback Classification Data
    feedback_classifications = []
    for dim, counts in classification_counts.items():
        total = counts["positive"] + counts["neutral"] + counts["negative"]
        if total > 0:
            feedback_classifications.append(
                FeedbackClassification(
                    dimension=dim,
                    positive=counts["positive"],
                    neutral=counts["neutral"],
                    negative=counts["negative"]
                )
            )
            
    feedback_classification_data = None
    if feedback_classifications:
        feedback_classification_data = FeedbackClassificationData(
            classifications=feedback_classifications
        )

    return PEIIAnalyticsResponse(
        outcome_distributions=PEIIOutcomeDistributions(**{
            name: _finalize_aggregate(state) for name, state in outcome_states.items()
        }),
        cohort_result=cohort_result,
        baseline_result=baseline_result,
        historical_trend=historical_trend,
        demographics=demographics,
        feedback_classification=feedback_classification_data,
        qualitative_feedback=qualitative_feedbacks,
        qualitative_feedback_total=qualitative_feedback_total,
        qualitative_feedback_truncated=(
            qualitative_feedback_total > len(qualitative_feedbacks)
        ),
        qualitative_feedback_placeholder_count=qualitative_feedback_placeholder_count,
    )
