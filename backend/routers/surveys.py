from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, status

from core.deps import AsyncDBSession
from core.responses import list_meta_response, success_response
from models.survey import Survey
from models.survey_question import SurveyQuestion
from models.survey_section import SurveySection
from models.survey_version import SurveyVersion
from schemas.common import APIResponse
from schemas.survey import (
    SurveyCreate,
    SurveyDelete,
    SurveyListQueryParams,
    SurveyRead,
    SurveyRestore,
    SurveyStatus,
    SurveyUpdate,
)
from schemas.survey_question import SurveyQuestionRead
from schemas.survey_section import SurveySectionRead
from schemas.survey_structure import SurveyStructureReplace
from schemas.survey_version import SurveyVersionRead
from services import survey_service, survey_structure_service, survey_version_service
from services.survey_version_service import get_version_for_read

router = APIRouter()


def get_survey_list_query_params(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    sort_order: Literal["asc", "desc"] = Query(default="desc"),
    include_deleted: bool = Query(default=False),
    sort_by: Literal[
        "created_at", "survey_id", "title", "status", "responses_count"
    ] = Query(default="created_at"),
    status_filter: SurveyStatus | None = Query(default=None, alias="status"),
    target_cohort: str | None = Query(default=None),
    search: str | None = Query(default=None, min_length=1),
) -> SurveyListQueryParams:
    return SurveyListQueryParams(
        limit=limit,
        offset=offset,
        sort_order=sort_order,
        include_deleted=include_deleted,
        sort_by=sort_by,
        status=status_filter,
        target_cohort=target_cohort,
        search=search.strip() if search else None,
    )


SurveyListParams = Annotated[SurveyListQueryParams, Depends(get_survey_list_query_params)]


def _survey_structure_data(
    survey: Survey,
    sections_with_questions: list[tuple[SurveySection, list[SurveyQuestion]]],
    version: SurveyVersion,
) -> dict:
    survey_data = SurveyRead.model_validate(survey).model_dump()
    section_list: list[dict] = []
    all_questions: list[dict] = []
    for section, questions in sections_with_questions:
        section_data = SurveySectionRead.model_validate(section).model_dump()
        section_qs = [SurveyQuestionRead.model_validate(q).model_dump() for q in questions]
        section_data["questions"] = section_qs
        section_list.append(section_data)
        all_questions.extend(section_qs)
    version_data = SurveyVersionRead.model_validate(version)
    survey_data["version_id"] = version_data.id
    survey_data["version_number"] = version_data.version_number
    survey_data["structure_revision"] = version_data.structure_revision
    survey_data["sections"] = section_list
    survey_data["questions"] = all_questions
    return survey_data


@router.put(
    "/{survey_id}/structure",
    response_model=APIResponse[dict],
    summary="Replace Survey Draft Structure",
    description="Atomically replace the ordered sections and questions in a survey draft.",
)
async def replace_survey_structure(
    survey_id: UUID,
    payload: SurveyStructureReplace,
    session: AsyncDBSession,
    request: Request,
) -> APIResponse[dict]:
    survey = await survey_service.get_survey_by_uuid(session, survey_id)
    ip_address = request.client.host if request.client else None
    await survey_structure_service.replace_draft_structure(
        session,
        survey,
        payload,
        ip_address=ip_address,
    )
    updated_survey, sections = await survey_service.get_survey_with_sections(
        session, survey.survey_id
    )
    version = await get_version_for_read(session, survey.id)
    return success_response(
        _survey_structure_data(updated_survey, sections, version),
        message="Survey structure saved.",
    )


@router.post(
    "/{survey_id}/draft",
    response_model=APIResponse[SurveyVersionRead],
    summary="Create Survey Draft",
    description="Create an editable survey structure draft from the current published version.",
)
async def create_survey_draft(
    survey_id: UUID,
    session: AsyncDBSession,
    request: Request,
) -> APIResponse[SurveyVersionRead]:
    survey = await survey_service.get_survey_by_uuid(session, survey_id)
    version = await survey_version_service.ensure_editable_draft(session, survey)
    return success_response(
        SurveyVersionRead.model_validate(version),
        message="Survey draft ready.",
    )


