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


async def test_unrelated_researcher_cannot_discover_or_read_a_survey(client):
    created = await client.post("/api/v1/surveys/", json={"title": "Private survey"})
    assert created.status_code == 201
    survey_id = created.json()["data"]["survey_id"]

    override_principal(scoped_principal("surveys.read"))

    detail = await client.get(f"/api/v1/surveys/{survey_id}")
    listing = await client.get("/api/v1/surveys/")

    assert detail.status_code == 404
    assert listing.status_code == 200
    assert listing.json()["data"] == []
    assert listing.json()["meta"]["pagination"]["total"] == 0


async def test_read_permission_cannot_create_a_survey(client):
    override_principal(scoped_principal("surveys.read"))

    response = await client.post("/api/v1/surveys/", json={"title": "Forbidden"})

    assert response.status_code == 403


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
