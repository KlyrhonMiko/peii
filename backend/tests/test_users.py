import pytest
from sqlmodel import select

from core.database import get_async_session
from main import app
from models.user import User

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

    session_generator = app.dependency_overrides[get_async_session]()
    session = await anext(session_generator)
    try:
        user = (await session.exec(select(User).where(User.email == "user@example.com"))).one()
    finally:
        await session_generator.aclose()
    assert user.auth_user_id is not None
    assert user.invited_at is not None


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
