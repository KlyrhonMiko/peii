import secrets
from datetime import UTC, datetime
from uuid import UUID

from fastapi import status
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from core.exceptions import AppError
from models.base_model import utc_now
from models.survey import Survey
from models.survey_distribution import SurveyDistribution
from models.survey_version import SurveyVersion
from schemas.survey import SurveyStatus
from schemas.survey_distribution import DistributionStatus, SurveyDistributionCreate
from services.audit_service import AuditEvent, commit_with_audit
from services.survey_version_service import ensure_draft_version, publish_draft


def _public_token_error() -> AppError:
    return AppError(
        "Survey not found or no longer active.",
        status_code=status.HTTP_404_NOT_FOUND,
    )


def _normalize_expiry(expires_at: datetime) -> datetime:
    normalized = expires_at.astimezone(UTC).replace(tzinfo=None)
    if normalized <= utc_now():
        raise AppError(
            "Distribution expiry must be in the future.",
            status_code=status.HTTP_400_BAD_REQUEST,
        )
    return normalized


def get_distribution_status(
    distribution: SurveyDistribution,
    survey_status: SurveyStatus | str,
    now: datetime | None = None,
) -> DistributionStatus:
    current_time = now or utc_now()
    if distribution.is_deleted or distribution.revoked_at is not None:
        return "revoked"
    if distribution.expires_at is not None and distribution.expires_at <= current_time:
        return "expired"
    if survey_status != "Active":
        return "suspended"
    return "active"


def _is_active(distribution: SurveyDistribution, survey_status: SurveyStatus | str) -> bool:
    return get_distribution_status(distribution, survey_status) == "active"


async def _get_survey(
    session: AsyncSession,
    survey_id: UUID,
    *,
    include_deleted: bool = False,
    for_update: bool = False,
) -> Survey | None:
    statement = select(Survey).where(col(Survey.id) == survey_id)
    if not include_deleted:
        statement = statement.where(col(Survey.is_deleted).is_(False))
    if for_update:
        statement = statement.with_for_update()
    result = await session.exec(statement)
    return result.first()


async def _validate_survey_for_distribution(
    session: AsyncSession, survey_id: UUID
) -> Survey:
    survey = await _get_survey(session, survey_id)
    if not survey:
        raise AppError("Survey not found.", status_code=status.HTTP_404_NOT_FOUND)
    if survey.status != "Active":
        raise AppError(
            "Only active surveys can be distributed.",
            status_code=status.HTTP_400_BAD_REQUEST,
        )
    return survey


async def _generate_token(session: AsyncSession) -> str:
    for _ in range(3):
        token = secrets.token_urlsafe(32)
        result = await session.exec(
            select(SurveyDistribution.id).where(col(SurveyDistribution.token) == token)
        )
        if result.first() is None:
            return token
    raise AppError(
        "Unable to generate a unique distribution token.",
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
    )


async def _ensure_published_version(
    session: AsyncSession,
    survey: Survey,
) -> tuple[SurveyVersion, list[AuditEvent]]:
    published_result = await session.exec(
        select(SurveyVersion)
        .where(
            col(SurveyVersion.survey_id) == survey.id,
            col(SurveyVersion.status) == "published",
            col(SurveyVersion.is_deleted).is_(False),
        )
        .order_by(col(SurveyVersion.version_number).desc())
    )
    published = published_result.first()
    draft_result = await session.exec(
        select(SurveyVersion).where(
            col(SurveyVersion.survey_id) == survey.id,
            col(SurveyVersion.status) == "draft",
            col(SurveyVersion.is_deleted).is_(False),
        )
    )
    draft = draft_result.first()
    if published and draft is None:
        return published, []

    if draft is None:
        draft, clone_events = await ensure_draft_version(session, survey)
    else:
        clone_events = []
    publish_events = await publish_draft(session, survey, draft)
    return draft, [*clone_events, *publish_events]


async def create_distribution(
    session: AsyncSession,
    survey_id: UUID,
    payload: SurveyDistributionCreate,
    performed_by: UUID | None = None,
    ip_address: str | None = None,
) -> SurveyDistribution:
    survey = await _validate_survey_for_distribution(session, survey_id)
    version, version_events = await _ensure_published_version(session, survey)
    token = await _generate_token(session)
    distribution = SurveyDistribution(
        survey_id=survey_id,
        version_id=version.id,
        token=token,
        expires_at=_normalize_expiry(payload.expires_at),
        performed_by=performed_by,
    )
    session.add(distribution)
    await commit_with_audit(
        session,
        [
            *version_events,
            AuditEvent(
                action="create",
                resource_type="survey_distribution",
                resource_id=str(distribution.id),
                performed_by=performed_by,
                ip_address=ip_address,
            )
        ],
    )
    await session.refresh(distribution)
    return distribution


