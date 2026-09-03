from types import SimpleNamespace
from typing import Any, cast
from uuid import UUID

import pytest
from sqlmodel import select

from core import deps
from core.auth import AuthClaims, verify_bearer_token
from core.database import get_async_session
from core.deps import Principal, get_current_principal
from core.exceptions import AppError
from main import app
from models.rbac import Permission, Role, RolePermission, UserRole
from models.user import User
from services.rbac_service import DEFAULT_ROLES, SHARED_SURVEY_CAPABILITIES

pytestmark = pytest.mark.anyio


def test_shared_survey_default_role_capabilities_are_exact():
    assert SHARED_SURVEY_CAPABILITIES <= DEFAULT_ROLES["admin"]
    assert DEFAULT_ROLES["researcher"] & SHARED_SURVEY_CAPABILITIES == (
        SHARED_SURVEY_CAPABILITIES - {"survey_responses.erase"}
    )
    assert DEFAULT_ROLES["staff"] & SHARED_SURVEY_CAPABILITIES == {
        "surveys.read",
        "survey_responses.read_aggregates",
    }
    assert {"portal.access", "ml.models.read", "ml.sentiment.run"} <= DEFAULT_ROLES[
        "researcher"
    ]
    assert {"portal.access", "ml.models.read"} <= DEFAULT_ROLES["staff"]


def override_principal(principal: Principal) -> None:
    async def override() -> Principal:
        return principal

    app.dependency_overrides[get_current_principal] = override


async def test_ml_routes_require_their_specific_permissions(client, principal):
    override_principal(
        Principal(
            user=principal.user,
            permissions=frozenset({"portal.access"}),
            access_token="test",
        )
    )
    assert (await client.get("/api/v1/ml/models")).status_code == 403

    override_principal(
        Principal(
            user=principal.user,
            permissions=frozenset({"ml.models.read"}),
            access_token="test",
        )
    )
    assert (await client.get("/api/v1/ml/models")).status_code == 200
    assert (
        await client.post("/api/v1/ml/sentiment", json={"text": "Magandang araw"})
    ).status_code == 403


async def test_user_status_update_does_not_require_profile_update(client, principal):
    created = await client.post(
        "/api/v1/users/",
        json={
            "email": "status@example.com",
            "username": "status-user",
            "first_name": "Status",
            "last_name": "User",
        },
    )
    user_id = created.json()["data"]["user_id"]
    override_principal(
        Principal(
            user=principal.user,
            permissions=frozenset({"users.change_status"}),
            access_token="test",
        )
    )

    response = await client.patch(f"/api/v1/users/{user_id}", json={"is_active": True})

    assert response.status_code == 200


async def test_current_principal_rejects_without_portal_access(monkeypatch):
    user = User(
        id=UUID("00000000-0000-0000-0000-000000000001"),
        user_id="USER-NOPORTAL",
        auth_user_id=UUID("00000000-0000-0000-0000-000000000002"),
        email="no-portal@example.com",
        username="no-portal",
        first_name="No",
        last_name="Portal",
    )

    async def fake_get_user(_session, _subject):
        return user

    async def fake_permissions(_session, _user_id):
        return ["surveys.read"]

    monkeypatch.setattr(deps.auth_service, "get_user_by_auth_subject", fake_get_user)
    monkeypatch.setattr(
        deps.auth_service.rbac_service, "effective_permissions", fake_permissions
    )

    claims = SimpleNamespace(
        subject=user.auth_user_id, access_token="test", has_oauth_amr=False
    )
    with pytest.raises(AppError) as exc_info:
        await deps.get_current_principal(
            session=cast(Any, None), claims=cast(AuthClaims, claims)
        )
    assert exc_info.value.status_code == 403
    assert "permission" in str(exc_info.value)


async def _session() -> tuple[Any, Any]:
    generator = app.dependency_overrides[get_async_session]()
    return await anext(generator), generator


async def test_me_requires_portal_access(client):
    # Exercise the real dependency chain: verify bearer token -> get_current_principal.
    app.dependency_overrides.pop(get_current_principal, None)
    auth_user_id = UUID("00000000-0000-0000-0000-000000000301")
    session, generator = await _session()
    try:
        user = User(
            user_id="USER-MECLOSED",
            auth_user_id=auth_user_id,
            email="me-closed@example.com",
            username="me-closed",
            first_name="Me",
            last_name="Closed",
        )
        session.add(user)
        permission = Permission(code="surveys.read", description="Read surveys.")
        session.add(permission)
        await session.flush()
        role = Role(name="closed-role")
        session.add(role)
        await session.flush()
        session.add(RolePermission(role_id=role.id, permission_id=permission.id))
        session.add(UserRole(user_id=user.id, role_id=role.id))
        await session.commit()
    finally:
        await generator.aclose()

    async def claims_override() -> AuthClaims:
        return AuthClaims(
            subject=auth_user_id,
            access_token="test",
            amr=("password",),
            is_anonymous=False,
        )

    app.dependency_overrides[verify_bearer_token] = claims_override

    response = await client.get("/api/v1/auth/me")
    assert response.status_code == 403
    assert response.json()["message"] == "You do not have permission to perform this action."

    # Granting portal.access unlocks the same account.
    session, generator = await _session()
    try:
        permission = (
            await session.exec(
                select(Permission).where(Permission.code == "portal.access")
            )
        ).first()
        if permission is None:
            permission = Permission(code="portal.access", description="Access portal.")
            session.add(permission)
        role = (await session.exec(select(Role).where(Role.name == "closed-role"))).one()
        await session.flush()
        session.add(RolePermission(role_id=role.id, permission_id=permission.id))
        await session.commit()
    finally:
        await generator.aclose()

    response = await client.get("/api/v1/auth/me")
    assert response.status_code == 200
