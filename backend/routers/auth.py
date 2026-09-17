from datetime import UTC, datetime
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, Request

from core.auth import AuthClaims, verify_bearer_token
from core.client_ip import resolve_client_ip
from core.config import settings
from core.deps import AsyncDBSession, CurrentPrincipal
from core.exceptions import AppError
from core.rate_limit import (
    check_google_survey_attestation,
    enforce_authenticated_password_rate_limit,
    enforce_identifier_rate_limit,
    get_redis_client,
    normalize_rate_limit_identifier,
)
from core.responses import success_response
from models.user import User
from schemas.auth import (
    AuthSession,
    CurrentUser,
    CurrentUserUpdate,
    GoogleSurveyAttestationAcknowledgement,
    GoogleSurveyAttestationRequest,
    LoginRequest,
    PasswordChangeRequest,
    PasswordRecoveryRequest,
    PasswordResetRequest,
)
from schemas.common import APIResponse
from services import auth_service, google_survey_auth_service
from services.audit_service import AuditEvent, commit_with_audit
from services.password_reset_grant import (
    consume_password_reset_grant,
    verify_password_reset_grant,
)
from services.supabase_auth_service import (
    LogoutUserSessionError,
    logout_user_session,
    request_password_reauthentication,
    send_recovery_email,
    update_password,
)

router = APIRouter()


def _ip_address(request: Request) -> str | None:
    return resolve_client_ip(request)


def _current_user_response(
    user: User, permissions: list[str], roles: list[str]
) -> CurrentUser:
    return CurrentUser(
        id=user.id,
        user_id=user.user_id,
        email=user.email,
        username=user.username,
        first_name=user.first_name,
        last_name=user.last_name,
        middle_name=user.middle_name,
        contact=user.contact,
        permissions=permissions,
        roles=roles,
    )


async def _logout_after_password_reset(access_token: str) -> None:
    for attempt in range(2):
        try:
            await logout_user_session(access_token, "global")
            return
        except (httpx.TransportError, LogoutUserSessionError) as exc:
            retryable = isinstance(exc, httpx.TransportError) or exc.retryable
            if not retryable or attempt == 1:
                break
    raise AppError(
        "Password may have changed, but sign-out could not be confirmed. "
        "Please sign in again or request a new recovery link.",
        status_code=502,
    )


@router.post(
    "/survey/google/attest",
    response_model=APIResponse[GoogleSurveyAttestationAcknowledgement],
    summary="Attest Google survey access",
    description="Verify a Google access token against the authenticated Supabase session.",
)
async def attest_google_survey_access(
    payload: GoogleSurveyAttestationRequest,
    session: AsyncDBSession,
    request: Request,
    claims: Annotated[AuthClaims, Depends(verify_bearer_token)],
) -> APIResponse[GoogleSurveyAttestationAcknowledgement]:
    await check_google_survey_attestation(
        request,
        subject=claims.subject,
        session_id=claims.session_id,
    )
    await google_survey_auth_service.attest_google_survey_session(
        session,
        claims,
        payload.provider_token,
        ip_address=_ip_address(request),
    )
    return success_response(
        GoogleSurveyAttestationAcknowledgement(attested=True),
        message="Google survey access attested.",
    )


@router.post(
    "/login",
    response_model=APIResponse[AuthSession],
    summary="Log in",
    description="Authenticate with a PEII username or email and Supabase password.",
)
async def login(
    payload: LoginRequest, session: AsyncDBSession, request: Request
) -> APIResponse[AuthSession]:
    identifier = normalize_rate_limit_identifier(payload.identifier)
    await enforce_identifier_rate_limit("login", f"identifier:{identifier}")
    user, session_data = await auth_service.authenticate(
        session, payload.identifier, payload.password
    )
    user.last_login_at = datetime.now(UTC).replace(tzinfo=None)
    user.performed_by = user.id
    session.add(user)
    event = AuditEvent("login", "user", user.user_id, user.id, ip_address=_ip_address(request))
    await commit_with_audit(session, [event])
    return success_response(AuthSession.model_validate(session_data), message="Logged in.")


@router.get(
    "/me",
    response_model=APIResponse[CurrentUser],
    summary="Get current user",
    description="Return the active PEII account and effective permissions.",
)
async def me(session: AsyncDBSession, principal: CurrentPrincipal) -> APIResponse[CurrentUser]:
    permissions, roles = await auth_service.current_user_data(session, principal.user)
    return success_response(_current_user_response(principal.user, permissions, roles))


