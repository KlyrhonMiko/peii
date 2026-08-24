import pytest
from sqlmodel import select

from core.database import get_async_session
from core.deps import Principal, get_current_principal
from core.exceptions import AppError
from main import app
from models.audit_log import AuditLog
from models.user import User
from routers import auth
from services import user_service

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

    async def successful_password_update(_: str, __: str) -> None:
        return None

    app.dependency_overrides[get_current_principal] = override_principal
    monkeypatch.setattr(auth, "update_password", successful_password_update)
    response = await client.post(
        "/api/v1/auth/password/change", json={"password": "a secure password"}
    )

    assert response.status_code == 200

    session_generator = app.dependency_overrides[get_async_session]()
    session = await anext(session_generator)
    try:
        updated_user = (await session.exec(select(User).where(User.user_id == user_id))).one()
    finally:
        await session_generator.aclose()
    assert updated_user.onboarding_completed_at is not None


async def test_logout_revokes_the_supabase_session_before_auditing(client, monkeypatch):
    revoked: list[str] = []

    async def capture_logout(access_token: str) -> None:
        revoked.append(access_token)

    monkeypatch.setattr(auth, "logout_user_session", capture_logout)
    response = await client.post("/api/v1/auth/logout")

    assert response.status_code == 200
    assert revoked == ["test"]

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
    async def failed_logout(_: str) -> None:
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
