import pytest

pytestmark = pytest.mark.anyio


async def test_create_and_list_surveys(client):
    payload = {
        "title": "Class of 2025 Exit Survey",
        "description": "Exit survey for the graduating class of 2025.",
        "target_cohort": "Class of 2025",
    }

    create_response = await client.post("/api/v1/surveys/", json=payload)
    assert create_response.status_code == 201
    create_data = create_response.json()["data"]
    assert create_data["title"] == payload["title"]
    assert create_data["survey_id"].startswith("SURV-")
    assert create_data["status"] == "Inactive"
    assert create_data["responses_count"] == 0
    assert "id" in create_data

    list_response = await client.get("/api/v1/surveys/")
    assert list_response.status_code == 200
    list_body = list_response.json()
    assert list_body["meta"]["pagination"] == {
        "total": 1,
        "count": 1,
        "limit": 20,
        "offset": 0,
        "has_next": False,
        "has_prev": False,
    }
    assert list_body["meta"]["filters"] == {
        "sort_order": "desc",
        "sort_by": "created_at",
        "include_deleted": False,
        "status": None,
        "target_cohort": None,
        "search": None,
    }


async def test_create_survey_with_structure_accepts_uuid_client_ids(client):
    response = await client.post(
        "/api/v1/surveys/with-structure",
        json={
            "title": "Structured Survey",
            "status": "Active",
            "sections": [
                {
                    "client_id": "550e8400-e29b-41d4-a716-446655440000",
                    "title": "Main",
                    "questions": [
                        {
                            "client_id": "660e8400-e29b-41d4-a716-446655440000",
                            "question_text": "How are you?",
                            "question_type": "text",
                        }
                    ],
                }
            ],
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert "request_id" in body["meta"]
    data = body["data"]
    assert data["status"] == "Active"
    assert len(data["sections"]) == 1
    assert data["sections"][0]["id"] != "550e8400-e29b-41d4-a716-446655440000"
    assert data["sections"][0]["questions"][0]["id"] != "660e8400-e29b-41d4-a716-446655440000"


async def test_create_survey_rejects_active_status_without_structure(client):
    response = await client.post(
        "/api/v1/surveys/",
        json={"title": "Incomplete Active Survey", "status": "Active"},
    )

    assert response.status_code == 422
    body = response.json()
    assert body["data"] is None
    assert body["message"] == "Survey is not ready to be activated."
    assert body["errors"][0]["code"] == "no_sections"
    assert "request_id" in body["meta"]
    assert (await client.get("/api/v1/surveys/")).json()["data"] == []


@pytest.mark.parametrize(
    "sections, error_code",
    [
        ([], "no_sections"),
        (
            [
                {
                    "client_id": "empty-section",
                    "title": "Empty",
                    "questions": [],
                }
            ],
            "empty_section",
        ),
    ],
)
async def test_create_survey_with_structure_rejects_incomplete_active_structure(
    client, sections, error_code
):
    response = await client.post(
        "/api/v1/surveys/with-structure",
        json={"title": "Incomplete Structured Survey", "status": "Active", "sections": sections},
    )

    assert response.status_code == 422
    body = response.json()
    assert body["message"] == "Survey is not ready to be activated."
    assert body["errors"][0]["code"] == error_code
    assert (await client.get("/api/v1/surveys/")).json()["data"] == []


async def test_create_survey_with_invalid_structure_rolls_back_everything(client):
    response = await client.post(
        "/api/v1/surveys/with-structure",
        json={
            "title": "Invalid Structured Survey",
            "sections": [
                {
                    "client_id": "local-section",
                    "title": "Main",
                    "questions": [
                        {
                            "client_id": "local-question",
                            "question_text": "Choose one",
                            "question_type": "single_choice",
                            "options": [],
                        }
                    ],
                }
            ],
        },
    )

    assert response.status_code == 422
    body = response.json()
    assert body["data"] is None
    assert "request_id" in body["meta"]
    surveys = await client.get("/api/v1/surveys/")
    assert surveys.json()["data"] == []


async def test_create_survey_with_structure_rejects_persisted_ids(client):
    response = await client.post(
        "/api/v1/surveys/with-structure",
        json={
            "title": "Invalid Identity Survey",
            "sections": [
                {
                    "client_id": "local-section",
                    "id": "550e8400-e29b-41d4-a716-446655440000",
                    "title": "Main",
                    "questions": [],
                }
            ],
        },
    )

    assert response.status_code == 422
    assert (await client.get("/api/v1/surveys/")).json()["data"] == []


async def test_get_survey_with_questions(client):
    create_resp = await client.post(
        "/api/v1/surveys/",
        json={
            "title": "Test Survey",
        },
    )
    survey_id = create_resp.json()["data"]["survey_id"]
    survey_uuid = create_resp.json()["data"]["id"]

    sec_resp = await client.post(
        f"/api/v1/surveys/{survey_uuid}/sections/",
        json={"title": "Main Section"},
    )
    section_id = sec_resp.json()["data"]["id"]

    q_payload = {
        "question_text": "How satisfied are you?",
        "question_type": "scale",
        "options": None,
        "section_id": section_id,
    }
    await client.post(f"/api/v1/surveys/{survey_uuid}/questions/", json=q_payload)

    get_resp = await client.get(f"/api/v1/surveys/{survey_id}")
    assert get_resp.status_code == 200
    data = get_resp.json()["data"]
    assert data["survey_id"] == survey_id
    assert len(data["sections"]) == 1
    assert len(data["questions"]) == 1
    assert data["questions"][0]["question_text"] == "How satisfied are you?"


async def test_update_survey(client):
    create_resp = await client.post(
        "/api/v1/surveys/",
        json={
            "title": "Old Title",
        },
    )
    survey_id = create_resp.json()["data"]["survey_id"]
    survey_uuid = create_resp.json()["data"]["id"]
    section_resp = await client.post(
        f"/api/v1/surveys/{survey_uuid}/sections/", json={"title": "Main"}
    )
    await client.post(
        f"/api/v1/surveys/{survey_uuid}/questions/",
        json={
            "question_text": "Status",
            "question_type": "text",
            "section_id": section_resp.json()["data"]["id"],
        },
    )

    update_resp = await client.patch(
        f"/api/v1/surveys/{survey_id}",
        json={"title": "New Title", "status": "Active"},
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["data"]["title"] == "New Title"
    assert update_resp.json()["data"]["status"] == "Active"


async def test_activation_rejects_empty_survey_without_applying_metadata(client):
    create_resp = await client.post("/api/v1/surveys/", json={"title": "Old Title"})
    survey_id = create_resp.json()["data"]["survey_id"]

    update_resp = await client.patch(
        f"/api/v1/surveys/{survey_id}",
        json={"title": "New Title", "status": "Active"},
    )

    assert update_resp.status_code == 409
    body = update_resp.json()
    assert body["data"] is None
    assert body["message"] == "Survey is not ready to be activated."
    assert body["errors"][0]["code"] == "no_sections"
    assert "request_id" in body["meta"]

    fetched = await client.get(f"/api/v1/surveys/{survey_id}")
    assert fetched.json()["data"]["title"] == "Old Title"
    assert fetched.json()["data"]["status"] == "Inactive"


async def test_activation_rejects_section_without_questions(client):
    create_resp = await client.post("/api/v1/surveys/", json={"title": "Empty Section"})
    survey = create_resp.json()["data"]
    await client.post(f"/api/v1/surveys/{survey['id']}/sections/", json={"title": "Main"})

    response = await client.patch(
        f"/api/v1/surveys/{survey['survey_id']}", json={"status": "Active"}
    )

    assert response.status_code == 409
    assert response.json()["errors"][0]["code"] == "empty_section"


async def test_soft_delete_and_restore_survey(client):
    create_resp = await client.post(
        "/api/v1/surveys/",
        json={
            "title": "Deletable Survey",
        },
    )
    survey_id = create_resp.json()["data"]["survey_id"]

    delete_resp = await client.request(
        "DELETE",
        f"/api/v1/surveys/{survey_id}",
        json={},
    )
    assert delete_resp.status_code == 200
    assert delete_resp.json()["data"]["is_deleted"] is True

    list_resp = await client.get("/api/v1/surveys/")
    assert len(list_resp.json()["data"]) == 0

    restore_resp = await client.post(
        f"/api/v1/surveys/{survey_id}/restore",
        json={},
    )
    assert restore_resp.status_code == 200
    assert restore_resp.json()["data"]["is_deleted"] is False

    list_resp = await client.get("/api/v1/surveys/")
    assert len(list_resp.json()["data"]) == 1


async def test_survey_not_found_uses_universal_error_shape(client):
    response = await client.get("/api/v1/surveys/nonexistent-id")
    assert response.status_code == 404
    body = response.json()
    assert body["data"] is None
    assert body["message"] == "Survey not found."
    assert body["errors"] is None
    assert "request_id" in body["meta"]


async def test_list_surveys_with_filters(client):
    await client.post(
        "/api/v1/surveys/with-structure",
        json={
            "title": "Active Survey",
            "status": "Active",
            "target_cohort": "Class of 2024",
            "sections": [
                {
                    "client_id": "active-section",
                    "title": "Main",
                    "questions": [
                        {
                            "client_id": "active-question",
                            "question_text": "Status",
                            "question_type": "text",
                        }
                    ],
                }
            ],
        },
    )
    await client.post(
        "/api/v1/surveys/",
        json={
            "title": "Inactive Survey",
            "status": "Inactive",
            "target_cohort": "Class of 2025",
        },
    )

    resp = await client.get("/api/v1/surveys/?status=Active")
    assert len(resp.json()["data"]) == 1
    assert resp.json()["meta"]["filters"]["status"] == "Active"

    resp = await client.get("/api/v1/surveys/?search=Inactive")
    assert len(resp.json()["data"]) == 1

    resp = await client.get("/api/v1/surveys/?sort_by=title&sort_order=asc")
    data = resp.json()["data"]
    assert data[0]["title"] == "Active Survey"
