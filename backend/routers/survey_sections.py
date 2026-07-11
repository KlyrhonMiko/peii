from uuid import UUID

from fastapi import APIRouter, Request, status

from core.deps import AsyncDBSession
from core.responses import success_response
from schemas.common import APIResponse
from schemas.survey_question import SurveyQuestionRead
from schemas.survey_section import (
    SurveySectionCreate,
    SurveySectionRead,
    SurveySectionReorder,
    SurveySectionUpdate,
)
from services import survey_section_service

router = APIRouter()


@router.get(
    "/",
    response_model=APIResponse[list[SurveySectionRead]],
    summary="List Sections",
    description="List all active sections for a survey, ordered by their index.",
)
async def list_sections(
    survey_id: UUID,
    session: AsyncDBSession,
) -> APIResponse[list[SurveySectionRead]]:
    sections = await survey_section_service.list_sections(session, survey_id)
    response_sections = [SurveySectionRead.model_validate(s) for s in sections]
    return success_response(response_sections)


@router.post(
    "/",
    response_model=APIResponse[SurveySectionRead],
    status_code=status.HTTP_201_CREATED,
    summary="Create Section",
    description="Add a new section to a survey.",
)
async def create_section(
    survey_id: UUID,
    payload: SurveySectionCreate,
    session: AsyncDBSession,
    request: Request,
) -> APIResponse[SurveySectionRead]:
    ip_address = request.client.host if request.client else None
    section = await survey_section_service.create_section(
        session, survey_id, payload, ip_address=ip_address
    )
    return success_response(
        SurveySectionRead.model_validate(section),
        message="Section created.",
    )


@router.patch(
    "/reorder",
    response_model=APIResponse[list[SurveySectionRead]],
    summary="Reorder Sections",
    description="Reorder sections for a survey by providing an ordered list of section IDs.",
)
async def reorder_sections(
    survey_id: UUID,
    payload: SurveySectionReorder,
    session: AsyncDBSession,
    request: Request,
) -> APIResponse[list[SurveySectionRead]]:
    ip_address = request.client.host if request.client else None
    sections = await survey_section_service.reorder_sections(
        session,
        survey_id,
        payload.section_ids,
        ip_address=ip_address,
    )
    return success_response(
        [SurveySectionRead.model_validate(s) for s in sections],
        message="Sections reordered.",
    )


@router.get(
    "/{section_id}",
    response_model=APIResponse[dict],
    summary="Get Section",
    description="Retrieve a single section with its questions.",
)
async def get_section(
    survey_id: UUID,
    section_id: UUID,
    session: AsyncDBSession,
) -> APIResponse[dict]:
    section, questions = await survey_section_service.get_section_with_questions(
        session, survey_id, section_id
    )
    section_data = SurveySectionRead.model_validate(section).model_dump()
    section_data["questions"] = [
        SurveyQuestionRead.model_validate(q).model_dump() for q in questions
    ]
    return success_response(section_data)


@router.patch(
    "/{section_id}",
    response_model=APIResponse[SurveySectionRead],
    summary="Update Section",
    description="Partially update a survey section.",
)
async def update_section(
    survey_id: UUID,
    section_id: UUID,
    payload: SurveySectionUpdate,
    session: AsyncDBSession,
    request: Request,
) -> APIResponse[SurveySectionRead]:
    ip_address = request.client.host if request.client else None
    section = await survey_section_service.update_section(
        session, survey_id, section_id, payload, ip_address=ip_address
    )
    return success_response(
        SurveySectionRead.model_validate(section),
        message="Section updated.",
    )


@router.delete(
    "/{section_id}",
    response_model=APIResponse[SurveySectionRead],
    summary="Delete Section",
    description="Soft delete a survey section.",
)
async def delete_section(
    survey_id: UUID,
    section_id: UUID,
    session: AsyncDBSession,
    request: Request,
) -> APIResponse[SurveySectionRead]:
    ip_address = request.client.host if request.client else None
    section = await survey_section_service.delete_section(
        session, survey_id, section_id, ip_address=ip_address
    )
    return success_response(
        SurveySectionRead.model_validate(section),
        message="Section deleted.",
    )
