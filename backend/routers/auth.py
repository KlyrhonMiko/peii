from datetime import UTC, datetime

from fastapi import APIRouter, Request

from core.config import settings
from core.deps import AsyncDBSession, CurrentPrincipal
from core.exceptions import AppError
from core.responses import success_response
from schemas.auth import (
    AuthSession,
    CurrentUser,
    LoginRequest,
    PasswordChangeRequest,
    PasswordRecoveryRequest,
)
from schemas.common import APIResponse
from services import auth_service
from services.audit_service import AuditEvent, commit_with_audit
from services.supabase_auth_service import send_recovery_email, update_password

router = APIRouter()


def _ip_address(request: Request) -> str | None:
    return request.client.host if request.client else None


@router.post(
    "/login",
    response_model=APIResponse[AuthSession],
    summary="Log in",
    description="Authenticate with a PEII username or email and Supabase password.",
)
async def login(
    payload: LoginRequest, session: AsyncDBSession, request: Request
) -> APIResponse[AuthSession]:
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
    current_user = CurrentUser(
        id=principal.user.id,
        user_id=principal.user.user_id,
        email=principal.user.email,
        username=principal.user.username,
        first_name=principal.user.first_name,
        last_name=principal.user.last_name,
        permissions=permissions,
        roles=roles,
    )
    return success_response(current_user)


@router.post(
    "/logout",
    response_model=APIResponse[None],
    summary="Log out",
    description="Record a logout before the session layer clears Supabase cookies.",
)
async def logout(
    session: AsyncDBSession, principal: CurrentPrincipal, request: Request
) -> APIResponse[None]:
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
async def recover_password(payload: PasswordRecoveryRequest) -> APIResponse[None]:
    if settings.APP_ORIGIN is None:
        raise AppError("Application origin is not configured.", status_code=503)
    redirect_to = f"{settings.APP_ORIGIN}/auth/confirm?next=/reset-password"
    await send_recovery_email(payload.email, redirect_to)
    return success_response(None, message="If the account exists, a recovery email has been sent.")


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
    await update_password(principal.access_token, payload.password)
    await auth_service.record_password_change(session, principal.user, _ip_address(request))
    return success_response(None, message="Password updated.")
