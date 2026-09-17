from uuid import UUID

import pytest
from sqlmodel import select

from core.database import get_async_session
from core.deps import Principal, get_current_principal
from main import app
from models.audit_log import AuditLog
from models.user import User

pytestmark = pytest.mark.anyio


async def _persist_current_user(
    *,
    username: str = "profile-user",
    middle_name: str | None = "Marie",
    contact: str | None = "+639171234567",
) -> User:
    session_generator = app.dependency_overrides[get_async_session]()
    session = await anext(session_generator)
    try:
        user = User(
            id=UUID("00000000-0000-0000-0000-000000000010"),
            user_id="USER-PROFILE",
            auth_user_id=UUID("00000000-0000-0000-0000-000000000011"),
            email="profile@example.com",
            username=username,
            first_name="Profile",
            last_name="User",
            middle_name=middle_name,
            contact=contact,
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)
    finally:
        await session_generator.aclose()

    async def override_current_principal() -> Principal:
        return Principal(
            user=user,
            permissions=frozenset({"portal.access"}),
            access_token="test",
        )

    app.dependency_overrides[get_current_principal] = override_current_principal
    return user


async def _session_rows(model: type[object], **filters: object) -> list[object]:
    session_generator = app.dependency_overrides[get_async_session]()
    session = await anext(session_generator)
    try:
        statement = select(model)
        for field, value in filters.items():
            statement = statement.where(getattr(model, field) == value)
        return list((await session.exec(statement)).all())
    finally:
        await session_generator.aclose()


async def test_get_current_user_includes_profile_fields(client):
    await _persist_current_user()

    response = await client.get("/api/v1/auth/me")

    assert response.status_code == 200
    payload = response.json()
    assert {"data", "message", "errors", "meta"} <= payload.keys()
    assert payload["data"]["middle_name"] == "Marie"
    assert payload["data"]["contact"] == "+639171234567"


async def test_update_current_user_requires_authentication_without_mutation(client):
    await _persist_current_user()
    app.dependency_overrides.pop(get_current_principal, None)

    response = await client.patch(
        "/api/v1/auth/me",
        json={
            "username": "updated-profile",
            "first_name": "Updated",
            "last_name": "Researcher",
            "middle_name": None,
            "contact": None,
        },
    )

    assert response.status_code == 401
    payload = response.json()
    assert payload["data"] is None
    assert payload["message"] == "Authentication required."
    users = await _session_rows(User, user_id="USER-PROFILE")
    assert len(users) == 1
    stored_user = users[0]
    assert isinstance(stored_user, User)
    assert stored_user.username == "profile-user"
    assert stored_user.first_name == "Profile"
    assert await _session_rows(AuditLog, resource_id="USER-PROFILE", action="update") == []


async def test_update_current_user_trims_text_and_clears_blank_optional_fields(client):
    await _persist_current_user()

    response = await client.patch(
        "/api/v1/auth/me",
        json={
            "username": "  updated-profile  ",
            "first_name": " Updated ",
            "last_name": " Researcher\t",
            "middle_name": " \t ",
            "contact": "  ",
        },
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["username"] == "updated-profile"
    assert data["first_name"] == "Updated"
    assert data["last_name"] == "Researcher"
    assert data["middle_name"] is None
    assert data["contact"] is None


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("username", " \t "),
        ("first_name", "\n"),
        ("last_name", "   "),
    ],
)
async def test_update_current_user_rejects_whitespace_only_required_fields(
    client, field, value
):
    await _persist_current_user()

    response = await client.patch("/api/v1/auth/me", json={field: value})

    assert response.status_code == 422
    assert response.json()["message"] == "Validation error."


