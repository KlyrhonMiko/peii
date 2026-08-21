import pytest

pytestmark = pytest.mark.anyio


async def _create_survey_with_section(client, title: str) -> tuple[str, str, str]:
    survey_response = await client.post(
        "/api/v1/surveys/",
        json={"title": title, "status": "Active"},
    )
    survey = survey_response.json()["data"]
    section_response = await client.post(
        f"/api/v1/surveys/{survey['id']}/sections/",
        json={"title": "Main"},
    )
    return survey["id"], survey["survey_id"], section_response.json()["data"]["id"]


async def test_question_cannot_use_a_section_from_another_survey(client):
    survey_a, _, _ = await _create_survey_with_section(client, "Survey A")
    survey_b, survey_b_business_id, section_b = await _create_survey_with_section(
        client, "Survey B"
    )

    response = await client.post(
        f"/api/v1/surveys/{survey_a}/questions/",
        json={
            "question_text": "Foreign question",
            "question_type": "text",
            "section_id": section_b,
        },
    )

    assert response.status_code == 400
    assert response.json()["data"] is None
    assert (await client.get(f"/api/v1/surveys/{survey_a}/questions/")).json()["data"] == []
    assert (
        await client.get(f"/api/v1/surveys/{survey_b_business_id}")
    ).json()["data"]["questions"] == []


async def test_section_delete_requires_explicit_cascade(client):
    survey_uuid, _, section_id = await _create_survey_with_section(client, "Cascade Survey")
    question = await client.post(
        f"/api/v1/surveys/{survey_uuid}/questions/",
        json={
            "question_text": "Child",
            "question_type": "text",
            "section_id": section_id,
        },
    )
    question_id = question.json()["data"]["id"]

    rejected = await client.request(
        "DELETE",
        f"/api/v1/surveys/{survey_uuid}/sections/{section_id}",
    )
    assert rejected.status_code == 409

    deleted = await client.request(
        "DELETE",
        f"/api/v1/surveys/{survey_uuid}/sections/{section_id}",
        json={"cascade_questions": True},
    )
    assert deleted.status_code == 200
    assert deleted.json()["data"]["is_deleted"] is True
    assert (await client.get(f"/api/v1/surveys/{survey_uuid}/questions/")).json()["data"] == []

    questions = await client.get(f"/api/v1/surveys/{survey_uuid}/questions/")
    assert all(item["id"] != question_id for item in questions.json()["data"])


async def test_duplicate_question_reorder_ids_are_rejected(client):
    survey_uuid, _, section_id = await _create_survey_with_section(client, "Order Survey")
    first = await client.post(
        f"/api/v1/surveys/{survey_uuid}/questions/",
        json={"question_text": "First", "question_type": "text", "section_id": section_id},
    )
    first_id = first.json()["data"]["id"]

    response = await client.patch(
        f"/api/v1/surveys/{survey_uuid}/questions/reorder",
        json={"section_id": section_id, "question_ids": [first_id, first_id]},
    )
    assert response.status_code == 422


async def test_structure_replace_returns_canonical_ids_and_revision(client):
    survey_uuid, survey_business_id, _ = await _create_survey_with_section(
        client, "Structure Survey"
    )
    response = await client.put(
        f"/api/v1/surveys/{survey_uuid}/structure",
        json={
            "expected_revision": 0,
            "sections": [
                {
                    "client_id": "local-section",
                    "title": "Employment",
                    "description": None,
                    "questions": [
                        {
                            "client_id": "local-question",
                            "question_text": "Status",
                            "question_type": "text",
                            "options": None,
                            "config": None,
                            "is_required": False,
                        }
                    ],
                }
            ],
        },
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["structure_revision"] == 1
    assert len(data["sections"]) == 1
    assert len(data["sections"][0]["questions"]) == 1
    assert data["sections"][0]["questions"][0]["is_required"] is False
    assert data["sections"][0]["questions"][0]["section_id"] == data["sections"][0]["id"]

    unchanged = await client.put(
        f"/api/v1/surveys/{survey_uuid}/structure",
        json={
            "expected_revision": 1,
            "sections": [
                {
                    "client_id": data["sections"][0]["id"],
                    "id": data["sections"][0]["id"],
                    "title": "Employment",
                    "description": None,
                    "questions": [
                        {
                            "client_id": data["sections"][0]["questions"][0]["id"],
                            "id": data["sections"][0]["questions"][0]["id"],
                            "question_text": "Status",
                            "question_type": "text",
                            "options": None,
                            "config": None,
                            "is_required": False,
                        }
                    ],
                }
            ],
        },
    )
    assert unchanged.status_code == 200
    assert unchanged.json()["data"]["structure_revision"] == 2

    stale = await client.put(
        f"/api/v1/surveys/{survey_uuid}/structure",
        json={"expected_revision": 1, "sections": []},
    )
    assert stale.status_code == 409

    fetched = await client.get(f"/api/v1/surveys/{survey_business_id}")
    assert fetched.json()["data"]["structure_revision"] == 2


async def test_distribution_keeps_published_structure_after_new_draft(client):
    survey_uuid, _, section_id = await _create_survey_with_section(client, "Version Survey")
    question = await client.post(
        f"/api/v1/surveys/{survey_uuid}/questions/",
        json={"question_text": "Published", "question_type": "text", "section_id": section_id},
    )
    question_id = question.json()["data"]["id"]
    distribution = await client.post(
        f"/api/v1/surveys/{survey_uuid}/distributions/",
        json={"expires_at": "2099-01-01T00:00:00+00:00"},
    )
    token = distribution.json()["data"]["token"]
    published_version = distribution.json()["data"]["version_id"]

    await client.post(f"/api/v1/surveys/{survey_uuid}/draft")
    draft = await client.get(f"/api/v1/surveys/{survey_uuid}/questions/")
    draft_question_id = draft.json()["data"][0]["id"]
    assert draft_question_id != question_id

    public = await client.get(f"/api/v1/survey/{token}")
    assert public.status_code == 200
    assert public.json()["data"]["questions"][0]["id"] == question_id
    assert published_version == distribution.json()["data"]["version_id"]


async def test_response_rejects_unknown_and_missing_required_questions(client):
    survey_uuid, _, section_id = await _create_survey_with_section(client, "Response Integrity")
    question = await client.post(
        f"/api/v1/surveys/{survey_uuid}/questions/",
        json={
            "question_text": "Required status",
            "question_type": "single_choice",
            "options": ["Yes", "No"],
            "section_id": section_id,
        },
    )
    question_id = question.json()["data"]["id"]
    distribution = await client.post(
        f"/api/v1/surveys/{survey_uuid}/distributions/",
        json={"expires_at": "2099-01-01T00:00:00+00:00"},
    )
    token = distribution.json()["data"]["token"]

    unknown = await client.post(
        f"/api/v1/survey/{token}/respond",
        json={"answers": {"00000000-0000-0000-0000-000000000000": "Yes"}},
    )
    assert unknown.status_code == 422

    missing = await client.post(
        f"/api/v1/survey/{token}/respond",
        json={"answers": {}},
    )
    assert missing.status_code == 422

    valid = await client.post(
        f"/api/v1/survey/{token}/respond",
        json={"answers": {question_id: "Yes"}},
    )
    assert valid.status_code == 201
