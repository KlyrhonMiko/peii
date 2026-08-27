import secrets
from datetime import UTC, datetime, timedelta
from typing import cast
from uuid import UUID, uuid4

import pytest
from sqlmodel import select

from core.database import get_async_session
from core.deps import Principal, get_current_principal
from main import app
from models.survey_response import SurveyResponse

pytestmark = pytest.mark.anyio


def _override_permissions(*permissions: str) -> None:
    async def override() -> Principal:
        from models.user import User

        return Principal(
            user=User(
                id=UUID("00000000-0000-0000-0000-000000000001"),
                user_id="USER-TESTADMIN",
                auth_user_id=UUID("00000000-0000-0000-0000-000000000002"),
                email="admin@example.com",
                username="admin",
                first_name="Test",
                last_name="Admin",
            ),
            permissions=frozenset(permissions),
            access_token="test",
        )

    app.dependency_overrides[get_current_principal] = override


async def _create_response_fixture(client, distribution_count: int = 1):
    survey_response = await client.post(
        "/api/v1/surveys/", json={"title": f"Raw Listing {uuid4()}"}
    )
    survey = survey_response.json()["data"]
    section = await client.post(
        f"/api/v1/surveys/{survey['id']}/sections/", json={"title": "Main"}
    )
    question = await client.post(
        f"/api/v1/surveys/{survey['id']}/questions/",
        json={
            "question_text": "Answer",
            "question_type": "text",
            "section_id": section.json()["data"]["id"],
        },
    )
    activated = await client.patch(
        f"/api/v1/surveys/{survey['survey_id']}", json={"status": "Active"}
    )
    assert activated.status_code == 200

    distributions = []
    for _ in range(distribution_count):
        distribution = await client.post(
            f"/api/v1/surveys/{survey['id']}/distributions/",
            json={"expires_at": (datetime.now(UTC) + timedelta(days=29)).isoformat()},
        )
        assert distribution.status_code == 201
        distributions.append(distribution.json()["data"])
    return survey, question.json()["data"]["id"], distributions


async def _submit(client, token: str, question_id: str, answer: str) -> None:
    response = await client.post(
        f"/api/v1/survey/{token}/respond",
        json={
            "answers": {question_id: answer},
            "consent": {"accepted": True, "version": "2026-08-25"},
            "withdrawal_code": secrets.token_urlsafe(32),
        },
        headers={"Idempotency-Key": str(uuid4())},
    )
    assert response.status_code == 201


async def _stored_responses() -> list[SurveyResponse]:
    session_generator = app.dependency_overrides[get_async_session]()
    session = await anext(session_generator)
    try:
        return list((await session.exec(select(SurveyResponse))).all())
    finally:
        await session_generator.aclose()


async def _update_responses(responses: list[SurveyResponse]) -> None:
    session_generator = app.dependency_overrides[get_async_session]()
    session = await anext(session_generator)
    try:
        for response in responses:
            session.add(response)
        await session.commit()
    finally:
        await session_generator.aclose()


async def test_raw_listing_requires_raw_permission(client):
    survey, _question_id, _distributions = await _create_response_fixture(client)
    _override_permissions("surveys.manage")

    response = await client.get(f"/api/v1/surveys/{survey['id']}/responses/")

    assert response.status_code == 403
    assert response.json()["data"] is None
    assert response.json()["meta"]["request_id"]


@pytest.mark.parametrize(
    "query",
    [
        {"limit": "0"},
        {"limit": "101"},
        {"offset": "-1"},
        {"sort_by": "answers"},
    ],
)
async def test_raw_listing_rejects_invalid_query_bounds_and_sort(client, query):
    survey, _question_id, _distributions = await _create_response_fixture(client)

    response = await client.get(
        f"/api/v1/surveys/{survey['id']}/responses/", params=query
    )

    assert response.status_code == 422
    body = response.json()
    assert body["data"] is None
    assert body["message"] == "Validation error."
    assert body["errors"]
    assert body["meta"]["request_id"]


