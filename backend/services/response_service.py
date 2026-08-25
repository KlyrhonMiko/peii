import csv
import hashlib
import io
import json
import math
from collections import Counter
from dataclasses import dataclass
from datetime import date
from typing import cast
from uuid import UUID

from fastapi import status
from sqlalchemy import func, update
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from core.exceptions import AppError
from models.question_type import QuestionType
from models.survey import Survey
from models.survey_question import SurveyQuestion
from models.survey_response import ResponseErasureReceipt, SurveyResponse
from models.survey_section import SurveySection
from schemas.survey_response import (
    AggregateCell,
    AggregateQuestionType,
    EraseAllResponses,
    EraseSelectedResponses,
    ResponseErasureResult,
    SurveyResponseAggregate,
    SurveyResponseListQueryParams,
)
from services import survey_privacy
from services.audit_service import AuditEvent, commit_with_audit
from services.base_service import utc_now
from services.distribution_service import get_distribution_and_survey_by_token
from services.question_validation import (
    get_matrix_columns,
    get_scale_bounds,
    validate_question_definition,
)
from services.survey_service import resolve_survey
from utils.sorting import stable_order_by


def _is_blank_answer(value: object) -> bool:
    return (
        value is None
        or (isinstance(value, str) and not value.strip())
        or value == []
        or value == {}
    )


def _load_json(value: str | None, name: str) -> object:
    if value is None:
        return None
    try:
        return json.loads(value)
    except json.JSONDecodeError as exc:
        raise ValueError(f"stored {name} is invalid") from exc


def _validate_answer(question: SurveyQuestion, answer: object) -> None:
    options = _load_json(question.options, "options")
    config = _load_json(question.config, "config")
    validate_question_definition(question.question_type, options, config)
    question_type = question.question_type
    option_values = options if isinstance(options, list) else []

    if question_type == QuestionType.SINGLE_CHOICE:
        if not isinstance(answer, str):
            raise ValueError("must be a string")
        if answer not in option_values:
            raise ValueError("is not one of the configured options")
    elif question_type == QuestionType.BOOLEAN:
        if not isinstance(answer, bool):
            raise ValueError("must be a boolean")
    elif question_type == QuestionType.MULTIPLE_CHOICE:
        if not isinstance(answer, list) or not all(isinstance(item, str) for item in answer):
            raise ValueError("must be a list of strings")
        if len(answer) != len(set(answer)):
            raise ValueError("must not contain duplicate options")
        if any(item not in option_values for item in answer):
            raise ValueError("contains an option that is not configured")
    elif question_type in {QuestionType.NUMBER, QuestionType.SCALE}:
        if not isinstance(answer, (int, float)) or isinstance(answer, bool):
            raise ValueError("must be a number")
        if not math.isfinite(answer):
            raise ValueError("must be finite")
        if question_type == QuestionType.SCALE and not isinstance(answer, int):
            raise ValueError("must be an integer")
        normalized_config = config if isinstance(config, dict) else {}
        minimum: int | float | None
        maximum: int | float | None
        if question_type == QuestionType.SCALE:
            scale_options = options if isinstance(options, list) else None
            minimum, maximum = get_scale_bounds(scale_options, normalized_config)
        else:
            minimum = normalized_config.get("min")
            maximum = normalized_config.get("max")
            if normalized_config.get("integer") is True and not isinstance(answer, int):
                raise ValueError("must be an integer")
            step = normalized_config.get("step")
            if step is not None and minimum is not None:
                if not math.isclose((answer - minimum) / step % 1, 0.0, abs_tol=1e-9):
                    raise ValueError("does not match the configured step")
        if minimum is not None and answer < minimum:
            raise ValueError("is below the configured minimum")
        if maximum is not None and answer > maximum:
            raise ValueError("is above the configured maximum")
    elif question_type == QuestionType.RANKING:
        if not isinstance(answer, list) or not all(isinstance(item, str) for item in answer):
            raise ValueError("must be an ordered list of strings")
        if len(answer) != len(set(answer)) or set(answer) != set(option_values):
            raise ValueError("must contain each configured option exactly once")
    elif question_type == QuestionType.MATRIX:
        if not isinstance(answer, dict):
            raise ValueError("must be an object keyed by matrix row")
        if not isinstance(options, list) or set(answer) != set(option_values):
            raise ValueError("must contain an answer for every configured row")
        columns = get_matrix_columns(config if isinstance(config, dict) else None)
        if not all(
            isinstance(row, str) and isinstance(value, str) for row, value in answer.items()
        ):
            raise ValueError("must contain string answers for every matrix row")
        if any(value not in columns for value in answer.values()):
            raise ValueError("contains a matrix answer that is not configured")
    elif question_type in {
        QuestionType.TEXT,
        QuestionType.DATETIME,
        QuestionType.FILE,
    }:
        if not isinstance(answer, str):
            raise ValueError("must be a string")
        if question_type == QuestionType.TEXT:
            max_length = (config or {}).get("max_length") if isinstance(config, dict) else None
            if max_length is not None and len(answer) > max_length:
                raise ValueError("exceeds the configured maximum length")
        elif question_type == QuestionType.DATETIME:
            try:
                date.fromisoformat(answer)
            except ValueError as exc:
                raise ValueError("must be an ISO date") from exc


