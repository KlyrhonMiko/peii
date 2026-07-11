import secrets
from uuid import UUID

from fastapi import status
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from core.exceptions import AppError
from models.survey import Survey
from models.survey_distribution import SurveyDistribution
from services.audit_service import record_audit


async def _validate_survey_for_distribution(
    session: AsyncSession, survey_id: UUID,
) -> Survey:
    result = await session.exec(
        select(Survey).where(col(Survey.id) == survey_id, col(Survey.is_deleted).is_(False))
    )
    survey = result.first()
    if not survey:
        raise AppError("Survey not found.", status_code=status.HTTP_404_NOT_FOUND)
    if survey.status != "Active":
        raise AppError(
            "Only active surveys can be distributed.",
            status_code=status.HTTP_400_BAD_REQUEST,
        )
    return survey


async def create_distribution(
    session: AsyncSession,
    survey_id: UUID,
    performed_by: UUID | None = None,
    ip_address: str | None = None,
) -> SurveyDistribution:
    await _validate_survey_for_distribution(session, survey_id)

    token = secrets.token_urlsafe(32)
    distribution = SurveyDistribution(
        survey_id=survey_id,
        token=token,
        performed_by=performed_by,
    )
    session.add(distribution)
    await session.commit()
    await session.refresh(distribution)
    await record_audit(
        session,
        action="create",
        resource_type="survey_distribution",
        resource_id=str(distribution.id),
        performed_by=performed_by,
        ip_address=ip_address,
    )
    return distribution


async def list_distributions(
    session: AsyncSession, survey_id: UUID
) -> list[SurveyDistribution]:
    result = await session.exec(
        select(SurveyDistribution)
        .where(col(SurveyDistribution.survey_id) == survey_id)
        .order_by(col(SurveyDistribution.created_at).desc())
    )
    return list(result.all())


async def revoke_distribution(
    session: AsyncSession,
    survey_id: UUID,
    distribution_id: UUID,
    performed_by: UUID | None = None,
    ip_address: str | None = None,
) -> SurveyDistribution:
    result = await session.exec(
        select(SurveyDistribution).where(
            col(SurveyDistribution.id) == distribution_id,
            col(SurveyDistribution.survey_id) == survey_id,
        )
    )
    distribution = result.first()
    if not distribution:
        raise AppError("Distribution not found.", status_code=status.HTTP_404_NOT_FOUND)

    distribution.is_active = False
    distribution.performed_by = performed_by
    session.add(distribution)
    await session.commit()
    await session.refresh(distribution)
    await record_audit(
        session,
        action="delete",
        resource_type="survey_distribution",
        resource_id=str(distribution.id),
        performed_by=performed_by,
        ip_address=ip_address,
    )
    return distribution


async def get_distribution_by_token(
    session: AsyncSession, token: str
) -> SurveyDistribution:
    result = await session.exec(
        select(SurveyDistribution).where(col(SurveyDistribution.token) == token)
    )
    distribution = result.first()
    if not distribution or not distribution.is_active:
        raise AppError(
            "Survey not found or no longer active.",
            status_code=status.HTTP_404_NOT_FOUND,
        )
    return distribution