@router.patch(
    "/me",
    response_model=APIResponse[CurrentUser],
    summary="Update current user",
    description=(
        "Update the authenticated user's username, names, and contact details. "
        "Email, status, roles, and permissions remain server-managed."
    ),
)
async def update_me(
    payload: CurrentUserUpdate,
    session: AsyncDBSession,
    principal: CurrentPrincipal,
    request: Request,
) -> APIResponse[CurrentUser]:
    user = await auth_service.update_current_user(
        session,
        principal.user,
        payload,
        ip_address=_ip_address(request),
    )
    permissions, roles = await auth_service.current_user_data(session, user)
    return success_response(
        _current_user_response(user, permissions, roles),
        message="Profile updated.",
    )


@router.post(
    "/logout",
    response_model=APIResponse[None],
    summary="Log out",
    description="Record a logout before the session layer clears Supabase cookies.",
)
async def logout(
    session: AsyncDBSession, principal: CurrentPrincipal, request: Request
) -> APIResponse[None]:
    await logout_user_session(principal.access_token, "global")
    event = AuditEvent(
        "logout",
        "user",
        principal.user.user_id,
        principal.user.id,
        ip_address=_ip_address(request),
    )
    await commit_with_audit(session, [event])
    return success_response(None, message="Logged out.")


@router.post(
    "/password/recover",
    response_model=APIResponse[None],
    summary="Request password recovery",
    description="Request a recovery email without revealing account existence.",
)
async def recover_password(
    payload: PasswordRecoveryRequest,
) -> APIResponse[None]:
    email = normalize_rate_limit_identifier(payload.email)
    await enforce_identifier_rate_limit("password-recovery", f"email:{email}")
    redirect_to = f"{settings.APP_ORIGIN}/auth/confirm?next=/reset-password"
    await send_recovery_email(email, redirect_to)
    return success_response(None, message="If the account exists, a recovery email has been sent.")


@router.post(
    "/password/reauthenticate",
    response_model=APIResponse[None],
    summary="Request password reauthentication",
    description="Request a Supabase password-change reauthentication nonce.",
)
async def reauthenticate_password(
    principal: CurrentPrincipal,
) -> APIResponse[None]:
    await enforce_authenticated_password_rate_limit(
        "password-reauthenticate", principal.user.auth_user_id, principal.session_id
    )
    await request_password_reauthentication(principal.access_token)
    return success_response(None, message="Reauthentication email sent.")


@router.post(
    "/password/change",
    response_model=APIResponse[None],
    summary="Change password",
    description="Change the authenticated user's Supabase password.",
)
async def change_password(
    payload: PasswordChangeRequest,
    session: AsyncDBSession,
    principal: CurrentPrincipal,
    request: Request,
) -> APIResponse[None]:
    await enforce_authenticated_password_rate_limit(
        "password-change", principal.user.auth_user_id, principal.session_id
    )
    await update_password(principal.access_token, payload.password, payload.nonce)
    await auth_service.record_password_change(session, principal.user, _ip_address(request))
    return success_response(None, message="Password updated.")


@router.post(
    "/password/reset",
    response_model=APIResponse[None],
    summary="Reset a password after recovery or invitation",
    description="Consume a verified, one-time invite or recovery reset grant.",
)
async def reset_password(
    payload: PasswordResetRequest,
    session: AsyncDBSession,
    request: Request,
    claims: Annotated[AuthClaims, Depends(verify_bearer_token)],
) -> APIResponse[None]:
    if claims.is_anonymous is True or claims.has_oauth_amr or claims.session_id is None:
        raise AppError("Password reset confirmation is invalid or expired.", status_code=401)
    grant = verify_password_reset_grant(payload.grant, settings.PASSWORD_RESET_GRANT_SECRET)
    if grant.subject != claims.subject or grant.session_id != claims.session_id:
        raise AppError("Password reset confirmation is invalid or expired.", status_code=401)
    user = await auth_service.get_user_by_auth_subject(session, claims.subject)
    await consume_password_reset_grant(
        grant,
        get_redis_client(),
        settings.PASSWORD_RESET_GRANT_SECRET,
    )
    await update_password(claims.access_token, payload.password)
    await _logout_after_password_reset(claims.access_token)
    await auth_service.record_password_change(session, user, _ip_address(request))
    return success_response(None, message="Password updated.")
