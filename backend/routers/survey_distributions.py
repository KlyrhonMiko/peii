from uuid import UUID

from fastapi import APIRouter, Request, status

from core.deps import AsyncDBSession
from core.responses import success_response
from schemas.common import APIResponse
from schemas.survey_distribution import SurveyDistributionRead
from services import distribution_service

router = APIRouter()


@router.post(
    "/",
    response_model=APIResponse[SurveyDistributionRead],
    status_code=status.HTTP_201_CREATED,
    summary="Create Distribution",
    description="Generate a new distribution token for an active survey.",
)
async def create_distribution(
    survey_id: UUID,
    session: AsyncDBSession,
    request: Request,
) -> APIResponse[SurveyDistributionRead]:
    ip_address = request.client.host if request.client else None
    distribution = await distribution_service.create_distribution(
        session, survey_id, ip_address=ip_address
    )
    return success_response(
        SurveyDistributionRead.model_validate(distribution),
        message="Distribution created.",
    )


@router.get(
    "/",
    response_model=APIResponse[list[SurveyDistributionRead]],
    summary="List Distributions",
    description="List all distribution tokens for a survey.",
)
async def list_distributions(
    survey_id: UUID,
    session: AsyncDBSession,
) -> APIResponse[list[SurveyDistributionRead]]:
    distributions = await distribution_service.list_distributions(session, survey_id)
    return success_response(
        [SurveyDistributionRead.model_validate(d) for d in distributions],
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
) -> APIResponse[SurveyDistributionRead]:
    ip_address = request.client.host if request.client else None
    distribution = await distribution_service.revoke_distribution(
        session, survey_id, distribution_id, ip_address=ip_address
    )
    return success_response(
        SurveyDistributionRead.model_validate(distribution),
        message="Distribution revoked.",
    )
