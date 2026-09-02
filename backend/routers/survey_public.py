from uuid import UUID

from fastapi import APIRouter, Depends, Header, Response, status
from sqlmodel import col, select

from core.config import settings
from core.deps import AsyncDBSession, CurrentGoogleSurveyRespondent
from core.exceptions import AppError
from core.rate_limit import (
    enforce_authenticated_survey_rate_limit,
    public_survey_withdrawal_rate_limit,
)
from core.responses import success_response
from models.survey import Survey
from models.survey_question import SurveyQuestion
from models.survey_section import SurveySection
from schemas.common import APIResponse
from schemas.survey_public import PublicSurvey, PublicSurveyQuestion, PublicSurveySection
from schemas.survey_question import SurveyQuestionRead
from schemas.survey_response import (
    SurveyResponseAcknowledgement,
    SurveyResponsePhase2Submit,
    SurveyResponseSubmit,
    SurveyResponseWithdrawalRequest,
    SurveyResponseWithdrawalResult,
)
from services import distribution_service, response_service, survey_consent

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
    respondent: CurrentGoogleSurveyRespondent,
) -> APIResponse[PublicSurvey]:
    await enforce_authenticated_survey_rate_limit(
        "public-read",
        respondent.auth_user_id,
        respondent.session_id,
        token,
    )
    distribution = await distribution_service.get_distribution_by_token(session, token)

    survey_result = await session.exec(
        select(Survey).where(col(Survey.id) == distribution.survey_id)
    )
    survey = survey_result.first()
    if not survey:
        raise AppError("Survey not found.", status_code=status.HTTP_404_NOT_FOUND)

    # Load sections with nested questions
    sections_result = await session.exec(
        select(SurveySection)
        .where(
            col(SurveySection.survey_id) == distribution.survey_id,
            col(SurveySection.is_deleted).is_(False),
        )
        .order_by(col(SurveySection.order_index), col(SurveySection.id))
    )
    sections = list(sections_result.all())

    section_questions_by_section = []
    all_questions = {}
    for section in sections:
        questions_result = await session.exec(
            select(SurveyQuestion)
            .where(
                col(SurveyQuestion.section_id) == section.id,
                col(SurveyQuestion.survey_id) == distribution.survey_id,
                col(SurveyQuestion.is_deleted).is_(False),
            )
            .order_by(col(SurveyQuestion.order_index), col(SurveyQuestion.id))
        )
        section_questions = list(questions_result.all())
        section_questions_by_section.append((section, section_questions))
        all_questions.update({str(question.id): question for question in section_questions})

    phase_state = await response_service.get_public_survey_phase_state(
        session,
        distribution.survey_id,
        all_questions,
        respondent,
    )
    public_sections = []
    all_public_questions = []
    for section, section_questions in section_questions_by_section:
        section_q_list = []
        for q in section_questions:
            if phase_state.phase_aware and phase_state.visible_phase is not None:
                if phase_state.question_phases.get(str(q.id)) != phase_state.visible_phase:
                    continue
            elif phase_state.phase_aware:
                continue
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

        if not phase_state.phase_aware or section_q_list:
            public_sections.append(
                PublicSurveySection(
                    id=section.id,
                    title=section.title,
                    description=section.description,
                    order_index=section.order_index,
                    questions=section_q_list,
                )
            )

    public_survey = PublicSurvey(
        survey_id=survey.survey_id,
        title=survey.title,
        description=survey.description,
        questions=all_public_questions,
        sections=public_sections,
        consent=survey_consent.get_public_consent_policy(),
        collection_state=phase_state.collection_state,
        submission_phase=phase_state.submission_phase,
    )
    return success_response(public_survey)


@router.post(
    "/{token}/respond",
    response_model=APIResponse[SurveyResponseAcknowledgement],
    status_code=status.HTTP_201_CREATED,
    summary="Submit Survey Response",
    description="Submit answers for a survey identified by distribution token.",
)
async def submit_response(
    token: str,
    payload: SurveyResponseSubmit,
    session: AsyncDBSession,
    http_response: Response,
    respondent: CurrentGoogleSurveyRespondent,
    idempotency_header: str | None = Header(default=None, alias="Idempotency-Key"),
) -> APIResponse[SurveyResponseAcknowledgement]:
    await enforce_authenticated_survey_rate_limit(
        "public-submit",
        respondent.auth_user_id,
        respondent.session_id,
        token,
    )
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

    _response, replayed = await response_service.submit_response(
        session,
        token,
        payload.answers,
        idempotency_key=idempotency_key,
        respondent=respondent,
        actor_id=settings.SYSTEM_ACTOR_ID,
        consent_version=payload.consent.version,
        withdrawal_code=payload.withdrawal_code,
    )
    if replayed:
        http_response.status_code = status.HTTP_200_OK
    return success_response(
        SurveyResponseAcknowledgement(accepted=True),
        message="Response submitted.",
    )


@router.patch(
    "/{token}/respond",
    response_model=APIResponse[SurveyResponseAcknowledgement],
    status_code=status.HTTP_200_OK,
    summary="Submit Survey Follow-up Response",
    description="Submit phase 2 answers for a survey identified by distribution token.",
)
async def submit_phase2_response(
    token: str,
    payload: SurveyResponsePhase2Submit,
    session: AsyncDBSession,
    respondent: CurrentGoogleSurveyRespondent,
    idempotency_header: str | None = Header(default=None, alias="Idempotency-Key"),
) -> APIResponse[SurveyResponseAcknowledgement]:
    await enforce_authenticated_survey_rate_limit(
        "public-submit",
        respondent.auth_user_id,
        respondent.session_id,
        token,
    )
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

    _response, replayed = await response_service.submit_phase2_response(
        session,
        token,
        payload.answers,
        idempotency_key=idempotency_key,
        respondent=respondent,
        actor_id=settings.SYSTEM_ACTOR_ID,
    )
    return success_response(
        SurveyResponseAcknowledgement(accepted=True),
        message="Follow-up response submitted." if not replayed else "Response submitted.",
    )


@router.post(
    "/responses/withdraw",
    response_model=APIResponse[SurveyResponseWithdrawalResult],
    dependencies=[Depends(public_survey_withdrawal_rate_limit)],
    status_code=status.HTTP_200_OK,
    summary="Withdraw Survey Response",
    description="Withdraw a response using its respondent-held private code.",
)
async def withdraw_response(
    payload: SurveyResponseWithdrawalRequest,
    session: AsyncDBSession,
) -> APIResponse[SurveyResponseWithdrawalResult]:
    result = await response_service.withdraw_response(session, payload)
    return success_response(result, message="Response withdrawn.")