async def _validate_answers(
    session: AsyncSession,
    survey_id: UUID,
    answers: dict[str, object],
) -> None:
    questions_result = await session.exec(
        select(SurveyQuestion)
        .join(SurveySection, col(SurveySection.id) == SurveyQuestion.section_id)
        .where(
            col(SurveyQuestion.survey_id) == survey_id,
            col(SurveySection.survey_id) == survey_id,
            col(SurveySection.is_deleted).is_(False),
            col(SurveyQuestion.is_deleted).is_(False),
        )
    )
    questions = {str(question.id): question for question in questions_result.all()}

    validation_errors: list[dict[str, str]] = []
    unknown_keys = sorted(set(answers) - set(questions))
    validation_errors.extend(
        {
            "question_id": question_id,
            "code": "unknown_question",
            "message": "Question does not belong to this survey.",
        }
        for question_id in unknown_keys
    )

    for question_id, question in questions.items():
        if question.is_required and (
            question_id not in answers or _is_blank_answer(answers[question_id])
        ):
            validation_errors.append(
                {
                    "question_id": question_id,
                    "code": "required",
                    "message": "This question is required.",
                }
            )
            continue
        if question_id not in answers:
            continue
        try:
            if _is_blank_answer(answers[question_id]) and not question.is_required:
                continue
            _validate_answer(question, answers[question_id])
        except (TypeError, ValueError, json.JSONDecodeError) as exc:
            validation_errors.append(
                {
                    "question_id": question_id,
                    "code": "invalid_answer",
                    "message": str(exc),
                }
            )

    if validation_errors:
        raise AppError(
            "Response answers are invalid.",
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            errors=validation_errors,
        )


