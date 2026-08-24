import pytest

from core.deps import Principal, get_current_principal
from main import app
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
