import base64
import hashlib
import hmac
import json
import time
from uuid import UUID

import httpx
import pytest
from sqlmodel import select

from core.auth import AuthClaims, verify_bearer_token
from core.config import settings
from core.database import get_async_session
from core.deps import Principal, get_current_principal
from core.exceptions import AppError
from main import app
from models.audit_log import AuditLog
from models.user import User
from routers import auth
from services import user_service
from services.supabase_auth_service import LogoutUserSessionError

pytestmark = pytest.mark.anyio


async def test_password_recovery_uses_confirmation_callback(client, monkeypatch):
    sent: dict[str, str] = {}

    async def capture_recovery(email: str, redirect_to: str) -> None:
        sent["email"] = email
        sent["redirect_to"] = redirect_to

    monkeypatch.setattr(auth, "send_recovery_email", capture_recovery)

    response = await client.post(
        "/api/v1/auth/password/recover", json={"email": "user@example.com"}
    )

    assert response.status_code == 200
    assert sent == {
        "email": "user@example.com",
        "redirect_to": "http://localhost:3000/auth/confirm?next=/reset-password",
    }


async def test_invitation_uses_confirmation_callback(client, monkeypatch):
    sent: dict[str, str] = {}

    async def no_existing_auth_user(email: str) -> None:
        return None

    async def capture_invitation(email: str, redirect_to: str) -> dict[str, dict[str, str]]:
        sent["email"] = email
        sent["redirect_to"] = redirect_to
        return {"user": {"id": "00000000-0000-0000-0000-000000000003"}}

    monkeypatch.setattr(user_service, "get_auth_user_by_email", no_existing_auth_user)
    monkeypatch.setattr(user_service, "invite_user", capture_invitation)

    response = await client.post(
        "/api/v1/users/",
        json={
            "email": "invitee@example.com",
            "username": "invitee",
            "first_name": "Invited",
            "last_name": "User",
            "is_active": True,
        },
    )

    assert response.status_code == 201
    assert sent == {
        "email": "invitee@example.com",
        "redirect_to": "http://localhost:3000/auth/confirm?next=/reset-password",
    }


async def test_first_successful_password_change_completes_onboarding(client, monkeypatch):
    create_response = await client.post(
        "/api/v1/users/",
        json={
            "email": "onboarding@example.com",
            "username": "onboarding",
            "first_name": "Onboarding",
            "last_name": "User",
        },
    )
    user_id = create_response.json()["data"]["user_id"]

    session_generator = app.dependency_overrides[get_async_session]()
    session = await anext(session_generator)
    try:
        user = (await session.exec(select(User).where(User.user_id == user_id))).one()
    finally:
        await session_generator.aclose()

    async def override_principal() -> Principal:
        return Principal(user=user, permissions=frozenset(), access_token="test")

    async def successful_password_update(_: str, __: str, ___: str | None = None) -> None:
        return None

    app.dependency_overrides[get_current_principal] = override_principal
    monkeypatch.setattr(auth, "update_password", successful_password_update)
    response = await client.post(
        "/api/v1/auth/password/change",
        json={"password": "a secure password", "nonce": "email-nonce"},
    )

    assert response.status_code == 200

    session_generator = app.dependency_overrides[get_async_session]()
    session = await anext(session_generator)
    try:
        updated_user = (await session.exec(select(User).where(User.user_id == user_id))).one()
    finally:
        await session_generator.aclose()
    assert updated_user.onboarding_completed_at is not None


async def test_password_change_requires_only_password_and_reauthentication_nonce(client):
    missing_nonce = await client.post(
        "/api/v1/auth/password/change", json={"password": "a secure password"}
    )
    extra_field = await client.post(
        "/api/v1/auth/password/change",
        json={"password": "a secure password", "nonce": "email-nonce", "other": "nope"},
    )

    assert missing_nonce.status_code == 422
    assert extra_field.status_code == 422


