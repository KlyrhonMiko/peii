from uuid import UUID

import pytest

from core.deps import Principal, get_current_principal
from main import app
from models.user import User

pytestmark = pytest.mark.anyio


def scoped_principal(*permissions: str) -> Principal:
    user = User(
        id=UUID("00000000-0000-0000-0000-000000000099"),
        user_id="USER-UNRELATED",
        auth_user_id=UUID("00000000-0000-0000-0000-000000000098"),
        email="unrelated@example.com",
        username="unrelated",
        first_name="Unrelated",
        last_name="User",
    )
    return Principal(user=user, permissions=frozenset(permissions), access_token="test")


def override_principal(principal: Principal) -> None:
    async def override() -> Principal:
        return principal

    app.dependency_overrides[get_current_principal] = override


async def test_authenticated_user_can_manage_any_survey_without_rbac_permissions(client):
    created = await client.post("/api/v1/surveys/", json={"title": "Shared survey"})
    assert created.status_code == 201
    survey = created.json()["data"]

    override_principal(scoped_principal())

    detail = await client.get(f"/api/v1/surveys/{survey['survey_id']}")
    listing = await client.get("/api/v1/surveys/")
    updated = await client.patch(
        f"/api/v1/surveys/{survey['survey_id']}", json={"title": "Updated shared survey"}
    )
    archived = await client.request(
        "DELETE", f"/api/v1/surveys/{survey['survey_id']}", json={}
    )

    assert detail.status_code == 200
    assert listing.status_code == 200
    assert listing.json()["meta"]["pagination"]["total"] == 1
    assert "access_level" not in detail.json()["data"]
    assert updated.status_code == 200
    assert archived.status_code == 200


async def test_authenticated_user_can_create_a_survey_without_rbac_permissions(client):
    override_principal(scoped_principal())

    response = await client.post("/api/v1/surveys/", json={"title": "Workspace survey"})

    assert response.status_code == 201


async def test_distribution_list_does_not_expose_bearer_tokens(client):
    created = await client.post(
        "/api/v1/surveys/with-structure",
        json={
            "title": "Token survey",
            "status": "Active",
            "sections": [
                {
                    "client_id": "section",
                    "title": "Main",
                    "questions": [
                        {
                            "client_id": "question",
                            "question_text": "Answer",
                            "question_type": "text",
                        }
                    ],
                }
            ],
        },
    )
    survey_id = created.json()["data"]["id"]
    distribution = await client.post(
        f"/api/v1/surveys/{survey_id}/distributions/",
        json={"expires_at": "2030-01-01T00:00:00+00:00"},
    )
    assert distribution.status_code == 201
    assert "token" in distribution.json()["data"]

    listed = await client.get(f"/api/v1/surveys/{survey_id}/distributions/")

    assert listed.status_code == 200
    assert "token" not in listed.json()["data"][0]


async def test_authenticated_user_can_manage_structure_distributions_and_archive(client):
    active = await client.post(
        "/api/v1/surveys/with-structure",
        json={
            "title": "Active shared survey",
            "status": "Active",
            "sections": [{
                "client_id": "section",
                "title": "Main",
                "questions": [{
                    "client_id": "question",
                    "question_text": "Answer",
                    "question_type": "text",
                }],
            }],
        },
    )
    inactive = await client.post("/api/v1/surveys/", json={"title": "Inactive shared survey"})
    override_principal(scoped_principal())
    updated = await client.patch(
        f"/api/v1/surveys/{active.json()['data']['survey_id']}", json={"title": "Edited survey"}
    )
    distribution = await client.post(
        f"/api/v1/surveys/{active.json()['data']['id']}/distributions/",
        json={"expires_at": "2030-01-01T00:00:00+00:00"},
    )
    section = await client.post(
        f"/api/v1/surveys/{inactive.json()['data']['id']}/sections/",
        json={"title": "Editor section"},
    )
    archived = await client.request(
        "DELETE", f"/api/v1/surveys/{active.json()['data']['survey_id']}", json={}
    )

    assert updated.status_code == 200
    assert distribution.status_code == 201
    assert section.status_code == 201
    assert archived.status_code == 200


async def test_survey_member_endpoints_are_not_registered(client):
    created = await client.post("/api/v1/surveys/", json={"title": "No members"})
    survey_id = created.json()["data"]["id"]

    response = await client.get(f"/api/v1/surveys/{survey_id}/members/")

    assert response.status_code == 404
