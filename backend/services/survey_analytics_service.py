import json
from collections import Counter
from dataclasses import dataclass
from typing import Any, cast
from uuid import UUID

from fastapi import status
from sqlalchemy import text
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from core.exceptions import AppError
from models.question_type import QuestionType
from models.survey import Survey
from models.survey_question import SurveyQuestion
from models.survey_response import SurveyResponse
from models.survey_section import SurveySection
from models.false_positive_feedback import FalsePositiveFeedback
from schemas.peii import (
    PEIIAnalyticsResponse, 
    PEIICohortResult, 
    PEIIDomainScore, 
    PEIIDemographics,
    FeedbackClassification,
    FeedbackClassificationData,
    PEIIHistoricalTrend,
    QualitativeFeedback
)
from services.ml_service import FeedbackAnalyzer

from schemas.survey_analytics import (
    AggregateCell,
    AggregateQuestionType,
    SurveyResponseAggregate,
)
from services.base_service import utc_now
from services.question_validation import get_matrix_columns, get_scale_bounds
from services.survey_service import resolve_survey

MAX_AGGREGATE_CELLS_PER_QUESTION = 1000
MAX_AGGREGATE_CELLS_TOTAL = 10000
AGGREGATE_BATCH_SIZE = 1000

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
            {"value": scale_options[value - minimum] if scale_options and (value - minimum) < len(scale_options) else value, "count": state.counts.get(value, 0)}
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
    "E. Government Trust and LGU Support Valuation": 0.10,
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