async def submit_response(
    session: AsyncSession,
    token: str,
    answers: dict[str, object],
    actor_id: UUID,
    idempotency_key: UUID | None = None,
    ip_address: str | None = None,
) -> tuple[SurveyResponse, bool]:
    try:
        answers_json = json.dumps(answers, allow_nan=False)
    except (TypeError, ValueError) as exc:
        raise AppError(
            "Answers contain values that cannot be stored as JSON.",
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        ) from exc
    if len(answers_json) > 10000:
        raise AppError(
            "Answers payload exceeds the maximum allowed size.",
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        )

    # Resolve the token reference without a lock, then acquire the survey's
    # exclusive lock before locking and revalidating its distribution.
    distribution, survey = await get_distribution_and_survey_by_token(
        session,
        token,
        for_update=True,
        shared_lock=False,
    )

    answers_hash = None
    if idempotency_key is not None:
        answers_hash = hashlib.sha256(
            json.dumps(answers, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()
        ).hexdigest()
        existing_result = await session.exec(
            select(SurveyResponse).where(
                col(SurveyResponse.distribution_id) == distribution.id,
                col(SurveyResponse.idempotency_key) == idempotency_key,
            )
        )
        existing = existing_result.first()
        if existing is not None:
            if existing.idempotency_hash != answers_hash:
                raise AppError(
                    "Idempotency-Key was already used with different answers.",
                    status_code=status.HTTP_409_CONFLICT,
                )
            return existing, True

    if survey.is_deleted or survey.status != "Active":
        raise AppError(
            "Survey not found or no longer active.", status_code=status.HTTP_404_NOT_FOUND
        )

    await _validate_answers(session, distribution.survey_id, answers)

    response = SurveyResponse(
        survey_id=distribution.survey_id,
        distribution_id=distribution.id,
        idempotency_key=idempotency_key,
        idempotency_hash=answers_hash,
        answers=answers,
        performed_by=actor_id,
    )
    session.add(response)
    await session.exec(
        update(Survey)
        .where(col(Survey.id) == survey.id)
        .values(
            responses_count=col(Survey.responses_count) + 1,
            performed_by=actor_id,
            updated_at=utc_now(),
        )
    )

    await commit_with_audit(
        session,
        [
            AuditEvent(
                action="create",
                resource_type="survey_response",
                resource_id=str(response.id),
                performed_by=actor_id,
                changes={"distribution_id": str(distribution.id)},
                ip_address=ip_address,
            ),
            AuditEvent(
                action="response_submitted",
                resource_type="survey",
                resource_id=survey.survey_id,
                performed_by=actor_id,
                changes={"response_id": str(response.id)},
                ip_address=ip_address,
            ),
        ],
    )
    await session.refresh(response)
    return response, False


async def list_responses(
    session: AsyncSession,
    survey_id: UUID,
    params: SurveyResponseListQueryParams,
) -> tuple[list[SurveyResponse], int]:
    survey_result = await session.exec(
        select(Survey).where(
            col(Survey.id) == survey_id,
            col(Survey.is_deleted).is_(False),
        )
    )
    if survey_result.first() is None:
        raise AppError("Survey not found.", status_code=status.HTTP_404_NOT_FOUND)

    statement = select(SurveyResponse).where(
        col(SurveyResponse.survey_id) == survey_id,
        col(SurveyResponse.is_deleted).is_(False),
    )

    total_statement = (
        select(func.count())
        .select_from(SurveyResponse)
        .where(
            col(SurveyResponse.survey_id) == survey_id,
            col(SurveyResponse.is_deleted).is_(False),
        )
    )
    total_result = await session.exec(total_statement)
    total = total_result.one()

    sort_columns = {
        "created_at": SurveyResponse.created_at,
    }
    sort_column = sort_columns.get(params.sort_by, SurveyResponse.created_at)
    statement = stable_order_by(
        statement,
        sort_column,
        sort_order=params.sort_order,
        id_column=SurveyResponse.id,
    )
    statement = statement.offset(params.offset).limit(params.limit)
    result = await session.exec(statement)
    rows = list(result.all())
    return rows, total


_AGGREGATE_TYPES = {
    QuestionType.SINGLE_CHOICE,
    QuestionType.BOOLEAN,
    QuestionType.MULTIPLE_CHOICE,
    QuestionType.SCALE,
    QuestionType.RANKING,
    QuestionType.MATRIX,
}
_AGGREGATE_BATCH_SIZE = 1000


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


@dataclass
class _AggregateState:
    question: SurveyQuestion
    question_type: QuestionType
    options: list[object]
    config: dict[str, object]
    counts: Counter[object]
    total: int = 0


def _new_aggregate_state(question: SurveyQuestion) -> _AggregateState:
    question_type = QuestionType(question.question_type)
    options = _load_json(question.options, "options")
    config = _load_json(question.config, "config")
    normalized_options = options if isinstance(options, list) else []
    normalized_config = config if isinstance(config, dict) else {}
    counts: Counter[object] = Counter()
    state = _AggregateState(
        question=question,
        question_type=question_type,
        options=normalized_options,
        config=normalized_config,
        counts=counts,
    )
    if question_type in {
        QuestionType.SINGLE_CHOICE,
        QuestionType.MULTIPLE_CHOICE,
    }:
        for option in normalized_options:
            state.counts[option] = 0
    elif question_type == QuestionType.BOOLEAN:
        state.counts[False] = 0
        state.counts[True] = 0
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
            state.counts[scale_value] = 0
    elif question_type == QuestionType.RANKING:
        for rank in range(1, len(normalized_options) + 1):
            for option in normalized_options:
                state.counts[(option, rank)] = 0
    else:
        columns = get_matrix_columns(normalized_config)
        for row in normalized_options:
            for matrix_value in columns:
                state.counts[(row, matrix_value)] = 0
    return state


def _accumulate_aggregate_answer(state: _AggregateState, answer: object) -> None:
    if _is_blank_answer(answer):
        return
    state.total += 1
    question_type = state.question_type

    if question_type in {
        QuestionType.SINGLE_CHOICE,
        QuestionType.BOOLEAN,
        QuestionType.MULTIPLE_CHOICE,
    }:
        if question_type == QuestionType.MULTIPLE_CHOICE:
            if isinstance(answer, list):
                for item in answer:
                    try:
                        if item in state.counts:
                            state.counts[item] += 1
                    except TypeError:
                        continue
        else:
            try:
                if answer in state.counts:
                    state.counts[answer] += 1
            except TypeError:
                pass
    elif question_type == QuestionType.SCALE:
        try:
            if answer in state.counts:
                state.counts[answer] += 1
        except TypeError:
            pass
    elif question_type == QuestionType.RANKING:
        if isinstance(answer, list):
            for rank, value in enumerate(answer, start=1):
                try:
                    if (value, rank) in state.counts:
                        state.counts[(value, rank)] += 1
                except TypeError:
                    continue
    else:
        if isinstance(answer, dict):
            for row, value in answer.items():
                try:
                    if (row, value) in state.counts:
                        state.counts[(row, value)] += 1
                except TypeError:
                    continue


def _aggregate_cells(state: _AggregateState) -> list[dict[str, object]]:
    question_type = state.question_type
    if question_type in {
        QuestionType.SINGLE_CHOICE,
        QuestionType.MULTIPLE_CHOICE,
    }:
        return [
            {"value": option, "count": state.counts.get(option, 0)}
            for option in state.options
        ]
    if question_type == QuestionType.BOOLEAN:
        return [
            {"value": value, "count": state.counts.get(value, 0)}
            for value in (False, True)
        ]
    if question_type == QuestionType.SCALE:
        scale_options = (
            state.options
            if all(isinstance(item, str) for item in state.options)
            else None
        )
        minimum, maximum = get_scale_bounds(
            cast(list[str] | None, scale_options),
            state.config,
        )
        return [
            {"value": value, "count": state.counts.get(value, 0)}
            for value in range(minimum, maximum + 1)
        ]
    if question_type == QuestionType.RANKING:
        return [
            {
                "value": value,
                "rank": rank,
                "count": state.counts.get((value, rank), 0),
            }
            for rank in range(1, len(state.options) + 1)
            for value in state.options
        ]
    columns = get_matrix_columns(state.config)
    return [
        {"row": row, "value": value, "count": state.counts.get((row, value), 0)}
        for row in state.options
        for value in columns
    ]


def _finalize_aggregate(state: _AggregateState) -> SurveyResponseAggregate | None:
    cells = _aggregate_cells(state)

    if state.total < survey_privacy.RESPONSE_COUNT_PRIVACY_THRESHOLD or any(
        0 < cast(int, cell["count"]) < survey_privacy.RESPONSE_COUNT_PRIVACY_THRESHOLD
        for cell in cells
    ):
        return None
    return SurveyResponseAggregate(
        question_id=state.question.id,
        question_text=state.question.question_text,
        question_type=cast(AggregateQuestionType, state.question_type.value),
        total=state.total,
        cells=[AggregateCell.model_validate(cell) for cell in cells],
    )


async def aggregate_responses(
    session: AsyncSession, survey_id: UUID
) -> list[SurveyResponseAggregate]:
    await resolve_survey(session, survey_id)
    questions = await _load_aggregate_questions(session, survey_id)
    states = {
        str(question.id): _new_aggregate_state(question) for question in questions
    }
    if not states:
        return []

    responses_statement = select(SurveyResponse.answers).where(
        col(SurveyResponse.survey_id) == survey_id,
        col(SurveyResponse.is_deleted).is_(False),
    ).order_by(col(SurveyResponse.id))
    answers_result = await session.stream(responses_statement)
    try:
        async for answer_batch in answers_result.scalars().partitions(_AGGREGATE_BATCH_SIZE):
            for answers in answer_batch:
                if not isinstance(answers, dict):
                    continue
                for question_id, answer in answers.items():
                    state = states.get(question_id)
                    if state is not None:
                        _accumulate_aggregate_answer(state, answer)
    finally:
        await answers_result.close()

    aggregates: list[SurveyResponseAggregate] = []
    for question in questions:
        aggregate = _finalize_aggregate(states[str(question.id)])
        if aggregate is not None:
            aggregates.append(aggregate)
    return aggregates


def _safe_csv_text(value: object) -> str:
    text = str(value).replace("\x00", "\ufffd")
    formula_candidate = text.lstrip()
    if formula_candidate.startswith(("=", "+", "-", "@")) or text.lstrip(" ").startswith(
        ("\t", "\r", "\n")
    ):
        return "'" + text
    return text


async def export_responses(
    session: AsyncSession,
    survey_id: UUID,
    actor_id: UUID,
    ip_address: str | None = None,
) -> str:
    survey = await resolve_survey(session, survey_id)
    responses_result = await session.exec(
        select(SurveyResponse)
        .where(
            col(SurveyResponse.survey_id) == survey_id,
            col(SurveyResponse.is_deleted).is_(False),
        )
        .order_by(col(SurveyResponse.id))
        .limit(10001)
    )
    responses = list(responses_result.all())
    if len(responses) > 10000:
        raise AppError(
            "Response export is limited to 10,000 responses.",
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
        )
    all_questions_result = await session.exec(
        select(SurveyQuestion)
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
    questions = list(all_questions_result.all())

    output = io.StringIO(newline="")
    writer = csv.writer(output, lineterminator="\n")
    answer_row_count = 0
    writer.writerow(
        [
            "response_id",
            "submitted_at",
            "question_id",
            "question_text",
            "question_type",
            "answer_json",
        ]
    )
    for response in responses:
        for question in questions:
            question_id = str(question.id)
            if question_id not in response.answers:
                continue
            answer_row_count += 1
            answer_json = json.dumps(
                response.answers[question_id],
                sort_keys=True,
                separators=(",", ":"),
                ensure_ascii=False,
                allow_nan=False,
            )
            writer.writerow(
                [
                    _safe_csv_text(response.id),
                    _safe_csv_text(response.created_at.isoformat()),
                    _safe_csv_text(question.id),
                    _safe_csv_text(question.question_text),
                    _safe_csv_text(question.question_type),
                    _safe_csv_text(answer_json),
                ]
            )

    await commit_with_audit(
        session,
        [
            AuditEvent(
                action="export",
                resource_type="survey_response",
                resource_id=survey.survey_id,
                performed_by=actor_id,
                changes={
                    "response_count": len(responses),
                    "answer_row_count": answer_row_count,
                },
                ip_address=ip_address,
            )
        ],
    )
    return output.getvalue()


def _erasure_request_hash(
    payload: EraseSelectedResponses | EraseAllResponses,
) -> str:
    data = payload.model_dump(mode="json")
    if isinstance(payload, EraseSelectedResponses):
        data["response_ids"] = sorted(data["response_ids"])
    return hashlib.sha256(
        json.dumps(data, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


async def erase_responses(
    session: AsyncSession,
    survey_id: UUID,
    payload: EraseSelectedResponses | EraseAllResponses,
    idempotency_key: UUID,
    actor_id: UUID,
    ip_address: str | None = None,
) -> ResponseErasureResult:
    survey = await resolve_survey(
        session, survey_id, include_deleted=True, for_update=True
    )
    request_hash = _erasure_request_hash(payload)
    receipt_result = await session.exec(
        select(ResponseErasureReceipt).where(
            col(ResponseErasureReceipt.survey_id) == survey_id,
            col(ResponseErasureReceipt.idempotency_key) == idempotency_key,
        )
    )
    receipt = receipt_result.first()
    if receipt is not None:
        if receipt.request_hash != request_hash:
            raise AppError(
                "Idempotency-Key was already used with a different erasure request.",
                status_code=status.HTTP_409_CONFLICT,
            )
        return ResponseErasureResult.model_validate(
            {
                "scope": receipt.scope,
                "requested_count": receipt.requested_count,
                "erased_count": receipt.erased_count,
            }
        )

    if isinstance(payload, EraseAllResponses) and not survey.is_deleted:
        raise AppError(
            "All responses can only be erased after the survey is archived.",
            status_code=status.HTTP_409_CONFLICT,
        )

    response_statement = select(SurveyResponse).where(
        col(SurveyResponse.survey_id) == survey_id
    )
    if isinstance(payload, EraseSelectedResponses):
        response_statement = response_statement.where(
            col(SurveyResponse.id).in_(payload.response_ids)
        )
    response_statement = response_statement.order_by(col(SurveyResponse.id)).with_for_update()
    responses_result = await session.exec(response_statement)
    responses = list(responses_result.all())

    if isinstance(payload, EraseSelectedResponses):
        if len(responses) != len(payload.response_ids):
            raise AppError(
                "One or more selected responses do not belong to this survey.",
                status_code=status.HTTP_404_NOT_FOUND,
            )
        if any(response.is_deleted for response in responses):
            raise AppError(
                "One or more selected responses have already been erased.",
                status_code=status.HTTP_409_CONFLICT,
            )
        requested_count = len(payload.response_ids)
    else:
        requested_count = payload.expected_response_count
        live_count = sum(not response.is_deleted for response in responses)
        if requested_count != live_count or survey.responses_count != requested_count:
            raise AppError(
                "The expected response count does not match the archived survey.",
                status_code=status.HTTP_409_CONFLICT,
            )

    now = utc_now()
    erased_count = 0
    for response in responses:
        if response.is_deleted:
            continue
        response.answers = {}
        response.distribution_id = None
        response.idempotency_key = None
        response.idempotency_hash = None
        response.is_deleted = True
        response.deleted_at = now
        response.updated_at = now
        response.performed_by = actor_id
        session.add(response)
        erased_count += 1

    survey.responses_count = max(0, survey.responses_count - erased_count)
    survey.updated_at = now
    survey.performed_by = actor_id
    session.add(survey)
    receipt = ResponseErasureReceipt(
        survey_id=survey_id,
        idempotency_key=idempotency_key,
        request_hash=request_hash,
        scope=payload.scope,
        requested_count=requested_count,
        erased_count=erased_count,
        performed_by=actor_id,
    )
    session.add(receipt)
    await commit_with_audit(
        session,
        [
            AuditEvent(
                action="erase",
                resource_type="survey_response_batch",
                resource_id=str(survey_id),
                performed_by=actor_id,
                changes={
                    "scope": payload.scope,
                    "requested_count": requested_count,
                    "erased_count": erased_count,
                },
                ip_address=ip_address,
            )
        ],
    )
    return ResponseErasureResult(
        scope=payload.scope,
        requested_count=requested_count,
        erased_count=erased_count,
    )