@router.delete(
    "/{survey_id}/draft",
    response_model=APIResponse[SurveyVersionRead],
    summary="Discard Survey Draft",
    description="Discard the active editable draft without changing the published version.",
)
async def discard_survey_draft(
    survey_id: UUID,
    session: AsyncDBSession,
    request: Request,
) -> APIResponse[SurveyVersionRead]:
    survey = await survey_service.get_survey_by_uuid(session, survey_id)
    ip_address = request.client.host if request.client else None
    version = await survey_version_service.discard_draft(
        session, survey, ip_address=ip_address
    )
    return success_response(
        SurveyVersionRead.model_validate(version),
        message="Survey draft discarded.",
    )


@router.post(
    "/{survey_id}/publish",
    response_model=APIResponse[SurveyVersionRead],
    summary="Publish Survey Draft",
    description="Publish the current draft structure as an immutable survey version.",
)
async def publish_survey_draft(
    survey_id: UUID,
    session: AsyncDBSession,
    request: Request,
) -> APIResponse[SurveyVersionRead]:
    survey = await survey_service.get_survey_by_uuid(session, survey_id)
    version = await survey_version_service.publish_current_draft(session, survey)
    return success_response(
        SurveyVersionRead.model_validate(version),
        message="Survey version published.",
    )


@router.get(
    "/",
    response_model=APIResponse[list[SurveyRead]],
    summary="List Surveys",
    description="Query and list survey records with offset pagination, filtering, and sorting.",
)
async def list_surveys(
    session: AsyncDBSession,
    params: SurveyListParams,
) -> APIResponse[list[SurveyRead]]:
    surveys, total = await survey_service.list_surveys(session, params)
    response_surveys = [SurveyRead.model_validate(s) for s in surveys]
    return success_response(
        response_surveys,
        meta=list_meta_response(
            filters=params,
            total=total,
            count=len(response_surveys),
            limit=params.limit,
            offset=params.offset,
        ),
    )


@router.post(
    "/",
    response_model=APIResponse[SurveyRead],
    status_code=status.HTTP_201_CREATED,
    summary="Create Survey",
    description="Create a new survey record with a unique business ID.",
)
async def create_survey(
    payload: SurveyCreate,
    session: AsyncDBSession,
    request: Request,
) -> APIResponse[SurveyRead]:
    ip_address = request.client.host if request.client else None
    survey = await survey_service.create_survey(session, payload, ip_address=ip_address)
    return success_response(SurveyRead.model_validate(survey), message="Survey created.")


@router.get(
    "/{survey_id}",
    response_model=APIResponse[dict],
    summary="Get Survey",
    description="Retrieve a single survey with its questions by business ID.",
)
async def get_survey(
    survey_id: str,
    session: AsyncDBSession,
) -> APIResponse[dict]:
    survey, sections_with_questions = await survey_service.get_survey_with_sections(
        session, survey_id
    )
    version = await get_version_for_read(session, survey.id)
    survey_data = _survey_structure_data(survey, sections_with_questions, version)
    return success_response(survey_data)


@router.patch(
    "/{survey_id}",
    response_model=APIResponse[SurveyRead],
    summary="Update Survey",
    description="Partially update a survey record.",
)
async def update_survey(
    survey_id: str,
    payload: SurveyUpdate,
    session: AsyncDBSession,
    request: Request,
) -> APIResponse[SurveyRead]:
    ip_address = request.client.host if request.client else None
    survey = await survey_service.update_survey(
        session, survey_id, payload, ip_address=ip_address
    )
    return success_response(SurveyRead.model_validate(survey), message="Survey updated.")


@router.delete(
    "/{survey_id}",
    response_model=APIResponse[SurveyRead],
    summary="Delete Survey (Soft)",
    description="Soft delete a survey record by marking is_deleted=True.",
)
async def delete_survey(
    survey_id: str,
    payload: SurveyDelete,
    session: AsyncDBSession,
    request: Request,
) -> APIResponse[SurveyRead]:
    ip_address = request.client.host if request.client else None
    survey = await survey_service.soft_delete_survey(
        session, survey_id, payload, ip_address=ip_address
    )
    return success_response(SurveyRead.model_validate(survey), message="Survey deleted.")


@router.post(
    "/{survey_id}/restore",
    response_model=APIResponse[SurveyRead],
    summary="Restore Survey",
    description="Restore a soft-deleted survey record.",
)
async def restore_survey(
    survey_id: str,
    payload: SurveyRestore,
    session: AsyncDBSession,
    request: Request,
) -> APIResponse[SurveyRead]:
    ip_address = request.client.host if request.client else None
    survey = await survey_service.restore_survey(
        session, survey_id, payload, ip_address=ip_address
    )
    return success_response(SurveyRead.model_validate(survey), message="Survey restored.")
