from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, status

from core.deps import AsyncDBSession, Principal, require_permissions
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
from services import survey_privacy, survey_service, survey_structure_service

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
    is_template: bool | None = Query(default=None),
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
        is_template=is_template,
    )


SurveyListParams = Annotated[SurveyListQueryParams, Depends(get_survey_list_query_params)]


def _survey_structure_data(
    survey: Survey,
    sections_with_questions: list[tuple[SurveySection, list[SurveyQuestion]]],
    permissions: frozenset[str],
) -> dict:
    survey_data = _survey_read(survey, permissions).model_dump()
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


def _survey_read(survey: Survey, permissions: frozenset[str]) -> SurveyRead:
    survey_read = SurveyRead.model_validate(survey)
    survey_read.responses_count = survey_privacy.project_response_count(
        survey.responses_count, permissions
    )
    return survey_read


def _ensure_response_count_sort_is_authorized(
    params: SurveyListQueryParams, permissions: frozenset[str]
) -> None:
    is_count_sort = params.sort_by == "responses_count"
    if is_count_sort and not survey_privacy.has_exact_response_count_capability(permissions):
        raise AppError(
            "Sorting by responses_count requires an exact response-count capability.",
            status_code=status.HTTP_403_FORBIDDEN,
        )


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
    principal: Principal = Depends(require_permissions("surveys.manage")),
) -> APIResponse[dict]:
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
        _survey_structure_data(updated_survey, sections, principal.permissions),
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
    _ensure_response_count_sort_is_authorized(params, principal.permissions)
    surveys, total = await survey_service.list_surveys(session, params)
    response_surveys = [_survey_read(survey, principal.permissions) for survey in surveys]
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
    principal: Principal = Depends(require_permissions("surveys.manage")),
) -> APIResponse[SurveyRead]:
    ip_address = request.client.host if request.client else None
    survey = await survey_service.create_survey(
        session, payload, principal.user.id, ip_address=ip_address
    )
    return success_response(
        _survey_read(survey, principal.permissions), message="Survey created."
    )


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
    principal: Principal = Depends(require_permissions("surveys.manage")),
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
    survey_data = _survey_structure_data(created_survey, sections, principal.permissions)
    return success_response(survey_data, message="Survey created.")


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
    survey, sections_with_questions = await survey_service.get_survey_with_sections(
        session, survey_id
    )
    survey_data = _survey_structure_data(survey, sections_with_questions, principal.permissions)
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
    principal: Principal = Depends(require_permissions("surveys.manage")),
) -> APIResponse[SurveyRead]:
    ip_address = request.client.host if request.client else None
    survey = await survey_service.update_survey(
        session, survey_id, payload, principal.user.id, ip_address=ip_address
    )
    return success_response(
        _survey_read(survey, principal.permissions), message="Survey updated."
    )


@router.delete(
    "/{survey_id}",
    response_model=APIResponse[SurveyRead],
    summary="Archive Survey",
    description="Archive a survey record by marking is_deleted=True.",
)
async def delete_survey(
    survey_id: str,
    payload: SurveyDelete,
    session: AsyncDBSession,
    request: Request,
    principal: Principal = Depends(require_permissions("surveys.manage")),
) -> APIResponse[SurveyRead]:
    ip_address = request.client.host if request.client else None
    survey = await survey_service.soft_delete_survey(
        session, survey_id, payload, principal.user.id, ip_address=ip_address
    )
    return success_response(
        _survey_read(survey, principal.permissions), message="Survey archived."
    )


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
    principal: Principal = Depends(require_permissions("surveys.manage")),
) -> APIResponse[SurveyRead]:
    ip_address = request.client.host if request.client else None
    survey = await survey_service.restore_survey(
        session, survey_id, payload, principal.user.id, ip_address=ip_address
    )
    return success_response(
        _survey_read(survey, principal.permissions), message="Survey restored."
    )