async def list_distributions(
    session: AsyncSession, survey_id: UUID
) -> tuple[list[SurveyDistribution], SurveyStatus | str]:
    survey = await _get_survey(session, survey_id)
    if not survey:
        raise AppError("Survey not found.", status_code=status.HTTP_404_NOT_FOUND)

    result = await session.exec(
        select(SurveyDistribution)
        .where(
            col(SurveyDistribution.survey_id) == survey_id,
            col(SurveyDistribution.is_deleted).is_(False),
        )
        .order_by(col(SurveyDistribution.created_at).desc())
    )
    return list(result.all()), survey.status


async def revoke_distribution(
    session: AsyncSession,
    survey_id: UUID,
    distribution_id: UUID,
    performed_by: UUID | None = None,
    ip_address: str | None = None,
) -> tuple[SurveyDistribution, SurveyStatus | str]:
    result = await session.exec(
        select(SurveyDistribution)
        .where(
            col(SurveyDistribution.id) == distribution_id,
            col(SurveyDistribution.survey_id) == survey_id,
            col(SurveyDistribution.is_deleted).is_(False),
        )
        .with_for_update()
    )
    distribution = result.first()
    if not distribution:
        raise AppError("Distribution not found.", status_code=status.HTTP_404_NOT_FOUND)

    survey = await _get_survey(session, survey_id, include_deleted=True)
    survey_status: SurveyStatus | str = survey.status if survey else "Closed"
    if distribution.revoked_at is None:
        before_status = get_distribution_status(distribution, survey_status)
        distribution.revoked_at = utc_now()
        distribution.performed_by = performed_by
        distribution.updated_at = utc_now()
        session.add(distribution)
        await commit_with_audit(
            session,
            [
                AuditEvent(
                    action="revoke",
                    resource_type="survey_distribution",
                    resource_id=str(distribution.id),
                    performed_by=performed_by,
                    changes={
                        "status": {"before": before_status, "after": "revoked"},
                        "revoked_at": {"before": None, "after": distribution.revoked_at},
                    },
                    ip_address=ip_address,
                )
            ],
        )
        await session.refresh(distribution)
    return distribution, survey_status


async def rotate_distribution(
    session: AsyncSession,
    survey_id: UUID,
    distribution_id: UUID,
    payload: SurveyDistributionCreate,
    performed_by: UUID | None = None,
    ip_address: str | None = None,
) -> tuple[SurveyDistribution, SurveyStatus | str]:
    survey = await _validate_survey_for_distribution(session, survey_id)
    version, version_events = await _ensure_published_version(session, survey)
    result = await session.exec(
        select(SurveyDistribution)
        .where(
            col(SurveyDistribution.id) == distribution_id,
            col(SurveyDistribution.survey_id) == survey_id,
            col(SurveyDistribution.is_deleted).is_(False),
        )
        .with_for_update()
    )
    previous = result.first()
    if not previous:
        raise AppError("Distribution not found.", status_code=status.HTTP_404_NOT_FOUND)

    replacement = SurveyDistribution(
        survey_id=survey_id,
        version_id=version.id,
        token=await _generate_token(session),
        expires_at=_normalize_expiry(payload.expires_at),
        performed_by=performed_by,
    )
    previous_status = get_distribution_status(previous, survey.status)
    previous.revoked_at = utc_now()
    previous.performed_by = performed_by
    previous.updated_at = utc_now()
    session.add_all([previous, replacement])
    await commit_with_audit(
        session,
        [
            *version_events,
            AuditEvent(
                action="create",
                resource_type="survey_distribution",
                resource_id=str(replacement.id),
                performed_by=performed_by,
                ip_address=ip_address,
            ),
            AuditEvent(
                action="revoke",
                resource_type="survey_distribution",
                resource_id=str(previous.id),
                performed_by=performed_by,
                changes={
                    "status": {"before": previous_status, "after": "revoked"},
                    "reason": "rotation",
                },
                ip_address=ip_address,
            ),
        ],
    )
    await session.refresh(replacement)
    return replacement, survey.status


async def get_distribution_by_token(
    session: AsyncSession,
    token: str,
    *,
    for_update: bool = False,
) -> SurveyDistribution:
    statement = select(SurveyDistribution).where(
        col(SurveyDistribution.token) == token,
        col(SurveyDistribution.is_deleted).is_(False),
    )
    if for_update:
        statement = statement.with_for_update()
    result = await session.exec(statement)
    distribution = result.first()
    if not distribution:
        raise _public_token_error()

    survey = await _get_survey(session, distribution.survey_id, for_update=for_update)
    if not survey or not _is_active(distribution, survey.status):
        raise _public_token_error()
    return distribution
