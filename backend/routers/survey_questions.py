from uuid import UUID

from fastapi import APIRouter, Request, status

from core.deps import AsyncDBSession
from core.responses import success_response
from schemas.common import APIResponse
from schemas.survey_question import (
    SurveyQuestionCreate,
    SurveyQuestionRead,
    SurveyQuestionReorder,
    SurveyQuestionUpdate,
)
from services import survey_question_service

router = APIRouter()


@router.get(
    "/",
    response_model=APIResponse[list[SurveyQuestionRead]],
    summary="List Questions",
    description="List all active questions for a survey, ordered by their index.",
)
async def list_questions(
    survey_id: UUID,
    session: AsyncDBSession,
) -> APIResponse[list[SurveyQuestionRead]]:
    questions = await survey_question_service.list_questions(session, survey_id)
    response_questions = [SurveyQuestionRead.model_validate(q) for q in questions]
    return success_response(response_questions)


@router.post(
    "/",
    response_model=APIResponse[SurveyQuestionRead],
    status_code=status.HTTP_201_CREATED,
    summary="Create Question",
    description="Add a new question to a survey.",
)
async def create_question(
    survey_id: UUID,
    payload: SurveyQuestionCreate,
    session: AsyncDBSession,
    request: Request,
) -> APIResponse[SurveyQuestionRead]:
    ip_address = request.client.host if request.client else None
    question = await survey_question_service.create_question(
        session, survey_id, payload, ip_address=ip_address
    )
    return success_response(
        SurveyQuestionRead.model_validate(question),
        message="Question created.",
    )


@router.patch(
    "/reorder",
    response_model=APIResponse[list[SurveyQuestionRead]],
    summary="Reorder Questions",
    description="Reorder questions for a survey by providing an ordered list of question IDs.",
)
async def reorder_questions(
    survey_id: UUID,
    payload: SurveyQuestionReorder,
    session: AsyncDBSession,
    request: Request,
) -> APIResponse[list[SurveyQuestionRead]]:
    ip_address = request.client.host if request.client else None
    questions = await survey_question_service.reorder_questions(
        session,
        survey_id,
        payload.question_ids,
        ip_address=ip_address,
    )
    return success_response(
        [SurveyQuestionRead.model_validate(q) for q in questions],
        message="Questions reordered.",
    )


@router.patch(
    "/{question_id}",
    response_model=APIResponse[SurveyQuestionRead],
    summary="Update Question",
    description="Partially update a survey question.",
)
async def update_question(
    survey_id: UUID,
    question_id: UUID,
    payload: SurveyQuestionUpdate,
    session: AsyncDBSession,
    request: Request,
) -> APIResponse[SurveyQuestionRead]:
    ip_address = request.client.host if request.client else None
    question = await survey_question_service.update_question(
        session, survey_id, question_id, payload, ip_address=ip_address
    )
    return success_response(
        SurveyQuestionRead.model_validate(question),
        message="Question updated.",
    )


@router.delete(
    "/{question_id}",
    response_model=APIResponse[SurveyQuestionRead],
    summary="Delete Question",
    description="Soft delete a survey question.",
)
async def delete_question(
    survey_id: UUID,
    question_id: UUID,
    session: AsyncDBSession,
    request: Request,
) -> APIResponse[SurveyQuestionRead]:
    ip_address = request.client.host if request.client else None
    question = await survey_question_service.delete_question(
        session, survey_id, question_id, ip_address=ip_address
    )
    return success_response(
        SurveyQuestionRead.model_validate(question),
        message="Question deleted.",
    )
