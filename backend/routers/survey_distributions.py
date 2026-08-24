from uuid import UUID

from fastapi import APIRouter, Depends, Request, status

from core.deps import AsyncDBSession, Principal, require_permissions
from core.responses import success_response
from models.survey_distribution import SurveyDistribution
from schemas.common import APIResponse
from schemas.survey_distribution import (
    SurveyDistributionCreate,
    SurveyDistributionRead,
    SurveyDistributionSecretRead,
)
from services import distribution_service, survey_service

router = APIRouter()


def _distribution_read(
    distribution: SurveyDistribution, survey_status: str
) -> SurveyDistributionRead:
    lifecycle_status = distribution_service.get_distribution_status(distribution, survey_status)
    return SurveyDistributionRead(
        id=distribution.id,
        survey_id=distribution.survey_id,
        status=lifecycle_status,
        is_active=lifecycle_status == "active",
        expires_at=distribution.expires_at,
        revoked_at=distribution.revoked_at,
        created_at=distribution.created_at,
    )


def _distribution_secret_read(
    distribution: SurveyDistribution, survey_status: str
) -> SurveyDistributionSecretRead:
    return SurveyDistributionSecretRead(
        **_distribution_read(distribution, survey_status).model_dump(), token=distribution.token
    )


@router.post(
    "/",
    response_model=APIResponse[SurveyDistributionSecretRead],
    status_code=status.HTTP_201_CREATED,
    summary="Create Distribution",
    description="Generate a new distribution token for an active survey.",
)
async def create_distribution(
    survey_id: UUID,
    payload: SurveyDistributionCreate,
    session: AsyncDBSession,
    request: Request,
    principal: Principal = Depends(require_permissions("survey_distributions.manage")),
) -> APIResponse[SurveyDistributionSecretRead]:
    await survey_service.resolve_survey(session, survey_id)
    ip_address = request.client.host if request.client else None
    distribution = await distribution_service.create_distribution(
        session, survey_id, payload, performed_by=principal.user.id, ip_address=ip_address
    )
    return success_response(
        _distribution_secret_read(distribution, "Active"),
        message="Distribution created.",
    )


@router.get(
    "/",
    response_model=APIResponse[list[SurveyDistributionRead]],
    summary="List Distributions",
    description="List distribution metadata for a survey; distribution tokens are not returned.",
)
async def list_distributions(
    survey_id: UUID,
    session: AsyncDBSession,
    principal: Principal = Depends(require_permissions("survey_distributions.manage")),
) -> APIResponse[list[SurveyDistributionRead]]:
    await survey_service.resolve_survey(session, survey_id)
    distributions, survey_status = await distribution_service.list_distributions(session, survey_id)
    return success_response(
        [_distribution_read(d, survey_status) for d in distributions],
    )


@router.delete(
    "/{distribution_id}",
    response_model=APIResponse[SurveyDistributionRead],
    summary="Revoke Distribution",
    description="Revoke a distribution token, making it no longer usable.",
)
async def revoke_distribution(
    survey_id: UUID,
    distribution_id: UUID,
    session: AsyncDBSession,
    request: Request,
    principal: Principal = Depends(require_permissions("survey_distributions.manage")),
) -> APIResponse[SurveyDistributionRead]:
    await survey_service.resolve_survey(session, survey_id)
    ip_address = request.client.host if request.client else None
    distribution, survey_status = await distribution_service.revoke_distribution(
        session, survey_id, distribution_id, performed_by=principal.user.id, ip_address=ip_address
    )
    return success_response(
        _distribution_read(distribution, survey_status),
        message="Distribution revoked.",
    )


@router.post(
    "/{distribution_id}/rotate",
    response_model=APIResponse[SurveyDistributionSecretRead],
    status_code=status.HTTP_201_CREATED,
    summary="Rotate Distribution",
    description="Revoke a distribution token and create a replacement token.",
)
async def rotate_distribution(
    survey_id: UUID,
    distribution_id: UUID,
    payload: SurveyDistributionCreate,
    session: AsyncDBSession,
    request: Request,
    principal: Principal = Depends(require_permissions("survey_distributions.manage")),
) -> APIResponse[SurveyDistributionSecretRead]:
    await survey_service.resolve_survey(session, survey_id)
    ip_address = request.client.host if request.client else None
    distribution, survey_status = await distribution_service.rotate_distribution(
        session,
        survey_id,
        distribution_id,
        payload,
        performed_by=principal.user.id,
        ip_address=ip_address,
    )
    return success_response(
        _distribution_secret_read(distribution, survey_status),
        message="Distribution rotated.",
    )
