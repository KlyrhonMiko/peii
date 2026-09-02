from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest

from core.deps import Principal, get_current_principal
from main import app
from models.user import User

pytestmark = pytest.mark.anyio
EXPIRY = (datetime.now(UTC) + timedelta(days=29)).isoformat()


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


async def test_survey_read_and_manage_capabilities_are_exact(client):
    created = await client.post("/api/v1/surveys/", json={"title": "Shared survey"})
    assert created.status_code == 201
    survey = created.json()["data"]

    override_principal(scoped_principal("surveys.read"))
    detail = await client.get(f"/api/v1/surveys/{survey['survey_id']}")
    listing = await client.get("/api/v1/surveys/")
    denied_create = await client.post("/api/v1/surveys/", json={"title": "Denied survey"})
    denied_update = await client.patch(
        f"/api/v1/surveys/{survey['survey_id']}", json={"title": "Updated shared survey"}
    )

    assert detail.status_code == 200
    assert listing.status_code == 200
    assert listing.json()["meta"]["pagination"]["total"] == 1
    assert denied_create.status_code == 403
    assert denied_update.status_code == 403

    override_principal(scoped_principal("surveys.manage"))
    denied_detail = await client.get(f"/api/v1/surveys/{survey['survey_id']}")
    denied_listing = await client.get("/api/v1/surveys/")
    updated = await client.patch(
        f"/api/v1/surveys/{survey['survey_id']}", json={"title": "Updated shared survey"}
    )
    archived = await client.request(
        "DELETE", f"/api/v1/surveys/{survey['survey_id']}", json={}
    )

    assert denied_detail.status_code == 403
    assert denied_listing.status_code == 403
    assert updated.status_code == 200
    assert archived.status_code == 200
    assert archived.json()["message"] == "Survey archived."


async def test_survey_structure_routes_require_surveys_manage(client):
    created = await client.post("/api/v1/surveys/", json={"title": "Structure survey"})
    survey_id = created.json()["data"]["id"]

    override_principal(scoped_principal("surveys.read"))
    denied_section_list = await client.get(f"/api/v1/surveys/{survey_id}/sections/")
    denied_question_list = await client.get(f"/api/v1/surveys/{survey_id}/questions/")

    assert denied_section_list.status_code == 403
    assert denied_question_list.status_code == 403

    override_principal(scoped_principal("surveys.manage"))
    section = await client.post(
        f"/api/v1/surveys/{survey_id}/sections/", json={"title": "Main"}
    )
    question = await client.post(
        f"/api/v1/surveys/{survey_id}/questions/",
        json={
            "question_text": "Answer",
            "question_type": "text",
            "section_id": section.json()["data"]["id"],
        },
    )

    assert section.status_code == 201
    assert question.status_code == 201