async def test_raw_listing_filters_and_count_use_the_same_live_rows(client):
    survey, question_id, distributions = await _create_response_fixture(client, 2)
    await _submit(client, distributions[0]["token"], question_id, "first")
    await _submit(client, distributions[0]["token"], question_id, "second")
    await _submit(client, distributions[1]["token"], question_id, "other")

    responses = await _stored_responses()
    responses.sort(key=lambda response: response.created_at)
    responses[0].created_at = datetime(2026, 1, 1, 12, 0, 0)
    responses[1].created_at = datetime(2026, 1, 2, 12, 0, 0)
    responses[2].created_at = datetime(2026, 1, 3, 12, 0, 0)
    await _update_responses(responses)

    response = await client.get(
        f"/api/v1/surveys/{survey['id']}/responses/",
        params={
            "limit": 1,
            "distribution_id": distributions[0]["id"],
            "submitted_from": "2026-01-01T00:00:00Z",
            "submitted_before": "2026-01-03T00:00:00Z",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["meta"]["pagination"] == {
        "total": 2,
        "count": 1,
        "limit": 1,
        "offset": 0,
        "has_next": True,
        "has_prev": False,
    }
    assert body["meta"]["filters"] == {
        "sort_by": "created_at",
        "sort_order": "desc",
        "submitted_from": "2026-01-01T00:00:00Z",
        "submitted_before": "2026-01-03T00:00:00Z",
        "distribution_id": distributions[0]["id"],
    }


async def test_raw_listing_has_stable_created_at_id_order(client):
    survey, question_id, distributions = await _create_response_fixture(client)
    await _submit(client, distributions[0]["token"], question_id, "first")
    await _submit(client, distributions[0]["token"], question_id, "second")
    responses = await _stored_responses()
    responses[0].created_at = datetime(2026, 2, 1, 12, 0, 0)
    responses[1].created_at = datetime(2026, 2, 1, 12, 0, 0)
    await _update_responses(responses)

    response = await client.get(
        f"/api/v1/surveys/{survey['id']}/responses/",
        params={"sort_order": "asc"},
    )

    assert response.status_code == 200
    assert [item["id"] for item in response.json()["data"]] == [
        str(item.id) for item in sorted(responses, key=lambda item: item.id)
    ]


async def test_raw_listing_excludes_deleted_and_expired_even_if_requested(client):
    survey, question_id, distributions = await _create_response_fixture(client)
    for answer in ("deleted", "expired", "live"):
        await _submit(client, distributions[0]["token"], question_id, answer)
    responses = await _stored_responses()
    responses.sort(key=lambda response: cast(str, response.answers[question_id]))
    responses[0].is_deleted = True
    responses[1].retention_expires_at = datetime(2020, 1, 1)
    await _update_responses(responses)

    response = await client.get(
        f"/api/v1/surveys/{survey['id']}/responses/",
        params={"include_deleted": "true", "answers": "live"},
    )

    assert response.status_code == 200
    assert [item["answers"][question_id] for item in response.json()["data"]] == ["live"]
    assert response.json()["meta"]["pagination"]["total"] == 1
    assert "include_deleted" not in response.json()["meta"]["filters"]
    assert "answers" not in response.json()["meta"]["filters"]
    parameter_names = {
        parameter["name"]
        for parameter in app.openapi()["paths"][
            "/api/v1/surveys/{survey_id}/responses/"
        ]["get"]["parameters"]
    }
    assert "include_deleted" not in parameter_names
    assert "answers" not in parameter_names


async def test_raw_listing_allows_authorized_reads_of_archived_surveys(client):
    survey, question_id, distributions = await _create_response_fixture(client)
    await _submit(client, distributions[0]["token"], question_id, "archived")
    archived = await client.request("DELETE", f"/api/v1/surveys/{survey['survey_id']}", json={})
    assert archived.status_code == 200

    response = await client.get(f"/api/v1/surveys/{survey['id']}/responses/")

    assert response.status_code == 200
    assert response.json()["meta"]["pagination"]["total"] == 1


async def test_raw_listing_rejects_non_increasing_submitted_range(client):
    survey, _question_id, _distributions = await _create_response_fixture(client)

    response = await client.get(
        f"/api/v1/surveys/{survey['id']}/responses/",
        params={
            "submitted_from": "2026-01-02T00:00:00Z",
            "submitted_before": "2026-01-02T00:00:00Z",
        },
    )

    assert response.status_code == 422
    body = response.json()
    assert body["data"] is None
    assert "submitted_from must be earlier than submitted_before" in body["message"]
    assert body["errors"][0]["loc"] == ["query", "submitted_from"]
