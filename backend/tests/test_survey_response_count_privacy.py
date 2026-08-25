from uuid import UUID, uuid4

import pytest

from core.deps import Principal, get_current_principal
from main import app
from models.question_type import QuestionType
from models.survey_question import SurveyQuestion
from services import response_service, survey_privacy

pytestmark = pytest.mark.anyio


def _override_permissions(*permissions: str) -> None:
    async def override() -> Principal:
        from models.user import User

        return Principal(
            user=User(
                id=UUID("00000000-0000-0000-0000-000000000001"),
                user_id="USER-PRIVACY",
                auth_user_id=UUID("00000000-0000-0000-0000-000000000002"),
                email="privacy@example.com",
                username="privacy",
                first_name="Privacy",
                last_name="Tester",
            ),
            permissions=frozenset(permissions),
            access_token="test",
        )

    app.dependency_overrides[get_current_principal] = override


async def _create_counted_survey(client, response_count: int) -> dict[str, str]:
    survey_response = await client.post(
        "/api/v1/surveys/", json={"title": f"Privacy survey {uuid4()}"}
    )
    survey = survey_response.json()["data"]
    section_response = await client.post(
        f"/api/v1/surveys/{survey['id']}/sections/", json={"title": "Main"}
    )
    question_response = await client.post(
        f"/api/v1/surveys/{survey['id']}/questions/",
        json={
            "section_id": section_response.json()["data"]["id"],
            "question_text": "Answer",
            "question_type": "text",
        },
    )
    activated = await client.patch(
        f"/api/v1/surveys/{survey['survey_id']}", json={"status": "Active"}
    )
    assert activated.status_code == 200
    distribution_response = await client.post(
        f"/api/v1/surveys/{survey['id']}/distributions/",
        json={"expires_at": "2099-01-01T00:00:00+00:00"},
    )
    token = distribution_response.json()["data"]["token"]
    question_id = question_response.json()["data"]["id"]
    for _ in range(response_count):
        submitted = await client.post(
            f"/api/v1/survey/{token}/respond",
            json={"answers": {question_id: "answer"}},
            headers={"Idempotency-Key": str(uuid4())},
        )
        assert submitted.status_code == 201
    return survey


async def test_read_and_aggregate_capabilities_project_count_at_k_boundary(client):
    below = await _create_counted_survey(
        client, survey_privacy.RESPONSE_COUNT_PRIVACY_THRESHOLD - 1
    )
    at_boundary = await _create_counted_survey(
        client, survey_privacy.RESPONSE_COUNT_PRIVACY_THRESHOLD
    )

    _override_permissions("surveys.read")
    read_only = await client.get("/api/v1/surveys/")
    assert all(item["responses_count"] is None for item in read_only.json()["data"])
    read_only_detail = await client.get(f"/api/v1/surveys/{below['survey_id']}")
    assert read_only_detail.json()["data"]["responses_count"] is None

    _override_permissions("surveys.read", "survey_responses.read_aggregates")
    aggregate_below = await client.get(f"/api/v1/surveys/{below['survey_id']}")
    aggregate_at_boundary = await client.get(f"/api/v1/surveys/{at_boundary['survey_id']}")
    assert aggregate_below.json()["data"]["responses_count"] is None
    assert (
        aggregate_at_boundary.json()["data"]["responses_count"]
        == survey_privacy.RESPONSE_COUNT_PRIVACY_THRESHOLD
    )


@pytest.mark.parametrize(
    "exact_capability",
    [
        "survey_responses.read_raw",
        "survey_responses.export",
        "survey_responses.erase",
    ],
)
async def test_each_exact_count_capability_exposes_exact_count(client, exact_capability):
    survey = await _create_counted_survey(client, 4)
    _override_permissions("surveys.read", exact_capability)

    listing = await client.get(f"/api/v1/surveys/?search={survey['survey_id']}")
    detail = await client.get(f"/api/v1/surveys/{survey['survey_id']}")

    assert listing.json()["data"][0]["responses_count"] == 4
    assert detail.json()["data"]["responses_count"] == 4


async def test_create_update_archive_restore_and_structured_reads_are_projected(client):
    _override_permissions("surveys.manage")
    created = await client.post("/api/v1/surveys/", json={"title": "Private create"})
    assert created.status_code == 201
    assert created.json()["data"]["responses_count"] is None

    structured = await client.post(
        "/api/v1/surveys/with-structure",
        json={
            "title": "Private structured create",
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
    assert structured.status_code == 201
    assert structured.json()["data"]["responses_count"] is None

    _override_permissions("surveys.manage", "survey_distributions.manage")
    survey = await _create_counted_survey(client, 0)
    _override_permissions("surveys.manage")
    updated = await client.patch(
        f"/api/v1/surveys/{survey['survey_id']}", json={"title": "Updated"}
    )
    archived = await client.request("DELETE", f"/api/v1/surveys/{survey['survey_id']}", json={})
    restored = await client.post(f"/api/v1/surveys/{survey['survey_id']}/restore", json={})

    assert updated.json()["data"]["responses_count"] is None
    assert archived.json()["data"]["responses_count"] is None
    assert restored.json()["data"]["responses_count"] is None


async def test_response_count_sort_requires_exact_capability(client):
    await _create_counted_survey(client, 0)

    _override_permissions("surveys.read", "survey_responses.read_aggregates")
    rejected = await client.get("/api/v1/surveys/?sort_by=responses_count")
    assert rejected.status_code == 403
    assert rejected.json()["data"] is None
    assert "responses_count" in rejected.json()["message"]

    _override_permissions("surveys.read", "survey_responses.read_raw")
    allowed = await client.get("/api/v1/surveys/?sort_by=responses_count")
    assert allowed.status_code == 200


def test_aggregate_suppression_uses_shared_threshold(monkeypatch):
    question = SurveyQuestion(
        id=UUID("00000000-0000-0000-0000-000000000011"),
        survey_id=UUID("00000000-0000-0000-0000-000000000001"),
        section_id=UUID("00000000-0000-0000-0000-000000000010"),
        question_text="Choice",
        question_type=QuestionType.SINGLE_CHOICE,
        options='["A", "B"]',
    )
    state = response_service._new_aggregate_state(question)
    for _ in range(5):
        response_service._accumulate_aggregate_answer(state, "A")

    monkeypatch.setattr(survey_privacy, "RESPONSE_COUNT_PRIVACY_THRESHOLD", 6)

    assert response_service._finalize_aggregate(state) is None