async def test_update_current_user_changes_allowed_fields_and_audits(client):
    user = await _persist_current_user()

    response = await client.patch(
        "/api/v1/auth/me",
        json={
            "username": "updated-profile",
            "first_name": "Updated",
            "last_name": "Researcher",
            "middle_name": None,
            "contact": None,
        },
        headers={"X-Request-ID": "profile-update-request"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["message"] == "Profile updated."
    assert payload["errors"] is None
    assert payload["meta"]["request_id"] == "profile-update-request"
    assert payload["data"] == {
        "id": str(user.id),
        "user_id": "USER-PROFILE",
        "email": "profile@example.com",
        "username": "updated-profile",
        "first_name": "Updated",
        "last_name": "Researcher",
        "middle_name": None,
        "contact": None,
        "permissions": [],
        "roles": [],
    }

    users = await _session_rows(User, user_id="USER-PROFILE")
    assert len(users) == 1
    stored_user = users[0]
    assert isinstance(stored_user, User)
    assert stored_user.username == "updated-profile"
    assert stored_user.first_name == "Updated"
    assert stored_user.last_name == "Researcher"
    assert stored_user.middle_name is None
    assert stored_user.contact is None

    audits = await _session_rows(
        AuditLog,
        resource_type="user",
        resource_id="USER-PROFILE",
        action="update",
    )
    assert len(audits) == 1
    audit = audits[0]
    assert isinstance(audit, AuditLog)
    assert audit.performed_by == user.id
    assert audit.request_id == "profile-update-request"
    assert audit.changes == {
        "username": {"before": "profile-user", "after": "updated-profile"},
        "first_name": {"before": "Profile", "after": "Updated"},
        "last_name": {"before": "User", "after": "Researcher"},
        "middle_name": {"before": "Marie", "after": None},
        "contact": {"before": "+639171234567", "after": None},
    }


async def test_update_current_user_rejects_duplicate_username_without_mutation(client):
    user = await _persist_current_user()
    session_generator = app.dependency_overrides[get_async_session]()
    session = await anext(session_generator)
    try:
        session.add(
            User(
                id=UUID("00000000-0000-0000-0000-000000000012"),
                user_id="USER-OTHER",
                auth_user_id=UUID("00000000-0000-0000-0000-000000000013"),
                email="other@example.com",
                username="taken-username",
                first_name="Other",
                last_name="User",
            )
        )
        await session.commit()
    finally:
        await session_generator.aclose()

    response = await client.patch(
        "/api/v1/auth/me",
        json={"username": "taken-username"},
    )

    assert response.status_code == 400
    assert response.json()["message"] == "A user with this username already exists."
    assert user.username == "profile-user"
    assert await _session_rows(AuditLog, resource_id="USER-PROFILE", action="update") == []


@pytest.mark.parametrize(
    "payload",
    [
        {"username": ""},
        {"username": "u" * 101},
    ],
)
async def test_update_current_user_rejects_invalid_username(client, payload):
    await _persist_current_user()

    response = await client.patch("/api/v1/auth/me", json=payload)

    assert response.status_code == 422
    assert response.json()["message"] == "Validation error."


@pytest.mark.parametrize(
    "forbidden_field",
    ["email", "is_active", "roles", "permissions", "auth_user_id", "performed_by"],
)
async def test_update_current_user_rejects_privileged_or_immutable_fields(
    client, forbidden_field
):
    await _persist_current_user()
    values = {
        "email": "changed@example.com",
        "is_active": False,
        "roles": ["admin"],
        "permissions": ["users.delete"],
        "auth_user_id": "00000000-0000-0000-0000-000000000099",
        "performed_by": "00000000-0000-0000-0000-000000000099",
    }

    response = await client.patch(
        "/api/v1/auth/me",
        json={forbidden_field: values[forbidden_field]},
    )

    assert response.status_code == 422
    assert response.json()["message"] == "Validation error."
    assert await _session_rows(AuditLog, resource_id="USER-PROFILE", action="update") == []


async def test_update_current_user_with_no_actual_changes_does_not_create_audit(client):
    await _persist_current_user()

    response = await client.patch(
        "/api/v1/auth/me",
        json={
            "username": "profile-user",
            "first_name": "Profile",
            "last_name": "User",
            "middle_name": "Marie",
            "contact": "+639171234567",
        },
    )

    assert response.status_code == 200
    assert await _session_rows(AuditLog, resource_id="USER-PROFILE", action="update") == []
