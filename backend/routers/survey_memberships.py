from uuid import UUID

from fastapi import APIRouter, Depends, Request, status

from core.deps import AsyncDBSession, Principal, require_permissions
from core.responses import success_response
from schemas.common import APIResponse
from schemas.rbac import SurveyMembershipCreate, SurveyMembershipRead, SurveyMembershipUpdate
from schemas.survey import SurveyRead
from services import survey_membership_service, survey_service

router = APIRouter()


def _ip_address(request: Request) -> str | None:
    return request.client.host if request.client else None


@router.get(
    "/",
    response_model=APIResponse[list[SurveyMembershipRead]],
    summary="List survey collaborators",
    description="List active collaborators for an accessible survey.",
)
async def list_members(
    survey_id: UUID,
    session: AsyncDBSession,
    principal: Principal = Depends(require_permissions("surveys.read")),
) -> APIResponse[list[SurveyMembershipRead]]:
    await survey_service.authorize_survey(session, survey_id, principal.user, principal.permissions)
    members = await survey_membership_service.list_members(session, survey_id)
    return success_response([SurveyMembershipRead.model_validate(member) for member in members])


@router.post(
    "/",
    response_model=APIResponse[SurveyMembershipRead],
    status_code=status.HTTP_201_CREATED,
    summary="Add survey collaborator",
    description="Grant a user viewer or editor access to a survey.",
)
async def add_member(
    survey_id: UUID,
    payload: SurveyMembershipCreate,
    session: AsyncDBSession,
    request: Request,
    principal: Principal = Depends(require_permissions("surveys.share")),
) -> APIResponse[SurveyMembershipRead]:
    survey = await survey_service.authorize_survey(
        session, survey_id, principal.user, principal.permissions, write=True, owner_only=True
    )
    member = await survey_membership_service.add_member(
        session, survey, payload, principal.user.id, _ip_address(request)
    )
    return success_response(
        SurveyMembershipRead.model_validate(member), message="Survey collaborator added."
    )


@router.patch(
    "/{user_id}",
    response_model=APIResponse[SurveyMembershipRead],
    summary="Update survey collaborator",
    description="Change a survey collaborator's access level.",
)
async def update_member(
    survey_id: UUID,
    user_id: UUID,
    payload: SurveyMembershipUpdate,
    session: AsyncDBSession,
    request: Request,
    principal: Principal = Depends(require_permissions("surveys.share")),
) -> APIResponse[SurveyMembershipRead]:
    await survey_service.authorize_survey(
        session, survey_id, principal.user, principal.permissions, write=True, owner_only=True
    )
    member = await survey_membership_service.update_member(
        session, survey_id, user_id, payload, principal.user.id, _ip_address(request)
    )
    return success_response(
        SurveyMembershipRead.model_validate(member), message="Survey collaborator updated."
    )


@router.delete(
    "/{user_id}",
    response_model=APIResponse[None],
    summary="Remove survey collaborator",
    description="Remove a collaborator from a survey.",
)
async def remove_member(
    survey_id: UUID,
    user_id: UUID,
    session: AsyncDBSession,
    request: Request,
    principal: Principal = Depends(require_permissions("surveys.share")),
) -> APIResponse[None]:
    await survey_service.authorize_survey(
        session, survey_id, principal.user, principal.permissions, write=True, owner_only=True
    )
    await survey_membership_service.remove_member(
        session, survey_id, user_id, principal.user.id, _ip_address(request)
    )
    return success_response(None, message="Survey collaborator removed.")


@router.post(
    "/transfer/{user_id}",
    response_model=APIResponse[SurveyRead],
    summary="Transfer survey ownership",
    description="Transfer survey ownership to an active user.",
)
async def transfer_ownership(
    survey_id: UUID,
    user_id: UUID,
    session: AsyncDBSession,
    request: Request,
    principal: Principal = Depends(require_permissions("surveys.transfer")),
) -> APIResponse[SurveyRead]:
    survey = await survey_service.authorize_survey(
        session, survey_id, principal.user, principal.permissions, write=True, owner_only=True
    )
    survey = await survey_membership_service.transfer_ownership(
        session, survey, user_id, principal.user.id, _ip_address(request)
    )
    return success_response(
        SurveyRead.model_validate(survey), message="Survey ownership transferred."
    )
