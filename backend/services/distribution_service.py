import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from hashlib import sha256
from uuid import UUID

from fastapi import status
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from core.config import settings
from core.exceptions import AppError
from models.base_model import utc_now
from models.survey import Survey
from models.survey_distribution import SurveyDistribution
from schemas.survey import SurveyStatus
from schemas.survey_distribution import DistributionStatus, SurveyDistributionCreate
from services.audit_service import AuditEvent, commit_with_audit
from services.survey_service import get_survey_readiness_errors


@dataclass(frozen=True, slots=True)
class DistributionSecretResult:
    distribution: SurveyDistribution
    token: str


@dataclass(frozen=True, slots=True)
class _GeneratedToken:
    plaintext: str
    digest: str
    prefix: str


def _public_token_error() -> AppError:
    return AppError(
        "Survey not found or no longer active.",
        status_code=status.HTTP_404_NOT_FOUND,
    )


def _normalize_expiry(expires_at: datetime | None) -> datetime | None:
    now = utc_now()
    if expires_at is None:
        return now + timedelta(days=settings.SURVEY_DISTRIBUTION_DEFAULT_EXPIRY_DAYS)
    normalized = expires_at.astimezone(UTC).replace(tzinfo=None)
    if normalized <= now:
        raise AppError(
            "Distribution expiry must be in the future.",
            status_code=status.HTTP_400_BAD_REQUEST,
        )
    if normalized > now + timedelta(days=settings.SURVEY_DISTRIBUTION_MAX_EXPIRY_DAYS):
        raise AppError(
            "Distribution expiry exceeds the configured maximum.",
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
    shared_lock: bool = False,
) -> Survey | None:
    statement = select(Survey).where(col(Survey.id) == survey_id)
    if not include_deleted:
        statement = statement.where(col(Survey.is_deleted).is_(False))
    if for_update:
        statement = statement.with_for_update(read=shared_lock)
    result = await session.exec(statement)
    return result.first()


async def _validate_survey_for_distribution(session: AsyncSession, survey_id: UUID) -> Survey:
    survey = await _get_survey(session, survey_id, for_update=True)
    if not survey:
        raise AppError("Survey not found.", status_code=status.HTTP_404_NOT_FOUND)
    if survey.status != "Active":
        raise AppError(
            "Only active surveys can be distributed.",
            status_code=status.HTTP_400_BAD_REQUEST,
        )
    readiness_errors = await get_survey_readiness_errors(session, survey.id)
    if readiness_errors:
        raise AppError(
            "Survey is not ready for distribution.",
            status_code=status.HTTP_409_CONFLICT,
            errors=readiness_errors,
        )
    return survey


async def _generate_token(session: AsyncSession) -> _GeneratedToken:
    for _ in range(3):
        token = secrets.token_urlsafe(32)
        digest = sha256(token.encode("utf-8")).hexdigest()
        result = await session.exec(
            select(SurveyDistribution.id).where(col(SurveyDistribution.token_digest) == digest)
        )
        if result.first() is None:
            return _GeneratedToken(token, digest, token[:8])
    raise AppError(
        "Unable to generate a unique distribution token.",
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
    )


