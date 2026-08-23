import pytest
from sqlmodel import select

from core.database import get_async_session
from main import app
from models.audit_log import AuditLog
from models.rbac import Role, UserRole
from models.user import User
from services import user_service

pytestmark = pytest.mark.anyio


def user_payload(email: str = "user@example.com") -> dict[str, object]:
    return {
        "email": email,
        "username": email.split("@")[0].replace(".", ""),
        "first_name": "Jane",
        "last_name": "Doe",
        "is_active": True,
    }


async def test_invite_creates_linked_user(client):
    response = await client.post("/api/v1/users/", json=user_payload())

    assert response.status_code == 201
    data = response.json()["data"]
    assert data["email"] == "user@example.com"
    assert "password" not in data
    assert "role" not in data
    assert data["roles"] == []
    assert data["invited_at"] is not None
    assert data["onboarding_completed_at"] is None
    assert data["last_login_at"] is None

    session_generator = app.dependency_overrides[get_async_session]()
    session = await anext(session_generator)
    try:
        user = (await session.exec(select(User).where(User.email == "user@example.com"))).one()
    finally:
        await session_generator.aclose()
    assert user.auth_user_id is not None
    assert user.invited_at is not None


async def test_user_read_includes_assigned_role_names(client):
    create_response = await client.post("/api/v1/users/", json=user_payload())
    user_id = create_response.json()["data"]["user_id"]

    session_generator = app.dependency_overrides[get_async_session]()
    session = await anext(session_generator)
    try:
        user = (await session.exec(select(User).where(User.user_id == user_id))).one()
        role = Role(name="reviewer", performed_by=user.id)
        session.add(role)
        await session.flush()
        session.add(UserRole(user_id=user.id, role_id=role.id, performed_by=user.id))
        await session.commit()
    finally:
        await session_generator.aclose()

    response = await client.get(f"/api/v1/users/{user_id}")

    assert response.status_code == 200
    assert response.json()["data"]["roles"] == ["reviewer"]


async def test_resend_invitation_sends_recovery_email_updates_timestamp_and_audits(
    client, monkeypatch
):
    create_response = await client.post("/api/v1/users/", json=user_payload())
    user_id = create_response.json()["data"]["user_id"]
    sent: dict[str, str] = {}

    async def capture_recovery(email: str, redirect_to: str) -> None:
        sent["email"] = email
        sent["redirect_to"] = redirect_to

    monkeypatch.setattr(user_service, "send_recovery_email", capture_recovery)

    response = await client.post(f"/api/v1/users/{user_id}/invitation/resend")

    assert response.status_code == 200
    assert response.json()["data"]["invited_at"] is not None
    assert sent["email"] == "user@example.com"

    session_generator = app.dependency_overrides[get_async_session]()
    session = await anext(session_generator)
    try:
        audits = list(
            (
                await session.exec(
                    select(AuditLog).where(
                        AuditLog.resource_id == user_id,
                        AuditLog.action == "resend_invitation",
                    )
                )
            ).all()
        )
    finally:
        await session_generator.aclose()
    assert len(audits) == 1


async def test_resend_invitation_rejects_completed_onboarding_user(client, monkeypatch):
    create_response = await client.post("/api/v1/users/", json=user_payload())
    user_id = create_response.json()["data"]["user_id"]

    session_generator = app.dependency_overrides[get_async_session]()
    session = await anext(session_generator)
    try:
        user = (await session.exec(select(User).where(User.user_id == user_id))).one()
        user.onboarding_completed_at = user.created_at
        session.add(user)
        await session.commit()
    finally:
        await session_generator.aclose()

    async def unexpected_recovery(*_: str) -> None:
        raise AssertionError("Recovery email must not be sent.")

    monkeypatch.setattr(user_service, "send_recovery_email", unexpected_recovery)
    response = await client.post(f"/api/v1/users/{user_id}/invitation/resend")

    assert response.status_code == 409
    assert response.json()["message"] == "User is not eligible for invitation resend."


async def test_revoke_sessions_audits_successful_revocation(client, monkeypatch):
    create_response = await client.post("/api/v1/users/", json=user_payload())
    user_id = create_response.json()["data"]["user_id"]
    revoked: list[str] = []

    async def capture_revoke(auth_user_id):
        revoked.append(str(auth_user_id))

    monkeypatch.setattr(user_service, "revoke_auth_user_sessions", capture_revoke)
    response = await client.post(f"/api/v1/users/{user_id}/sessions/revoke")

    assert response.status_code == 200
    assert len(revoked) == 1

    session_generator = app.dependency_overrides[get_async_session]()
    session = await anext(session_generator)
    try:
        audits = list(
            (
                await session.exec(
                    select(AuditLog).where(
                        AuditLog.resource_id == user_id,
                        AuditLog.action == "revoke_sessions",
                    )
                )
            ).all()
        )
    finally:
        await session_generator.aclose()
    assert len(audits) == 1


async def test_invite_rejects_legacy_password_and_role_fields(client):
    response = await client.post(
        "/api/v1/users/",
        json={**user_payload(), "password": "secret", "role": "admin"},
    )

    assert response.status_code == 422
    assert response.json()["message"] == "Validation error."


async def test_list_users_has_no_role_filter(client):
    await client.post("/api/v1/users/", json=user_payload())
    response = await client.get("/api/v1/users/")

    assert response.status_code == 200
    assert "role" not in response.json()["meta"]["filters"]
    assert response.json()["meta"]["pagination"]["total"] == 1
