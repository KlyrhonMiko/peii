import hashlib
import json
import math
from datetime import date
from uuid import UUID

from fastapi import status
from sqlalchemy import func, update
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from core.exceptions import AppError
from models.question_type import QuestionType
from models.survey import Survey
from models.survey_question import SurveyQuestion
from models.survey_response import SurveyResponse
from models.survey_section import SurveySection
from schemas.survey_response import SurveyResponseListQueryParams
from services.audit_service import AuditEvent, commit_with_audit
from services.distribution_service import get_distribution_by_token
from services.question_validation import (
    get_matrix_columns,
    get_scale_bounds,
    validate_question_definition,
)
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
            isinstance(row, str) and isinstance(value, str)
            for row, value in answer.items()
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
    version_id: UUID,
    answers: dict[str, object],
) -> None:
    questions_result = await session.exec(
        select(SurveyQuestion)
        .join(SurveySection, col(SurveySection.id) == SurveyQuestion.section_id)
        .where(
            col(SurveyQuestion.survey_id) == survey_id,
            col(SurveyQuestion.version_id) == version_id,
            col(SurveySection.survey_id) == survey_id,
            col(SurveySection.version_id) == version_id,
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
            "message": "Question does not belong to this survey version.",
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

    distribution = await get_distribution_by_token(
        session,
        token,
        for_update=True,
        shared_lock=True,
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

    survey_result = await session.exec(
        select(Survey)
        .where(col(Survey.id) == distribution.survey_id)
        .with_for_update(read=True)
    )
    survey = survey_result.first()
    if not survey or survey.is_deleted or survey.status != "Active":
        raise AppError(
            "Survey not found or no longer active.", status_code=status.HTTP_404_NOT_FOUND
        )

    await _validate_answers(session, distribution.survey_id, distribution.version_id, answers)

    response = SurveyResponse(
        survey_id=distribution.survey_id,
        version_id=distribution.version_id,
        distribution_id=distribution.id,
        idempotency_key=idempotency_key,
        idempotency_hash=answers_hash,
        answers=answers,
    )
    session.add(response)
    await session.exec(
        update(Survey)
        .where(col(Survey.id) == survey.id)
        .values(responses_count=col(Survey.responses_count) + 1)
    )

    await commit_with_audit(
        session,
        [
            AuditEvent(
                action="create",
                resource_type="survey_response",
                resource_id=str(response.id),
                ip_address=ip_address,
            )
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

    statement = select(SurveyResponse).where(col(SurveyResponse.survey_id) == survey_id)

    total_statement = (
        select(func.count())
        .select_from(SurveyResponse)
        .where(col(SurveyResponse.survey_id) == survey_id)
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
