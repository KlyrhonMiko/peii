import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest

from core.deps import Principal, get_current_principal
from main import app
from schemas.survey_analytics import SurveyResponseAggregate
from services import survey_analytics_service

pytestmark = pytest.mark.anyio
EXPIRY = (datetime.now(UTC) + timedelta(days=29)).isoformat()
CONSENT = {"accepted": True, "version": "2026-08-25"}


def _override_permissions(*permissions: str) -> None:
    async def override() -> Principal:
        from models.user import User

        return Principal(
            user=User(
                id=UUID("00000000-0000-0000-0000-000000000001"),
                user_id="USER-ANALYTICS",
                auth_user_id=UUID("00000000-0000-0000-0000-000000000002"),
                email="analytics@example.com",
                username="analytics",
                first_name="Analytics",
                last_name="Tester",
            ),
            permissions=frozenset(permissions),
            access_token="test",
        )

    app.dependency_overrides[get_current_principal] = override


async def _create_survey(client, status: str = "Inactive") -> tuple[dict, str, str]:
    survey_response = await client.post(
        "/api/v1/surveys/", json={"title": f"Analytics {uuid4()}"}
    )
    survey = survey_response.json()["data"]
    section_response = await client.post(
        f"/api/v1/surveys/{survey['id']}/sections/", json={"title": "Main"}
    )
    question_response = await client.post(
        f"/api/v1/surveys/{survey['id']}/questions/",
        json={
            "section_id": section_response.json()["data"]["id"],
            "question_text": "Choice",
            "question_type": "single_choice",
            "options": ["A", "B"],
        },
    )
    question_id = question_response.json()["data"]["id"]
    activated = await client.patch(
        f"/api/v1/surveys/{survey['survey_id']}", json={"status": "Active"}
    )
    assert activated.status_code == 200
    distribution = await client.post(
        f"/api/v1/surveys/{survey['id']}/distributions/", json={"expires_at": EXPIRY}
    )
    if status == "Inactive":
        changed = await client.patch(
            f"/api/v1/surveys/{survey['survey_id']}", json={"status": status}
        )
        assert changed.status_code == 200
    return survey, question_id, distribution.json()["data"]["token"]


@pytest.mark.parametrize("survey_status", ["Inactive", "Active", "Closed", "archived"])
async def test_aggregate_access_allows_every_survey_status(client, survey_status):
    _override_permissions(
        "surveys.manage",
        "survey_distributions.manage",
        "survey_responses.read_aggregates",
    )
    setup_status = "Inactive" if survey_status == "Inactive" else "Active"
    survey, _question, _token = await _create_survey(client, setup_status)

    if survey_status == "Closed":
        changed = await client.patch(
            f"/api/v1/surveys/{survey['survey_id']}", json={"status": "Closed"}
        )
        assert changed.status_code == 200
    elif survey_status == "archived":
        archived = await client.request(
            "DELETE", f"/api/v1/surveys/{survey['survey_id']}", json={}
        )
        assert archived.status_code == 200

    response = await client.get(
        f"/api/v1/surveys/{survey['id']}/responses/aggregates"
    )
    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"data", "message", "errors", "meta"}
    assert len(body["data"]) == 1
    assert body["data"][0]["question_type"] == "single_choice"
    assert body["data"][0]["total"] == 0
    assert body["data"][0]["cells"] == [
        {"value": "A", "count": 0, "rank": None, "row": None},
        {"value": "B", "count": 0, "rank": None, "row": None},
    ]
    assert body["message"] == "Success"
    assert body["errors"] is None
    assert body["meta"]["request_id"]


async def test_archived_aggregate_returns_exact_four_response_total(client):
    _override_permissions(
        "survey_responses.read_aggregates",
        "surveys.manage",
        "survey_distributions.manage",
    )
    survey, question_id, token = await _create_survey(client, "Closed")
    for _ in range(4):
        submitted = await client.post(
            f"/api/v1/survey/{token}/respond",
            json={
                "answers": {question_id: "A"},
                "consent": CONSENT,
                "withdrawal_code": secrets.token_urlsafe(32),
            },
            headers={"Idempotency-Key": str(uuid4())},
        )
        assert submitted.status_code == 201

    changed = await client.patch(
        f"/api/v1/surveys/{survey['survey_id']}", json={"status": "Closed"}
    )
    assert changed.status_code == 200
    archived = await client.request(
        "DELETE", f"/api/v1/surveys/{survey['survey_id']}", json={}
    )
    assert archived.status_code == 200

    response = await client.get(
        f"/api/v1/surveys/{survey['id']}/responses/aggregates"
    )
    assert response.status_code == 200
    assert response.json()["data"][0]["total"] == 4


def test_aggregate_contracts_do_not_expose_raw_answers() -> None:
    aggregate = SurveyResponseAggregate
    assert "answers" not in aggregate.model_fields
    assert "answer" not in aggregate.model_fields
    assert "answers" not in str(aggregate.model_json_schema())


def test_postgresql_analytics_query_is_set_based_and_not_raw() -> None:
    query = survey_analytics_service.POSTGRES_AGGREGATE_SQL
    assert "jsonb_array_elements" in query
    assert "jsonb_each_text" in query
    assert "GROUP BY" in query
    assert "SELECT answers" not in query
    assert "retention_expires_at" in query


def test_aggregate_cell_cardinality_is_bounded() -> None:
    assert survey_analytics_service.MAX_AGGREGATE_CELLS_PER_QUESTION == 1000
    assert survey_analytics_service.MAX_AGGREGATE_CELLS_TOTAL == 10000
