from uuid import UUID

from fastapi import APIRouter, Depends, Header, Response, status, BackgroundTasks
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
from services import response_service, survey_consent
from services.ml_service import analyze_response_background

router = APIRouter()


@router.get(
    "/{survey_id}",
    response_model=APIResponse[PublicSurvey],
    summary="Get Public Survey",
    description="Retrieve a survey by its ID for alumni to fill out.",
)
async def get_public_survey(
    survey_id: str,
    session: AsyncDBSession,
    respondent: CurrentGoogleSurveyRespondent,
) -> APIResponse[PublicSurvey]:
    await enforce_authenticated_survey_rate_limit(
        "public-read",
        respondent.auth_user_id,
        respondent.session_id,
        str(survey_id),
    )
    from services.survey_service import resolve_survey
    try:
        survey = await resolve_survey(session, survey_id)
    except AppError:
        raise AppError("Survey not found or no longer active.", status_code=status.HTTP_404_NOT_FOUND)

    if survey.status != "Active":
        raise AppError("Survey not found or no longer active.", status_code=status.HTTP_404_NOT_FOUND)

    # Load sections with nested questions
    sections_result = await session.exec(
        select(SurveySection)
        .where(
            col(SurveySection.survey_id) == survey.id,
            col(SurveySection.is_deleted).is_(False),
        )
        .order_by(col(SurveySection.order_index), col(SurveySection.id))
    )
    sections = list(sections_result.all())
    if not sections:
        raise AppError("Survey is not properly configured.", status_code=status.HTTP_404_NOT_FOUND)

    section_questions_by_section = []
    all_questions = {}
    for section in sections:
        questions_result = await session.exec(
            select(SurveyQuestion)
            .where(
                col(SurveyQuestion.section_id) == section.id,
                col(SurveyQuestion.survey_id) == survey.id,
                col(SurveyQuestion.is_deleted).is_(False),
            )
            .order_by(col(SurveyQuestion.order_index), col(SurveyQuestion.id))
        )
        section_questions = list(questions_result.all())
        section_questions_by_section.append((section, section_questions))
        all_questions.update({str(question.id): question for question in section_questions})

    phase_state = await response_service.get_public_survey_phase_state(
        session,
        survey.id,
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
    "/{survey_id}/respond",
    response_model=APIResponse[SurveyResponseAcknowledgement],
    status_code=status.HTTP_201_CREATED,
    summary="Submit Survey Response",
    description="Submit answers for a survey identified by survey ID.",
)
async def submit_response(
    survey_id: str,
    payload: SurveyResponseSubmit,
    session: AsyncDBSession,
    http_response: Response,
    respondent: CurrentGoogleSurveyRespondent,
    background_tasks: BackgroundTasks,
    idempotency_header: str | None = Header(default=None, alias="Idempotency-Key"),
) -> APIResponse[SurveyResponseAcknowledgement]:
    await enforce_authenticated_survey_rate_limit(
        "public-submit",
        respondent.auth_user_id,
        respondent.session_id,
        str(survey_id),
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
        str(survey_id),
        payload.answers,
        idempotency_key=idempotency_key,
        respondent=respondent,
        actor_id=settings.SYSTEM_ACTOR_ID,
        consent_version=payload.consent.version,
        withdrawal_code=payload.withdrawal_code,
    )
    if replayed:
        http_response.status_code = status.HTTP_200_OK
    
    background_tasks.add_task(analyze_response_background, str(_response.id))

    return success_response(
        SurveyResponseAcknowledgement(accepted=True),
        message="Response submitted.",
    )


@router.patch(
    "/{survey_id}/respond",
    response_model=APIResponse[SurveyResponseAcknowledgement],
    status_code=status.HTTP_200_OK,
    summary="Submit Survey Follow-up Response",
    description="Submit phase 2 answers for a survey identified by survey ID.",
)
async def submit_phase2_response(
    survey_id: str,
    payload: SurveyResponsePhase2Submit,
    session: AsyncDBSession,
    respondent: CurrentGoogleSurveyRespondent,
    background_tasks: BackgroundTasks,
    idempotency_header: str | None = Header(default=None, alias="Idempotency-Key"),
) -> APIResponse[SurveyResponseAcknowledgement]:
    await enforce_authenticated_survey_rate_limit(
        "public-submit",
        respondent.auth_user_id,
        respondent.session_id,
        str(survey_id),
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
        str(survey_id),
        payload.answers,
        idempotency_key=idempotency_key,
        respondent=respondent,
        actor_id=settings.SYSTEM_ACTOR_ID,
    )
    
    background_tasks.add_task(analyze_response_background, str(_response.id))

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