async def test_password_reauthentication_uses_the_authenticated_session(client, monkeypatch):
    calls: list[str] = []

    async def reauthenticate(access_token: str) -> None:
        calls.append(access_token)

    monkeypatch.setattr(auth, "request_password_reauthentication", reauthenticate, raising=False)

    response = await client.post("/api/v1/auth/password/reauthenticate")

    assert response.status_code == 200
    assert response.json()["message"] == "Reauthentication email sent."
    assert "request_id" in response.json()["meta"]
    assert calls == ["test"]


async def test_password_reset_consumes_the_matching_recovery_grant_before_updating(
    client, monkeypatch
):
    create_response = await client.post(
        "/api/v1/users/",
        json={
            "email": "recovery@example.com",
            "username": "recovery",
            "first_name": "Recovery",
            "last_name": "User",
        },
    )
    user_id = create_response.json()["data"]["user_id"]
    session_generator = app.dependency_overrides[get_async_session]()
    session = await anext(session_generator)
    try:
        user = (await session.exec(select(User).where(User.user_id == user_id))).one()
    finally:
        await session_generator.aclose()
    assert user.auth_user_id is not None

    session_id = "123e4567-e89b-42d3-a456-426614174000"
    now = int(time.time())
    payload = {
        "exp": now + 300,
        "jti": "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrs",
        "purpose": "recovery",
        "sid": session_id,
        "sub": str(user.auth_user_id),
        "v": 1,
    }
    encoded = base64.urlsafe_b64encode(
        json.dumps(payload, separators=(",", ":"), sort_keys=True).encode()
    ).rstrip(b"=").decode()
    secret = "0123456789abcdef0123456789abcdef"
    signature = base64.urlsafe_b64encode(
        hmac.new(secret.encode(), encoded.encode(), hashlib.sha256).digest()
    ).rstrip(b"=").decode()
    grant = f"{encoded}.{signature}"

    async def recovery_claims() -> AuthClaims:
        return AuthClaims(
            subject=user.auth_user_id,
            access_token="recovery-access-token",
            session_id=UUID(session_id),
            amr=("recovery",),
        )

    class Redis:
        async def set(self, *_args: object, **kwargs: object) -> bool:
            assert kwargs["nx"] is True
            assert isinstance(kwargs["ex"], int)
            return True

    operations: list[tuple[str, ...]] = []

    async def capture_password_update(
        token: str, password: str, nonce: str | None = None
    ) -> None:
        operations.append(("update", token, password))

    async def capture_logout(token: str, scope: str) -> None:
        operations.append(("logout", token, scope))

    async def capture_password_change(*_args: object) -> None:
        operations.append(("audit", ""))

    monkeypatch.setattr(settings, "PASSWORD_RESET_GRANT_SECRET", secret)
    monkeypatch.setattr(auth, "get_redis_client", lambda: Redis())
    monkeypatch.setattr(auth, "update_password", capture_password_update)
    monkeypatch.setattr(auth, "logout_user_session", capture_logout)
    monkeypatch.setattr(auth.auth_service, "record_password_change", capture_password_change)
    app.dependency_overrides[verify_bearer_token] = recovery_claims

    response = await client.post(
        "/api/v1/auth/password/reset",
        json={"password": "a secure password", "grant": grant},
    )

    assert response.status_code == 200
    assert "request_id" in response.json()["meta"]
    assert operations == [
        ("update", "recovery-access-token", "a secure password"),
        ("logout", "recovery-access-token", "global"),
        ("audit", ""),
    ]


async def test_password_reset_retries_only_transient_session_revocation_failures(monkeypatch):
    calls: list[tuple[str, str]] = []

    async def transient_logout(token: str, scope: str) -> None:
        calls.append((token, scope))
        if len(calls) == 1:
            raise LogoutUserSessionError(retryable=True)

    monkeypatch.setattr(auth, "logout_user_session", transient_logout)

    await auth._logout_after_password_reset("recovery-access-token")

    assert calls == [
        ("recovery-access-token", "global"),
        ("recovery-access-token", "global"),
    ]