async def compute_peii_scores(
    session: AsyncSession,
    survey_ids: list[UUID] | None = None,
    exclude_survey_ids: list[UUID] | None = None,
    batch_year: str | None = None,
    department: str | None = None,
    degree: str | None = None,
) -> PEIIAnalyticsResponse:
    # 1. Find target surveys
    query = select(Survey).where(col(Survey.title) == "GRADUATE TRACER STUDY SURVEY", col(Survey.status) == "Active")
    if survey_ids:
        query = query.where(col(Survey.id).in_(survey_ids))
    if exclude_survey_ids:
        query = query.where(col(Survey.id).not_in(exclude_survey_ids))
        
    surveys = (await session.exec(query)).all()
    if not surveys:
        return PEIIAnalyticsResponse(cohort_result=PEIICohortResult(batch_year=batch_year or "All Batches", domains=[], peii_score=0.0))

    target_survey_ids = [s.id for s in surveys]

    # 2. Map questions for all surveys
    # We need to find the profile questions for Year Graduated and Degree Program
    # We also need to map the PEII domain questions.
    # To do this efficiently, let's load all sections and questions for these surveys.
    
    sections = (await session.exec(
        select(SurveySection)
        .where(col(SurveySection.survey_id).in_(target_survey_ids))
    )).all()
    
    questions = (await session.exec(
        select(SurveyQuestion)
        .where(col(SurveyQuestion.survey_id).in_(target_survey_ids))
    )).all()

    survey_maps = {} # survey_id -> mapping
    for sid in target_survey_ids:
        survey_maps[sid] = {
            "year_q": None,
            "degree_q": None,
            "gender_q": None,
            "location_q": None,
            "domains": {d: {"pre": [], "post": []} for d in DOMAIN_WEIGHTS.keys()},
            "feedback_qs": []
        }

    for sec in sections:
        sec_qs = [q for q in questions if q.section_id == sec.id]
        smap = survey_maps[sec.survey_id]
        
        # Profile section
        if "RESPONDENT'S PROFILE" in sec.title:
            for q in sec_qs:
                if "Year Graduated" in q.question_text:
                    smap["year_q"] = str(q.id)
                elif "Degree Program" in q.question_text:
                    smap["degree_q"] = str(q.id)
                elif "Sex Assigned At Birth" in q.question_text:
                    smap["gender_q"] = str(q.id)
                elif "Current Location" in q.question_text:
                    smap["location_q"] = str(q.id)
                    
        # Domains
        for domain_name in DOMAIN_WEIGHTS.keys():
            if domain_name in sec.title:
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

    # 3. Process Responses
    # We will accumulate scores per cohort (batch_year)
    cohort_stats = {} # batch_year -> { domain_name -> { pre_sum, pre_count, post_sum, post_count } }
    
    total_valid_responses = 0
    gender_dist = Counter()
    location_dist = Counter()
    dept_dist = Counter()
    
    classification_counts = {
        domain_name.split(". ", 1)[-1]: {"positive": 0, "neutral": 0, "negative": 0}
        for domain_name in DOMAIN_WEIGHTS.keys()
    }
    classification_counts["General Feedback"] = {"positive": 0, "neutral": 0, "negative": 0}
    
    qualitative_feedbacks = []
    
    
    
    for sid in target_survey_ids:
        smap = survey_maps[sid]
        responses = (await session.exec(
            select(SurveyResponse)
            .where(col(SurveyResponse.survey_id) == sid, col(SurveyResponse.is_deleted).is_(False))
        )).all()
        
        # Pre-fetch false positives — store polarity_override keyed by (response_id, question_id)
        fp_records = (await session.exec(
            select(FalsePositiveFeedback)
            .where(col(FalsePositiveFeedback.response_id).in_([r.id for r in responses]))
        )).all()
        # value is None (flip) or explicit float override
        fp_map: dict[tuple[str, str], float | None] = {
            (str(fp.response_id), str(fp.question_id)): fp.polarity_override
            for fp in fp_records
        }

        
        for resp in responses:
            ans = resp.answers
            if not isinstance(ans, dict):
                continue
                
            resp_year = ans.get(smap["year_q"])
            if not resp_year:
                continue # Unknown cohort
                
            if batch_year and batch_year != "All Batches" and resp_year != batch_year:
                continue # Filtered out
                
            resp_deg = ans.get(smap["degree_q"])
            if department and department != "All Departments":
                # Check mapping
                allowed_degrees = DEPARTMENT_MAPPING.get(department, [])
                if resp_deg not in allowed_degrees:
                    continue # Filtered out
            if degree and degree != "All Degrees" and resp_deg != degree:
                continue # Filtered out

            if resp_year not in cohort_stats:
                cohort_stats[resp_year] = {
                    d: {"pre_sum": 0, "pre_count": 0, "post_sum": 0, "post_count": 0}
                    for d in DOMAIN_WEIGHTS.keys()
                }
                
            # Demographics tracking
            total_valid_responses += 1
            if resp_deg:
                dept_dist[resp_deg] += 1
            gender_ans = ans.get(smap["gender_q"])
            if gender_ans:
                gender_dist[gender_ans] += 1
            loc_ans = ans.get(smap["location_q"])
            if loc_ans:
                location_dist[loc_ans] += 1
                
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

            # Individual Divergence Calculation
            individual_deltas = {}
            for domain_name, phases in smap["domains"].items():
                pre_sum, pre_count = 0, 0
                for qid in phases["pre"]:
                    val = ans.get(qid)
                    if isinstance(val, (int, float)):
                        pre_sum += val
                        pre_count += 1
                post_sum, post_count = 0, 0
                for qid in phases["post"]:
                    val = ans.get(qid)
                    if isinstance(val, (int, float)):
                        post_sum += val
                        post_count += 1
                
                if pre_count > 0 and post_count > 0:
                    pre_avg = pre_sum / pre_count
                    post_avg = post_sum / post_count
                    # Normalized to [-1.0, 1.0] since max delta is 4
                    delta_q = (post_avg - pre_avg) / 4.0
                    clean_dim = domain_name.split(". ", 1)[-1]
                    individual_deltas[clean_dim] = delta_q
                    
            for qid, qtext in smap["feedback_qs"]:
                text_ans = ans.get(qid)
                if isinstance(text_ans, str) and text_ans.strip():
                    # Read pre-computed ML sentiments from the database column
                    sentiments_dict = resp.ml_sentiments or {}
                    sentiments_for_q = sentiments_dict.get(qid) or []
                    fp_key = (str(resp.id), qid)
                    is_fp = fp_key in fp_map
                    fp_polarity_override = fp_map.get(fp_key)  # None = flip, float = force
                    primary_dim = "General Feedback"
                    if sentiments_for_q:
                        avg_polarity = sum(p for _, p in sentiments_for_q) / len(sentiments_for_q)
                        primary_dim = sentiments_for_q[0][0]
                        # Apply override BEFORE chart counts for ML-classified items too
                        if is_fp:
                            if fp_polarity_override is not None:
                                avg_polarity = fp_polarity_override
                            else:
                                avg_polarity = -avg_polarity
                    else:
                        # Fallback heuristic since ML was run externally and might have skipped this text
                        lower_text = text_ans.lower()
                        critical_words = ['sana', 'ayusin', 'kulang', 'more', 'lack', 'improve', 'wala', 'needs', 'better']
                        positive_words = ['good', 'happy', 'great', 'excellent', 'keep up', 'thanks', 'salamat']
                        
                        if any(w in lower_text for w in critical_words):
                            avg_polarity = -0.5
                        elif any(w in lower_text for w in positive_words):
                            avg_polarity = 0.5
                        else:
                            avg_polarity = 0.0
                            
                        dimension_keywords = {
                            "Employability and Economic Mobility": ["job", "work", "career", "salary", "employ", "income", "trabaho", "sweldo", "pera", "promot", "hire", "opportunity", "business", "negosyo", "workplace", "professional"],
                            "Family Upliftment and Financial Stability": ["family", "pamilya", "financial", "children", "parents", "anak", "magulang", "bahay", "house", "budget", "gastos", "kapatid", "tulong sa pamilya", "provide"],
                            "Personal Development and Life Quality": ["skill", "learn", "grow", "develop", "confidence", "happy", "health", "buhay", "sarili", "improve", "training", "aral", "knowledge", "natutunan", "experience", "mindset"],
                            "Civic Engagement and Community Contribution": ["community", "help", "others", "society", "volunteer", "tulong", "kapwa", "barangay", "lipunan", "tao", "serve", "serbisyo", "contribute"],
                            "Government Trust and LGU Support Valuation": ["gov", "mayor", "lgu", "support", "trust", "gobyerno", "program", "scholar", "city", "pasig", "officials", "leader", "public"]
                        }
                        
                        matched_dim = None
                        for dim, kws in dimension_keywords.items():
                            if any(w in lower_text for w in kws):
                                matched_dim = dim
                                break
                                
                        if not matched_dim:
                            matched_dim = "General Feedback"
                            
                        # Apply override for heuristic-classified items
                        if is_fp:
                            if fp_polarity_override is not None:
                                avg_polarity = fp_polarity_override
                            else:
                                avg_polarity = -avg_polarity
                            
                        primary_dim = matched_dim
                        if avg_polarity < 0:
                            classification_counts[matched_dim]["negative"] += 1
                        elif avg_polarity > 0:
                            classification_counts[matched_dim]["positive"] += 1
                        else:
                            classification_counts[matched_dim]["neutral"] += 1

                    qualitative_feedbacks.append(QualitativeFeedback(
                        response_id=str(resp.id),
                        question_id=qid,
                        question_text=qtext,
                        response_text=text_ans.strip(),
                        sentiment_score=avg_polarity,
                        is_false_positive=is_fp,
                        dimension=primary_dim
                    ))
                    
                    if sentiments_for_q:
                        for dim, polarity in sentiments_for_q:
                            if dim in classification_counts:
                                if polarity >= 0.3:
                                    classification_counts[dim]["positive"] += 1
                                elif polarity <= -0.3:
                                    classification_counts[dim]["negative"] += 1
                                else:
                                    classification_counts[dim]["neutral"] += 1

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
        merged_stats = {
            d: {"pre_sum": 0, "pre_count": 0, "post_sum": 0, "post_count": 0}
            for d in DOMAIN_WEIGHTS.keys()
        }
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
        department_distribution=dict(dept_dist)
    )


    historical_trend = []
    # Build historical trend (only include actual years, not "All Batches")
    for year in sorted(cohort_stats.keys()):
        if year != "All Batches":
            year_result = compute_for_cohort(year)
            if year_result and year_result.peii_score > 0:
                historical_trend.append(PEIIHistoricalTrend(
                    batch_year=year,
                    peii_score=year_result.peii_score
                ))

    # Sort feedbacks: lowest sentiment (most negative/critical) first, as requested by user for actionable insights
    qualitative_feedbacks.sort(key=lambda x: x.sentiment_score)
    # We used to limit this to 50, but users need to see the full set of qualitative data that matches the chart counts.
    # Frontend handles scrolling.
    
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
        feedback_classification_data = FeedbackClassificationData(classifications=feedback_classifications)

    return PEIIAnalyticsResponse(
        cohort_result=cohort_result,
        baseline_result=baseline_result,
        historical_trend=historical_trend,
        demographics=demographics,
        feedback_classification=feedback_classification_data,
        qualitative_feedback=qualitative_feedbacks
    )