async def create_distribution(
    session: AsyncSession,
    survey_id: UUID,
    payload: SurveyDistributionCreate,
    performed_by: UUID,
    ip_address: str | None = None,
) -> DistributionSecretResult:
    await _validate_survey_for_distribution(session, survey_id)
    generated_token = await _generate_token(session)
    distribution = SurveyDistribution(
        survey_id=survey_id,
        token_digest=generated_token.digest,
        token_prefix=generated_token.prefix,
        expires_at=_normalize_expiry(payload.expires_at),
        performed_by=performed_by,
    )
    session.add(distribution)
    await commit_with_audit(
        session,
        [
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
    return DistributionSecretResult(distribution=distribution, token=generated_token.plaintext)


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
        .order_by(
            col(SurveyDistribution.created_at).desc(),
            col(SurveyDistribution.id).desc(),
        )
    )
    return list(result.all()), survey.status


async def revoke_distribution(
    session: AsyncSession,
    survey_id: UUID,
    distribution_id: UUID,
    performed_by: UUID,
    ip_address: str | None = None,
) -> tuple[SurveyDistribution, SurveyStatus | str]:
    # Mutations always acquire the parent survey lock before a distribution lock.
    survey = await _get_survey(session, survey_id, include_deleted=True, for_update=True)
    if survey is None:
        raise AppError("Survey not found.", status_code=status.HTTP_404_NOT_FOUND)
    survey_status: SurveyStatus | str = survey.status
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
    performed_by: UUID,
    ip_address: str | None = None,
) -> tuple[DistributionSecretResult, SurveyStatus | str]:
    survey = await _validate_survey_for_distribution(session, survey_id)
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

    generated_token = await _generate_token(session)
    replacement = SurveyDistribution(
        survey_id=survey_id,
        token_digest=generated_token.digest,
        token_prefix=generated_token.prefix,
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
    return DistributionSecretResult(
        distribution=replacement,
        token=generated_token.plaintext,
    ), survey.status


async def get_distribution_by_token(
    session: AsyncSession,
    token: str,
    *,
    for_update: bool = False,
    shared_lock: bool = False,
) -> SurveyDistribution:
    distribution, _survey = await get_distribution_and_survey_by_token(
        session,
        token,
        for_update=for_update,
        shared_lock=shared_lock,
    )
    return distribution


async def get_distribution_and_survey_by_token(
    session: AsyncSession,
    token: str,
    *,
    for_update: bool = False,
    shared_lock: bool = False,
) -> tuple[SurveyDistribution, Survey]:
    # Resolve the token reference without a lock.  For a mutation, the survey is
    # then locked before the distribution, establishing survey -> distribution
    # ordering even when multiple distributions share a survey.
    token_reference = await get_distribution_token_reference(session, token)

    survey = await _get_survey(
        session,
        token_reference.survey_id,
        for_update=for_update,
        shared_lock=shared_lock,
    )
    distribution_statement = select(SurveyDistribution).where(
        col(SurveyDistribution.id) == token_reference.id,
        col(SurveyDistribution.survey_id) == token_reference.survey_id,
        col(SurveyDistribution.is_deleted).is_(False),
    )
    if for_update:
        distribution_statement = distribution_statement.with_for_update(read=shared_lock)
    distribution_result = await session.exec(distribution_statement)
    distribution = distribution_result.first()
    if not survey or not distribution or not _is_active(distribution, survey.status):
        raise _public_token_error()
    if await get_survey_readiness_errors(session, survey.id):
        raise _public_token_error()
    return distribution, survey


async def get_distribution_token_reference(
    session: AsyncSession, token: str
) -> SurveyDistribution:
    """Look up a token reference without acquiring a row lock."""
    token_digest = sha256(token.encode("utf-8")).hexdigest()
    result = await session.exec(
        select(SurveyDistribution).where(
            col(SurveyDistribution.token_digest) == token_digest,
            col(SurveyDistribution.is_deleted).is_(False),
        )
    )
    distribution = result.first()
    if not distribution:
        raise _public_token_error()
    return distribution


async def revoke_for_structure_change(
    session: AsyncSession,
    survey: Survey,
    performed_by: UUID,
    ip_address: str | None = None,
) -> list[AuditEvent]:
    result = await session.exec(
        select(SurveyDistribution)
        .where(
            col(SurveyDistribution.survey_id) == survey.id,
            col(SurveyDistribution.is_deleted).is_(False),
            col(SurveyDistribution.revoked_at).is_(None),
        )
        .order_by(col(SurveyDistribution.id))
        .with_for_update()
    )
    distributions = list(result.all())
    now = utc_now()
    survey.updated_at = now
    survey.performed_by = performed_by
    session.add(survey)
    events: list[AuditEvent] = []
    for distribution in distributions:
        distribution.revoked_at = now
        distribution.updated_at = now
        distribution.performed_by = performed_by
        session.add(distribution)
        events.append(
            AuditEvent(
                action="revoke",
                resource_type="survey_distribution",
                resource_id=str(distribution.id),
                performed_by=performed_by,
                changes={"reason": "survey_structure_changed"},
                ip_address=ip_address,
            )
        )
    return events


async def revoke_for_survey_archive(
    session: AsyncSession,
    survey: Survey,
    performed_by: UUID,
    ip_address: str | None = None,
) -> list[AuditEvent]:
    result = await session.exec(
        select(SurveyDistribution)
        .where(
            col(SurveyDistribution.survey_id) == survey.id,
            col(SurveyDistribution.is_deleted).is_(False),
            col(SurveyDistribution.revoked_at).is_(None),
        )
        .order_by(col(SurveyDistribution.id))
        .with_for_update()
    )
    now = utc_now()
    events: list[AuditEvent] = []
    for distribution in result.all():
        distribution.revoked_at = now
        distribution.updated_at = now
        distribution.performed_by = performed_by
        session.add(distribution)
        events.append(
            AuditEvent(
                action="revoke",
                resource_type="survey_distribution",
                resource_id=str(distribution.id),
                performed_by=performed_by,
                changes={"reason": "survey_archived"},
                ip_address=ip_address,
            )
        )
    return events
