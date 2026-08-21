from uuid import UUID

from fastapi import APIRouter, Header, Request, Response, status
from sqlmodel import col, select

from core.deps import AsyncDBSession
from core.exceptions import AppError
from core.responses import success_response
from models.survey import Survey
from models.survey_question import SurveyQuestion
from models.survey_section import SurveySection
from schemas.common import APIResponse
from schemas.survey_public import PublicSurvey, PublicSurveySection
from schemas.survey_question import SurveyQuestionRead
from schemas.survey_response import SurveyResponseRead, SurveyResponseSubmit
from services import distribution_service, response_service

router = APIRouter()


@router.get(
    "/{token}",
    response_model=APIResponse[PublicSurvey],
    summary="Get Public Survey",
    description="Retrieve a survey by its distribution token for alumni to fill out.",
)
async def get_public_survey(
    token: str,
    session: AsyncDBSession,
) -> APIResponse[PublicSurvey]:
    distribution = await distribution_service.get_distribution_by_token(session, token)

    survey_result = await session.exec(
        select(Survey).where(col(Survey.id) == distribution.survey_id)
    )
    survey = survey_result.first()
    if not survey:
        raise AppError("Survey not found.", status_code=status.HTTP_404_NOT_FOUND)

    from schemas.survey_public import PublicSurveyQuestion

    # Load sections with nested questions
    sections_result = await session.exec(
        select(SurveySection)
        .where(
            col(SurveySection.survey_id) == distribution.survey_id,
            col(SurveySection.version_id) == distribution.version_id,
            col(SurveySection.is_deleted).is_(False),
        )
        .order_by(col(SurveySection.order_index), col(SurveySection.id))
    )
    sections = list(sections_result.all())

    public_sections = []
    all_public_questions = []
    for section in sections:
        questions_result = await session.exec(
            select(SurveyQuestion)
            .where(
                col(SurveyQuestion.section_id) == section.id,
                col(SurveyQuestion.survey_id) == distribution.survey_id,
                col(SurveyQuestion.version_id) == distribution.version_id,
                col(SurveyQuestion.is_deleted).is_(False),
            )
            .order_by(col(SurveyQuestion.order_index), col(SurveyQuestion.id))
        )
        section_questions = list(questions_result.all())

        section_q_list = []
        for q in section_questions:
            q_read = SurveyQuestionRead.model_validate(q)
            pq = PublicSurveyQuestion(
                id=q_read.id,
                question_text=q_read.question_text,
                question_type=q_read.question_type,
                options=q_read.options,
                config=q_read.config,
                order_index=q_read.order_index,
                is_required=q_read.is_required,
            )
            section_q_list.append(pq)
            all_public_questions.append(pq)

        public_sections.append(PublicSurveySection(
            id=section.id,
            title=section.title,
            description=section.description,
            order_index=section.order_index,
            questions=section_q_list,
        ))

    public_survey = PublicSurvey(
        survey_id=survey.survey_id,
        title=survey.title,
        description=survey.description,
        questions=all_public_questions,
        sections=public_sections,
    )
    return success_response(public_survey)


@router.post(
    "/{token}/respond",
    response_model=APIResponse[SurveyResponseRead],
    status_code=status.HTTP_201_CREATED,
    summary="Submit Survey Response",
    description="Submit answers for a survey identified by distribution token.",
)
async def submit_response(
    token: str,
    payload: SurveyResponseSubmit,
    session: AsyncDBSession,
    request: Request,
    http_response: Response,
    idempotency_header: str | None = Header(default=None, alias="Idempotency-Key"),
) -> APIResponse[SurveyResponseRead]:
    ip_address = request.client.host if request.client else None
    idempotency_key = None
    if idempotency_header is None:
        raise AppError(
            "Idempotency-Key is required for response submissions.",
            status_code=status.HTTP_400_BAD_REQUEST,
        )
    try:
        idempotency_key = UUID(idempotency_header)
    except ValueError as exc:
        raise AppError(
            "Idempotency-Key must be a valid UUID.",
            status_code=status.HTTP_400_BAD_REQUEST,
        ) from exc

    response, replayed = await response_service.submit_response(
        session,
        token,
        payload.answers,
        idempotency_key=idempotency_key,
        ip_address=ip_address,
    )
    if replayed:
        http_response.status_code = status.HTTP_200_OK
    return success_response(
        SurveyResponseRead.model_validate(response),
        message="Response submitted.",
    )
