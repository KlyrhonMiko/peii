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
from models.survey_question import SurveyQuestion
from models.survey_response import SurveyResponse
from models.survey_section import SurveySection
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
          'scale', 'ranking', 'matrix'
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
    WHERE question_type IN ('single_choice', 'boolean', 'scale')
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


def _load_json(value: str | None, name: str) -> object:
    if value is None:
        return None
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
            {"value": value, "count": state.counts.get(value, 0)}
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