async def test_password_reset_retries_transport_session_revocation_failures(monkeypatch):
    calls: list[tuple[str, str]] = []

    async def transient_logout(token: str, scope: str) -> None:
        calls.append((token, scope))
        if len(calls) == 1:
            raise httpx.ConnectError("connection failed")

    monkeypatch.setattr(auth, "logout_user_session", transient_logout)

    await auth._logout_after_password_reset("recovery-access-token")

    assert calls == [
        ("recovery-access-token", "global"),
        ("recovery-access-token", "global"),
    ]


async def test_password_reset_does_not_retry_nontransient_session_revocation_failure(monkeypatch):
    calls: list[tuple[str, str]] = []

    async def rejected_logout(token: str, scope: str) -> None:
        calls.append((token, scope))
        raise LogoutUserSessionError(retryable=False)

    monkeypatch.setattr(auth, "logout_user_session", rejected_logout)

    with pytest.raises(AppError) as exc_info:
        await auth._logout_after_password_reset("recovery-access-token")

    assert calls == [("recovery-access-token", "global")]
    assert exc_info.value.status_code == 502
    assert exc_info.value.message == (
        "Password may have changed, but sign-out could not be confirmed. "
        "Please sign in again or request a new recovery link."
    )


@pytest.mark.parametrize(
    ("is_anonymous", "amr"),
    [(True, ()), (None, ("oauth",))],
)
async def test_password_reset_rejects_anonymous_and_oauth_sessions(
    client, is_anonymous, amr
):
    async def ineligible_claims() -> AuthClaims:
        return AuthClaims(
            subject=UUID("123e4567-e89b-42d3-a456-426614174001"),
            access_token="ineligible-token",
            session_id=UUID("123e4567-e89b-42d3-a456-426614174000"),
            amr=amr,
            is_anonymous=is_anonymous,
        )

    app.dependency_overrides[verify_bearer_token] = ineligible_claims
    response = await client.post(
        "/api/v1/auth/password/reset",
        json={"password": "a secure password", "grant": "not-used"},
    )

    assert response.status_code == 401
    assert response.json()["message"] == "Password reset confirmation is invalid or expired."
    assert "request_id" in response.json()["meta"]


async def test_logout_revokes_the_supabase_session_before_auditing(client, monkeypatch):
    revoked: list[str] = []

    async def capture_logout(access_token: str, scope: str) -> None:
        revoked.append(f"{access_token}:{scope}")

    monkeypatch.setattr(auth, "logout_user_session", capture_logout)
    response = await client.post("/api/v1/auth/logout")

    assert response.status_code == 200
    assert revoked == ["test:global"]

    session_generator = app.dependency_overrides[get_async_session]()
    session = await anext(session_generator)
    try:
        audits = list(
            (
                await session.exec(
                    select(AuditLog).where(
                        AuditLog.resource_id == "USER-TESTADMIN",
                        AuditLog.action == "logout",
                    )
                )
            ).all()
        )
    finally:
        await session_generator.aclose()
    assert len(audits) == 1


async def test_logout_does_not_audit_when_supabase_revocation_fails(client, monkeypatch):
    async def failed_logout(_: str, __: str) -> None:
        raise AppError("Unable to log out.", status_code=502)

    monkeypatch.setattr(auth, "logout_user_session", failed_logout)
    response = await client.post("/api/v1/auth/logout")

    assert response.status_code == 502

    session_generator = app.dependency_overrides[get_async_session]()
    session = await anext(session_generator)
    try:
        audits = list(
            (
                await session.exec(
                    select(AuditLog).where(
                        AuditLog.resource_id == "USER-TESTADMIN",
                        AuditLog.action == "logout",
                    )
                )
            ).all()
        )
    finally:
        await session_generator.aclose()
    assert not audits
