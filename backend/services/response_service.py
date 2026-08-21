import json
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
from utils.sorting import stable_order_by


def _is_blank_answer(value: object) -> bool:
    return value is None or value == "" or value == []


def _validate_answer(question: SurveyQuestion, answer: object) -> None:
    options = json.loads(question.options) if question.options else None
    question_type = question.question_type

    if question_type in {QuestionType.SINGLE_CHOICE, QuestionType.BOOLEAN}:
        if not isinstance(answer, (str, bool)):
            raise ValueError("must be a string or boolean")
        if options and answer not in options:
            raise ValueError("is not one of the configured options")
    elif question_type == QuestionType.MULTIPLE_CHOICE:
        if not isinstance(answer, list) or not all(isinstance(item, str) for item in answer):
            raise ValueError("must be a list of strings")
        if options and any(item not in options for item in answer):
            raise ValueError("contains an option that is not configured")
    elif question_type in {QuestionType.NUMBER, QuestionType.SCALE}:
        if not isinstance(answer, (int, float)) or isinstance(answer, bool):
            raise ValueError("must be a number")
        config = json.loads(question.config) if question.config else {}
        minimum = config.get("min") if isinstance(config, dict) else None
        maximum = config.get("max") if isinstance(config, dict) else None
        if minimum is not None and answer < minimum:
            raise ValueError("is below the configured minimum")
        if maximum is not None and answer > maximum:
            raise ValueError("is above the configured maximum")
    elif question_type == QuestionType.RANKING:
        if not isinstance(answer, list) or not all(isinstance(item, str) for item in answer):
            raise ValueError("must be an ordered list of strings")
        if options and set(answer) != set(options):
            raise ValueError("must contain each configured option exactly once")
    elif question_type == QuestionType.MATRIX:
        if not isinstance(answer, dict):
            raise ValueError("must be an object keyed by matrix row")
        if options and set(answer) != set(options):
            raise ValueError("must contain an answer for every configured row")
    elif question_type in {
        QuestionType.TEXT,
        QuestionType.DATETIME,
        QuestionType.FILE,
    }:
        if not isinstance(answer, str):
            raise ValueError("must be a string")


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

    unknown_keys = sorted(set(answers) - set(questions))
    if unknown_keys:
        raise AppError(
            "Answers contain questions that do not belong to this survey.",
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        )

    for question_id, question in questions.items():
        if question.is_required and (
            question_id not in answers or _is_blank_answer(answers[question_id])
        ):
            raise AppError(
                "All required questions must be answered.",
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            )
        if question_id not in answers:
            continue
        try:
            _validate_answer(question, answers[question_id])
        except (TypeError, ValueError, json.JSONDecodeError) as exc:
            raise AppError(
                f"Answer for question {question_id} is invalid: {exc}",
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            ) from exc


async def submit_response(
    session: AsyncSession,
    token: str,
    answers: dict[str, object],
    ip_address: str | None = None,
) -> SurveyResponse:
    distribution = await get_distribution_by_token(session, token, for_update=True)

    answers_json = json.dumps(answers)
    if len(answers_json) > 10000:
        raise AppError(
            "Answers payload exceeds the maximum allowed size.",
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        )

    survey_result = await session.exec(
        select(Survey).where(col(Survey.id) == distribution.survey_id).with_for_update()
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
        answers=answers_json,
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
    return response


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
