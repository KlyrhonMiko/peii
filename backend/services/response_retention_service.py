from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import func
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from core.config import settings
from models.google_survey_auth_proof import GoogleSurveyAuthProof
from models.survey import Survey
from models.survey_response import SurveyResponse
from services.audit_service import AuditEvent, commit_with_audit
from services.base_service import utc_now
from services.response_service import tombstone_responses
from services.survey_service import resolve_survey

DEFAULT_RETENTION_BATCH_SIZE = 100


@dataclass(frozen=True, slots=True)
class RetentionPurgeResult:
    cutoff: datetime
    purged_count: int
    proof_purged_count: int
    survey_count: int
    batch_count: int
    dry_run: bool


def _normalize_cutoff(cutoff: datetime | None) -> datetime:
    value = cutoff or utc_now()
    if value.tzinfo is not None:
        return value.astimezone(UTC).replace(tzinfo=None)
    return value


async def _due_survey_ids(session: AsyncSession, cutoff: datetime) -> list[UUID]:
    result = await session.exec(
        select(SurveyResponse.survey_id)
        .where(
            col(SurveyResponse.is_deleted).is_(False),
            col(SurveyResponse.retention_expires_at).is_not(None),
            col(SurveyResponse.retention_expires_at) <= cutoff,
        )
        .distinct()
        .order_by(col(SurveyResponse.survey_id))
    )
    return list(result.all())


async def _reconcile_count(session: AsyncSession, survey: Survey) -> None:
    result = await session.exec(
        select(func.count())
        .select_from(SurveyResponse)
        .where(
            col(SurveyResponse.survey_id) == survey.id,
            col(SurveyResponse.is_deleted).is_(False),
        )
    )
    survey.responses_count = result.one()


async def _due_count(session: AsyncSession, survey_id: UUID, cutoff: datetime) -> int:
    result = await session.exec(
        select(func.count())
        .select_from(SurveyResponse)
        .where(
            col(SurveyResponse.survey_id) == survey_id,
            col(SurveyResponse.is_deleted).is_(False),
            col(SurveyResponse.retention_expires_at).is_not(None),
            col(SurveyResponse.retention_expires_at) <= cutoff,
        )
    )
    return result.one()


async def _purge_expired_google_auth_proofs(
    session: AsyncSession,
    cutoff: datetime,
    *,
    batch_size: int,
    dry_run: bool,
) -> int:
    """Delete expired session proofs in bounded, audited retention transactions."""
    if dry_run:
        result = await session.exec(
            select(func.count())
            .select_from(GoogleSurveyAuthProof)
            .where(col(GoogleSurveyAuthProof.expires_at) <= cutoff)
        )
        count = result.one()
        await session.rollback()
        return count

    purged_count = 0
    while True:
        statement = (
            select(GoogleSurveyAuthProof)
            .where(col(GoogleSurveyAuthProof.expires_at) <= cutoff)
            .order_by(col(GoogleSurveyAuthProof.session_id))
            .limit(batch_size)
        )
        bind = session.get_bind()
        dialect_name = getattr(getattr(bind, "dialect", None), "name", "")
        if dialect_name == "postgresql":
            statement = statement.with_for_update(skip_locked=True)
        else:
            statement = statement.with_for_update()
        proofs = list((await session.exec(statement)).all())
        if not proofs:
            await session.rollback()
            break

        for proof in proofs:
            await session.delete(proof)
        try:
            await commit_with_audit(
                session,
                [
                    AuditEvent(
                        action="retention_purge",
                        resource_type="google_survey_auth_proof_retention",
                        resource_id="google-survey-auth-proofs",
                        performed_by=settings.SYSTEM_ACTOR_ID,
                        changes={"purged_count": len(proofs), "cutoff": cutoff},
                        ip_address=None,
                    )
                ],
            )
        except Exception:
            await session.rollback()
            raise
        purged_count += len(proofs)

    return purged_count


async def purge_expired_responses(
    session: AsyncSession,
    *,
    cutoff: datetime | None = None,
    batch_size: int = DEFAULT_RETENTION_BATCH_SIZE,
    dry_run: bool = False,
) -> RetentionPurgeResult:
    """Purge due live responses in survey-locked, audited bounded batches."""
    if batch_size < 1:
        raise ValueError("batch_size must be positive")

    normalized_cutoff = _normalize_cutoff(cutoff)
    survey_ids = await _due_survey_ids(session, normalized_cutoff)
    purged_count = 0
    batch_count = 0

    for survey_id in survey_ids:
        if dry_run:
            purged_count += await _due_count(session, survey_id, normalized_cutoff)
            await session.rollback()
            continue

        while True:
            # A survey lock is acquired before any response locks. This also
            # serializes responses_count reconciliation with submissions and
            # other response lifecycle mutations.
            survey = await resolve_survey(
                session,
                survey_id,
                include_deleted=True,
                for_update=True,
            )
            statement = (
                select(SurveyResponse)
                .where(
                    col(SurveyResponse.survey_id) == survey_id,
                    col(SurveyResponse.is_deleted).is_(False),
                    col(SurveyResponse.retention_expires_at).is_not(None),
                    col(SurveyResponse.retention_expires_at) <= normalized_cutoff,
                )
                .order_by(col(SurveyResponse.id))
                .limit(batch_size)
            )
            bind = session.get_bind()
            dialect_name = getattr(getattr(bind, "dialect", None), "name", "")
            if dialect_name == "postgresql":
                statement = statement.with_for_update(skip_locked=True)
            else:
                statement = statement.with_for_update()
            responses_result = await session.exec(statement)
            responses = list(responses_result.all())
            if not responses:
                # The survey lock and the SELECT both begin a transaction on
                # SQLite and PostgreSQL. Release them before moving to the
                # next survey (or returning an empty batch).
                await session.rollback()
                break

            count = await tombstone_responses(
                session,
                responses,
                settings.SYSTEM_ACTOR_ID,
            )
            await _reconcile_count(session, survey)
            now = utc_now()
            survey.updated_at = now
            survey.performed_by = settings.SYSTEM_ACTOR_ID
            session.add(survey)
            try:
                await commit_with_audit(
                    session,
                    [
                        AuditEvent(
                            action="retention_purge",
                            resource_type="survey_response_retention",
                            resource_id=survey.survey_id,
                            performed_by=settings.SYSTEM_ACTOR_ID,
                            changes={
                                "purged_count": count,
                                "cutoff": normalized_cutoff,
                            },
                            ip_address=None,
                        )
                    ],
                )
            except Exception:
                # commit_with_audit is fail-closed; keep this boundary
                # defensive if the audit implementation is replaced in a
                # maintenance/test environment.
                await session.rollback()
                raise
            purged_count += count
            batch_count += 1

    proof_purged_count = await _purge_expired_google_auth_proofs(
        session,
        normalized_cutoff,
        batch_size=batch_size,
        dry_run=dry_run,
    )

    # Also close the discovery transaction when every survey was dry-run or
    # when the due-row set was empty.
    await session.rollback()

    return RetentionPurgeResult(
        cutoff=normalized_cutoff,
        purged_count=purged_count,
        proof_purged_count=proof_purged_count,
        survey_count=len(survey_ids),
        batch_count=batch_count,
        dry_run=dry_run,
    )
