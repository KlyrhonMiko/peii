from uuid import UUID

from fastapi import status
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from core.exceptions import AppError
from models.survey import Survey
from models.survey_membership import SurveyMembership
from models.user import User
from schemas.rbac import SurveyMembershipCreate, SurveyMembershipUpdate
from services.audit_service import AuditEvent, commit_with_audit
from services.base_service import utc_now


async def list_members(session: AsyncSession, survey_id: UUID) -> list[SurveyMembership]:
    result = await session.exec(
        select(SurveyMembership)
        .where(
            col(SurveyMembership.survey_id) == survey_id,
            col(SurveyMembership.is_deleted).is_(False),
        )
        .order_by(col(SurveyMembership.created_at), col(SurveyMembership.id))
    )
    return list(result.all())


async def add_member(
    session: AsyncSession,
    survey: Survey,
    payload: SurveyMembershipCreate,
    actor_id: UUID,
    ip_address: str | None = None,
) -> SurveyMembership:
    if payload.user_id == survey.owner_id:
        raise AppError(
            "The survey owner cannot be a collaborator.",
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        )
    user = (
        await session.exec(
            select(User).where(
                col(User.id) == payload.user_id,
                col(User.is_deleted).is_(False),
                col(User.is_active).is_(True),
            )
        )
    ).first()
    if user is None:
        raise AppError("User not found.", status_code=status.HTTP_404_NOT_FOUND)
    membership = (
        await session.exec(
            select(SurveyMembership).where(
                col(SurveyMembership.survey_id) == survey.id,
                col(SurveyMembership.user_id) == payload.user_id,
            )
        )
    ).first()
    if membership is None:
        membership = SurveyMembership(
            survey_id=survey.id,
            user_id=payload.user_id,
            access_level=payload.access_level,
            performed_by=actor_id,
        )
        action = "share"
    elif not membership.is_deleted:
        raise AppError("User is already a collaborator.", status_code=status.HTTP_409_CONFLICT)
    else:
        membership.is_deleted = False
        membership.deleted_at = None
        membership.access_level = payload.access_level
        membership.performed_by = actor_id
        membership.updated_at = utc_now()
        action = "share"
    session.add(membership)
    await commit_with_audit(
        session,
        [
            AuditEvent(
                action, "survey_membership", str(membership.id), actor_id, ip_address=ip_address
            )
        ],
    )
    await session.refresh(membership)
    return membership


async def update_member(
    session: AsyncSession,
    survey_id: UUID,
    user_id: UUID,
    payload: SurveyMembershipUpdate,
    actor_id: UUID,
    ip_address: str | None = None,
) -> SurveyMembership:
    membership = (
        await session.exec(
            select(SurveyMembership).where(
                col(SurveyMembership.survey_id) == survey_id,
                col(SurveyMembership.user_id) == user_id,
                col(SurveyMembership.is_deleted).is_(False),
            )
        )
    ).first()
    if membership is None:
        raise AppError("Collaborator not found.", status_code=status.HTTP_404_NOT_FOUND)
    before = membership.access_level
    membership.access_level = payload.access_level
    membership.performed_by = actor_id
    session.add(membership)
    await commit_with_audit(
        session,
        [
            AuditEvent(
                "share",
                "survey_membership",
                str(membership.id),
                actor_id,
                changes={"access_level": {"before": before, "after": payload.access_level}},
                ip_address=ip_address,
            )
        ],
    )
    await session.refresh(membership)
    return membership


async def remove_member(
    session: AsyncSession,
    survey_id: UUID,
    user_id: UUID,
    actor_id: UUID,
    ip_address: str | None = None,
) -> None:
    membership = (
        await session.exec(
            select(SurveyMembership).where(
                col(SurveyMembership.survey_id) == survey_id,
                col(SurveyMembership.user_id) == user_id,
                col(SurveyMembership.is_deleted).is_(False),
            )
        )
    ).first()
    if membership is None:
        raise AppError("Collaborator not found.", status_code=status.HTTP_404_NOT_FOUND)
    membership.is_deleted = True
    membership.deleted_at = utc_now()
    membership.performed_by = actor_id
    session.add(membership)
    await commit_with_audit(
        session,
        [
            AuditEvent(
                "unshare", "survey_membership", str(membership.id), actor_id, ip_address=ip_address
            )
        ],
    )


async def transfer_ownership(
    session: AsyncSession,
    survey: Survey,
    user_id: UUID,
    actor_id: UUID,
    ip_address: str | None = None,
) -> Survey:
    user = (
        await session.exec(
            select(User).where(
                col(User.id) == user_id,
                col(User.is_deleted).is_(False),
                col(User.is_active).is_(True),
            )
        )
    ).first()
    if user is None:
        raise AppError("User not found.", status_code=status.HTTP_404_NOT_FOUND)
    previous_owner_id = survey.owner_id
    survey.owner_id = user_id
    survey.performed_by = actor_id
    session.add(survey)
    previous_membership = (
        await session.exec(
            select(SurveyMembership).where(
                col(SurveyMembership.survey_id) == survey.id,
                col(SurveyMembership.user_id) == previous_owner_id,
            )
        )
    ).first()
    if previous_membership is None:
        previous_membership = SurveyMembership(
            survey_id=survey.id,
            user_id=previous_owner_id,
            access_level="editor",
            performed_by=actor_id,
        )
    else:
        previous_membership.is_deleted = False
        previous_membership.deleted_at = None
        previous_membership.access_level = "editor"
        previous_membership.performed_by = actor_id
    session.add(previous_membership)
    await commit_with_audit(
        session,
        [
            AuditEvent(
                "transfer",
                "survey",
                survey.survey_id,
                actor_id,
                changes={"owner_id": {"before": previous_owner_id, "after": user_id}},
                ip_address=ip_address,
            )
        ],
    )
    await session.refresh(survey)
    return survey
