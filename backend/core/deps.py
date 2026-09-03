from dataclasses import dataclass
from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from fastapi import Depends, Query
from sqlmodel import Session
from sqlmodel.ext.asyncio.session import AsyncSession

from core.auth import AuthClaims, verify_bearer_token
from core.database import get_async_session, get_session
from core.exceptions import AppError
from models.user import User
from schemas.common import AuditQueryParams, ListQueryParams
from services import auth_service

DBSession = Annotated[Session, Depends(get_session)]
AsyncDBSession = Annotated[AsyncSession, Depends(get_async_session)]


@dataclass(frozen=True)
class Principal:
    user: User
    permissions: frozenset[str]
    access_token: str


@dataclass(frozen=True)
class GoogleSurveyRespondent:
    """Identity proven by Google, Supabase, and a short-lived attestation proof."""

    auth_user_id: UUID
    session_id: UUID
    subject_digest: str
    email: str
    display_name: str | None = None
    email_verified: bool = True


async def get_current_principal(
    session: AsyncDBSession,
    claims: Annotated[AuthClaims, Depends(verify_bearer_token)],
) -> Principal:
    if claims.has_oauth_amr:
        raise AppError("Authentication is not available for this account.", status_code=401)
    user = await auth_service.get_user_by_auth_subject(session, claims.subject)
    permissions = frozenset(
        await auth_service.rbac_service.effective_permissions(session, user.id)
    )
    if "portal.access" not in permissions:
        raise AppError(
            "You do not have permission to perform this action.", status_code=403
        )
    return Principal(user=user, permissions=permissions, access_token=claims.access_token)


CurrentPrincipal = Annotated[Principal, Depends(get_current_principal)]


async def get_google_survey_respondent(
    session: AsyncDBSession,
    claims: Annotated[AuthClaims, Depends(verify_bearer_token)],
) -> GoogleSurveyRespondent:
    from services import google_survey_auth_service

    proof = await google_survey_auth_service.load_valid_google_proof(session, claims)
    return GoogleSurveyRespondent(
        auth_user_id=proof.auth_user_id,
        session_id=proof.session_id,
        subject_digest=proof.google_subject_digest,
        email=proof.verified_email,
        display_name=proof.display_name,
        email_verified=proof.email_verified,
    )


CurrentGoogleSurveyRespondent = Annotated[
    GoogleSurveyRespondent, Depends(get_google_survey_respondent)
]


def require_permissions(*required: str):
    async def dependency(principal: CurrentPrincipal) -> Principal:
        if not set(required).issubset(principal.permissions):
            raise AppError("You do not have permission to perform this action.", status_code=403)
        return principal

    return dependency


def get_list_query_params(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    sort_order: Literal["asc", "desc"] = Query(default="desc"),
    include_deleted: bool = Query(default=False),
) -> ListQueryParams:
    return ListQueryParams(
        limit=limit,
        offset=offset,
        sort_order=sort_order,
        include_deleted=include_deleted,
    )


ListParams = Annotated[ListQueryParams, Depends(get_list_query_params)]


def get_audit_query_params(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    sort_order: Literal["asc", "desc"] = Query(default="desc"),
    include_deleted: bool = Query(default=False),
    created_from: datetime | None = Query(default=None),
    created_to: datetime | None = Query(default=None),
    updated_from: datetime | None = Query(default=None),
    updated_to: datetime | None = Query(default=None),
    deleted_from: datetime | None = Query(default=None),
    deleted_to: datetime | None = Query(default=None),
    performed_by: UUID | None = Query(default=None),
) -> AuditQueryParams:
    return AuditQueryParams(
        limit=limit,
        offset=offset,
        sort_order=sort_order,
        include_deleted=include_deleted,
        created_from=created_from,
        created_to=created_to,
        updated_from=updated_from,
        updated_to=updated_to,
        deleted_from=deleted_from,
        deleted_to=deleted_to,
        performed_by=performed_by,
    )


AuditParams = Annotated[AuditQueryParams, Depends(get_audit_query_params)]
