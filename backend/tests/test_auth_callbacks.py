import pytest

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
