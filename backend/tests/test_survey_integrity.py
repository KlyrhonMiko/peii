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
    initial = (await client.get(f"/api/v1/surveys/{survey_business_id}")).json()["data"]
    response = await client.put(
        f"/api/v1/surveys/{survey_uuid}/structure",
        json={
            "expected_revision": initial["structure_revision"],
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
    assert data["structure_revision"] == initial["structure_revision"] + 1
    assert len(data["sections"]) == 1
    assert len(data["sections"][0]["questions"]) == 1
    assert data["sections"][0]["questions"][0]["is_required"] is False
    assert data["sections"][0]["questions"][0]["section_id"] == data["sections"][0]["id"]

    unchanged = await client.put(
        f"/api/v1/surveys/{survey_uuid}/structure",
        json={
            "expected_revision": data["structure_revision"],
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
    assert unchanged.json()["data"]["structure_revision"] == data["structure_revision"] + 1

    stale = await client.put(
        f"/api/v1/surveys/{survey_uuid}/structure",
        json={"expected_revision": data["structure_revision"], "sections": []},
    )
    assert stale.status_code == 409

    fetched = await client.get(f"/api/v1/surveys/{survey_business_id}")
    assert (
        fetched.json()["data"]["structure_revision"]
        == unchanged.json()["data"]["structure_revision"]
    )


async def test_structure_replace_can_swap_existing_sections(client):
    survey_uuid, survey_business_id, _ = await _create_survey_with_section(
        client, "Section Swap"
    )
    second = await client.post(
        f"/api/v1/surveys/{survey_uuid}/sections/",
        json={"title": "Second"},
    )
    assert second.status_code == 201

    initial = (await client.get(f"/api/v1/surveys/{survey_business_id}")).json()["data"]
    first_section, second_section = initial["sections"]

    swapped = await client.put(
        f"/api/v1/surveys/{survey_uuid}/structure",
        json={
            "expected_revision": initial["structure_revision"],
            "sections": [
                {
                    "client_id": second_section["id"],
                    "id": second_section["id"],
                    "title": second_section["title"],
                    "description": second_section["description"],
                    "questions": [],
                },
                {
                    "client_id": first_section["id"],
                    "id": first_section["id"],
                    "title": first_section["title"],
                    "description": first_section["description"],
                    "questions": [],
                },
            ],
        },
    )

    assert swapped.status_code == 200
    sections = swapped.json()["data"]["sections"]
    assert [section["id"] for section in sections] == [
        second_section["id"],
        first_section["id"],
    ]
    assert [section["order_index"] for section in sections] == [0, 1]


async def test_structure_replace_preserves_question_moved_from_removed_section(client):
    survey_uuid, survey_business_id, source_section_id = await _create_survey_with_section(
        client, "Question Move"
    )
    target = await client.post(
        f"/api/v1/surveys/{survey_uuid}/sections/",
        json={"title": "Target"},
    )
    target_section_id = target.json()["data"]["id"]
    question = await client.post(
        f"/api/v1/surveys/{survey_uuid}/questions/",
        json={
            "question_text": "Move me",
            "question_type": "text",
            "section_id": source_section_id,
        },
    )
    question_id = question.json()["data"]["id"]

    initial = (await client.get(f"/api/v1/surveys/{survey_business_id}")).json()["data"]
    target_section = next(
        section for section in initial["sections"] if section["id"] == target_section_id
    )

    moved = await client.put(
        f"/api/v1/surveys/{survey_uuid}/structure",
        json={
            "expected_revision": initial["structure_revision"],
            "cascade_section_ids": [source_section_id],
            "sections": [
                {
                    "client_id": target_section["id"],
                    "id": target_section["id"],
                    "title": target_section["title"],
                    "description": target_section["description"],
                    "questions": [
                        {
                            "client_id": question_id,
                            "id": question_id,
                            "question_text": "Move me",
                            "question_type": "text",
                            "options": None,
                            "config": None,
                            "is_required": True,
                        }
                    ],
                }
            ],
        },
    )

    assert moved.status_code == 200
    data = moved.json()["data"]
    assert data["sections"][0]["questions"][0]["id"] == question_id
    assert data["sections"][0]["questions"][0]["is_deleted"] is False
    assert data["sections"][0]["questions"][0]["section_id"] == target_section_id


async def test_structure_replace_rejects_duplicate_persisted_ids(client):
    survey_uuid, survey_business_id, _ = await _create_survey_with_section(
        client, "Duplicate Structure IDs"
    )
    second = await client.post(
        f"/api/v1/surveys/{survey_uuid}/sections/",
        json={"title": "Second"},
    )
    assert second.status_code == 201
    initial = (await client.get(f"/api/v1/surveys/{survey_business_id}")).json()["data"]
    section = initial["sections"][0]

    response = await client.put(
        f"/api/v1/surveys/{survey_uuid}/structure",
        json={
            "expected_revision": initial["structure_revision"],
            "sections": [
                {
                    "client_id": "first-reference",
                    "id": section["id"],
                    "title": section["title"],
                    "description": section["description"],
                    "questions": [],
                },
                {
                    "client_id": "second-reference",
                    "id": section["id"],
                    "title": section["title"],
                    "description": section["description"],
                    "questions": [],
                },
            ],
        },
    )

    assert response.status_code == 422


async def test_granular_section_reorder_advances_structure_revision(client):
    survey_uuid, survey_business_id, _ = await _create_survey_with_section(
        client, "Granular Revision"
    )
    second = await client.post(
        f"/api/v1/surveys/{survey_uuid}/sections/",
        json={"title": "Second"},
    )
    assert second.status_code == 201
    initial = (await client.get(f"/api/v1/surveys/{survey_business_id}")).json()["data"]
    original_revision = initial["structure_revision"]
    section_ids = [section["id"] for section in initial["sections"]]

    reordered = await client.patch(
        f"/api/v1/surveys/{survey_uuid}/sections/reorder",
        json={"section_ids": list(reversed(section_ids))},
    )
    assert reordered.status_code == 200

    current = (await client.get(f"/api/v1/surveys/{survey_business_id}")).json()["data"]
    assert current["structure_revision"] == original_revision + 1
    stale = await client.put(
        f"/api/v1/surveys/{survey_uuid}/structure",
        json={"expected_revision": original_revision, "sections": []},
    )
    assert stale.status_code == 409


async def test_distribution_keeps_published_structure_after_new_draft(client):
    survey_uuid, _, section_id = await _create_survey_with_section(client, "Version Survey")
    question = await client.post(
        f"/api/v1/surveys/{survey_uuid}/questions/",
        json={"question_text": "Published", "question_type": "text", "section_id": section_id},
    )
    question_id = question.json()["data"]["id"]
    assert (await client.post(f"/api/v1/surveys/{survey_uuid}/publish")).status_code == 200
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


async def test_publish_requires_an_existing_draft(client):
    survey_uuid, _, section_id = await _create_survey_with_section(
        client, "Publish Retry"
    )
    question = await client.post(
        f"/api/v1/surveys/{survey_uuid}/questions/",
        json={
            "question_text": "Publish once",
            "question_type": "text",
            "section_id": section_id,
        },
    )
    assert question.status_code == 201
    assert (await client.post(f"/api/v1/surveys/{survey_uuid}/publish")).status_code == 200
    retry = await client.post(f"/api/v1/surveys/{survey_uuid}/publish")
    assert retry.status_code == 409


async def test_discarded_version_numbers_are_not_reused(client):
    survey_uuid, _, section_id = await _create_survey_with_section(
        client, "Discarded Version Number"
    )
    question = await client.post(
        f"/api/v1/surveys/{survey_uuid}/questions/",
        json={
            "question_text": "Versioned question",
            "question_type": "text",
            "section_id": section_id,
        },
    )
    assert question.status_code == 201
    assert (await client.post(f"/api/v1/surveys/{survey_uuid}/publish")).status_code == 200

    draft = await client.post(f"/api/v1/surveys/{survey_uuid}/draft")
    assert draft.status_code == 200
    discarded = await client.delete(f"/api/v1/surveys/{survey_uuid}/draft")
    assert discarded.status_code == 200

    recreated = await client.post(f"/api/v1/surveys/{survey_uuid}/draft")
    assert recreated.status_code == 200
    assert recreated.json()["data"]["version_number"] == 3


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
    assert (await client.post(f"/api/v1/surveys/{survey_uuid}/publish")).status_code == 200
    distribution = await client.post(
        f"/api/v1/surveys/{survey_uuid}/distributions/",
        json={"expires_at": "2099-01-01T00:00:00+00:00"},
    )
    token = distribution.json()["data"]["token"]

    unknown = await client.post(
        f"/api/v1/survey/{token}/respond",
        json={"answers": {"00000000-0000-0000-0000-000000000000": "Yes"}},
        headers={"Idempotency-Key": "018f4a1a-7b3b-7d0e-913a-c5f1c5c1c5c2"},
    )
    assert unknown.status_code == 422
    assert unknown.json()["errors"][0]["code"] == "unknown_question"

    missing = await client.post(
        f"/api/v1/survey/{token}/respond",
        json={"answers": {}},
        headers={"Idempotency-Key": "018f4a1a-7b3b-7d0e-913a-c5f1c5c1c5c2"},
    )
    assert missing.status_code == 422
    assert missing.json()["errors"][0]["code"] == "required"

    valid = await client.post(
        f"/api/v1/survey/{token}/respond",
        json={"answers": {question_id: "Yes"}},
        headers={"Idempotency-Key": "018f4a1a-7b3b-7d0e-913a-c5f1c5c1c5c3"},
    )
    assert valid.status_code == 201
