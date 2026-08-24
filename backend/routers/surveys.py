from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, status

from core.deps import AsyncDBSession, CurrentPrincipal, Principal, require_permissions
from core.exceptions import AppError
from core.responses import list_meta_response, success_response
from models.survey import Survey
from models.survey_question import SurveyQuestion
from models.survey_section import SurveySection
from schemas.common import APIResponse
from schemas.survey import (
    SurveyCreate,
    SurveyCreateWithStructure,
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
from services import survey_service, survey_structure_service

router = APIRouter()


def get_survey_list_query_params(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    sort_order: Literal["asc", "desc"] = Query(default="desc"),
    include_deleted: bool = Query(default=False),
    sort_by: Literal["created_at", "survey_id", "title", "status", "responses_count"] = Query(
        default="created_at"
    ),
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
    survey_data["sections"] = section_list
    survey_data["questions"] = all_questions
    return survey_data


@router.put(
    "/{survey_id}/structure",
    response_model=APIResponse[dict],
    summary="Replace Survey Structure",
    description="Atomically replace the ordered sections and questions in an inactive survey.",
)
async def replace_survey_structure(
    survey_id: UUID,
    payload: SurveyStructureReplace,
    session: AsyncDBSession,
    request: Request,
    principal: Principal = Depends(require_permissions("survey_structure.manage")),
) -> APIResponse[dict]:
    await survey_service.authorize_survey(
        session, survey_id, principal.user, principal.permissions, write=True
    )
    ip_address = request.client.host if request.client else None
    survey = await survey_structure_service.replace_structure(
        session,
        survey_id,
        payload,
        performed_by=principal.user.id,
        ip_address=ip_address,
    )
    updated_survey, sections = await survey_service.get_survey_with_sections(
        session, survey.survey_id
    )
    return success_response(
        _survey_structure_data(updated_survey, sections),
        message="Survey structure saved.",
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
    principal: Principal = Depends(require_permissions("surveys.read")),
) -> APIResponse[list[SurveyRead]]:
    surveys, total = await survey_service.list_surveys(
        session, params, principal.user, principal.permissions
    )
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
    principal: Principal = Depends(require_permissions("surveys.create")),
) -> APIResponse[SurveyRead]:
    ip_address = request.client.host if request.client else None
    survey = await survey_service.create_survey(
        session, payload, principal.user.id, ip_address=ip_address
    )
    return success_response(SurveyRead.model_validate(survey), message="Survey created.")


@router.post(
    "/with-structure",
    response_model=APIResponse[dict],
    status_code=status.HTTP_201_CREATED,
    summary="Create Survey With Structure",
    description="Atomically create a survey with its ordered sections and questions.",
)
async def create_survey_with_structure(
    payload: SurveyCreateWithStructure,
    session: AsyncDBSession,
    request: Request,
    principal: Principal = Depends(require_permissions("surveys.create")),
) -> APIResponse[dict]:
    ip_address = request.client.host if request.client else None
    survey = await survey_service.create_survey_with_structure(
        session,
        payload,
        principal.user.id,
        ip_address=ip_address,
    )
    created_survey, sections = await survey_service.get_survey_with_sections(
        session, survey.survey_id
    )
    return success_response(
        _survey_structure_data(created_survey, sections),
        message="Survey created.",
    )


@router.get(
    "/{survey_id}",
    response_model=APIResponse[dict],
    summary="Get Survey",
    description="Retrieve a single survey with its questions by business ID.",
)
async def get_survey(
    survey_id: str,
    session: AsyncDBSession,
    principal: Principal = Depends(require_permissions("surveys.read")),
) -> APIResponse[dict]:
    await survey_service.authorize_survey(session, survey_id, principal.user, principal.permissions)
    survey, sections_with_questions = await survey_service.get_survey_with_sections(
        session, survey_id
    )
    survey_data = _survey_structure_data(survey, sections_with_questions)
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
    principal: CurrentPrincipal,
) -> APIResponse[SurveyRead]:
    updates = payload.model_dump(exclude_unset=True)
    required_permissions = set()
    if payload.status is not None:
        required_permissions.add("surveys.publish")
        owner_only = True
    else:
        owner_only = False
    if set(updates) - {"status"} or not required_permissions:
        required_permissions.add("surveys.update")
    if not required_permissions.issubset(principal.permissions):
        raise AppError("You do not have permission to perform this action.", status_code=403)
    await survey_service.authorize_survey(
        session,
        survey_id,
        principal.user,
        principal.permissions,
        write=True,
        owner_only=owner_only,
    )
    ip_address = request.client.host if request.client else None
    survey = await survey_service.update_survey(
        session, survey_id, payload, principal.user.id, ip_address=ip_address
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
    principal: Principal = Depends(require_permissions("surveys.delete")),
) -> APIResponse[SurveyRead]:
    await survey_service.authorize_survey(
        session,
        survey_id,
        principal.user,
        principal.permissions,
        write=True,
        owner_only=True,
    )
    ip_address = request.client.host if request.client else None
    survey = await survey_service.soft_delete_survey(
        session, survey_id, payload, principal.user.id, ip_address=ip_address
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
    principal: Principal = Depends(require_permissions("surveys.restore")),
) -> APIResponse[SurveyRead]:
    await survey_service.authorize_survey(
        session,
        survey_id,
        principal.user,
        principal.permissions,
        write=True,
        owner_only=True,
        include_deleted=True,
    )
    ip_address = request.client.host if request.client else None
    survey = await survey_service.restore_survey(
        session, survey_id, payload, principal.user.id, ip_address=ip_address
    )
    return success_response(SurveyRead.model_validate(survey), message="Survey restored.")
