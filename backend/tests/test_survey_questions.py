import pytest

pytestmark = pytest.mark.anyio


async def _create_survey(client, title="Test Survey"):
    resp = await client.post(
        "/api/v1/surveys/",
        json={
            "title": title,
        },
    )
    survey_uuid = resp.json()["data"]["id"]

    sec_resp = await client.post(
        f"/api/v1/surveys/{survey_uuid}/sections/",
        json={"title": "Default Section"},
    )
    section_id = sec_resp.json()["data"]["id"]

    return survey_uuid, section_id


async def test_create_and_list_questions(client):
    survey_uuid, section_id = await _create_survey(client, "Question Survey")

    q1 = await client.post(
        f"/api/v1/surveys/{survey_uuid}/questions/",
        json={
            "question_text": "Rate your experience?",
            "question_type": "scale",
            "options": None,
            "section_id": section_id,
        },
    )
    assert q1.status_code == 201
    assert q1.json()["data"]["order_index"] == 0

    q2 = await client.post(
        f"/api/v1/surveys/{survey_uuid}/questions/",
        json={
            "question_text": "Any comments?",
            "question_type": "text",
            "options": None,
            "section_id": section_id,
        },
    )
    assert q2.status_code == 201
    assert q2.json()["data"]["order_index"] == 1

    list_resp = await client.get(f"/api/v1/surveys/{survey_uuid}/questions/")
    assert list_resp.status_code == 200
    assert len(list_resp.json()["data"]) == 2


async def test_create_multiple_choice_question(client):
    survey_uuid, section_id = await _create_survey(client, "MCQ Survey")
    resp = await client.post(
        f"/api/v1/surveys/{survey_uuid}/questions/",
        json={
            "question_text": "Employment status?",
            "question_type": "single_choice",
            "options": ["Full-Time", "Part-Time", "Unemployed"],
            "section_id": section_id,
        },
    )
    assert resp.status_code == 201
    data = resp.json()["data"]
    assert data["options"] == ["Full-Time", "Part-Time", "Unemployed"]


async def test_question_definition_rejects_invalid_options(client):
    survey_uuid, section_id = await _create_survey(client, "Invalid Question Survey")

    missing_options = await client.post(
        f"/api/v1/surveys/{survey_uuid}/questions/",
        json={
            "question_text": "Missing options",
            "question_type": "multiple_choice",
            "section_id": section_id,
        },
    )
    duplicate_options = await client.post(
        f"/api/v1/surveys/{survey_uuid}/questions/",
        json={
            "question_text": "Duplicate options",
            "question_type": "single_choice",
            "options": ["A", "A"],
            "section_id": section_id,
        },
    )

    assert missing_options.status_code == 422
    assert duplicate_options.status_code == 422


async def test_question_definition_validates_conditional_config(client):
    survey_uuid, section_id = await _create_survey(client, "Conditional Question Survey")

    source = await client.post(
        f"/api/v1/surveys/{survey_uuid}/questions/",
        json={
            "question_text": "Industry",
            "question_type": "single_choice",
            "options": ["Technology", "Healthcare"],
            "config": {"question_key": "industry"},
            "section_id": section_id,
        },
    )
    assert source.status_code == 201

    dependent = await client.post(
        f"/api/v1/surveys/{survey_uuid}/questions/",
        json={
            "question_text": "Industry category",
            "question_type": "single_choice",
            "options": ["Software", "Clinical"],
            "config": {
                "question_key": "industry_category",
                "options_by_answer": {
                    "question_key": "industry",
                    "choices": {
                        "Technology": ["Software"],
                        "Healthcare": ["Clinical"],
                    },
                },
            },
            "section_id": section_id,
        },
    )
    assert dependent.status_code == 201
    assert dependent.json()["data"]["config"]["options_by_answer"]["choices"] == {
        "Technology": ["Software"],
        "Healthcare": ["Clinical"],
    }

    one_of = await client.post(
        f"/api/v1/surveys/{survey_uuid}/questions/",
        json={
            "question_text": "Explain the other selection",
            "question_type": "text",
            "config": {
                "question_key": "industry_other",
                "visible_when": {
                    "question_key": "industry",
                    "one_of": ["Other", "Not listed"],
                },
            },
            "section_id": section_id,
        },
    )
    assert one_of.status_code == 201

    invalid_union = await client.post(
        f"/api/v1/surveys/{survey_uuid}/questions/",
        json={
            "question_text": "Invalid category",
            "question_type": "single_choice",
            "options": ["Software"],
            "config": {
                "options_by_answer": {
                    "question_key": "industry",
                    "choices": {"Technology": ["Not in the union"]},
                }
            },
            "section_id": section_id,
        },
    )
    assert invalid_union.status_code == 422
    assert "contained in question options" in invalid_union.json()["message"]


async def test_question_structure_rejects_dangling_and_non_choice_dependencies(client):
    survey_uuid, section_id = await _create_survey(client, "Invalid Dependency Survey")

    dangling = await client.post(
        f"/api/v1/surveys/{survey_uuid}/questions/",
        json={
            "question_text": "Dependent",
            "question_type": "text",
            "config": {
                "visible_when": {"question_key": "missing", "equals": "Yes"},
            },
            "section_id": section_id,
        },
    )
    assert dangling.status_code == 422
    assert "unknown question_key" in dangling.json()["message"]

    source = await client.post(
        f"/api/v1/surveys/{survey_uuid}/questions/",
        json={
            "question_text": "Free-form source",
            "question_type": "text",
            "config": {"question_key": "free_form_source"},
            "section_id": section_id,
        },
    )
    assert source.status_code == 201

    non_choice = await client.post(
        f"/api/v1/surveys/{survey_uuid}/questions/",
        json={
            "question_text": "Dependent on text",
            "question_type": "text",
            "config": {
                "visible_when": {"question_key": "free_form_source", "equals": "Yes"},
            },
            "section_id": section_id,
        },
    )
    assert non_choice.status_code == 422
    assert "single_choice question" in non_choice.json()["message"]


async def test_question_structure_rejects_duplicate_keys_and_invalid_option_map_keys(client):
    survey_uuid, section_id = await _create_survey(client, "Duplicate Dependency Survey")

    source = await client.post(
        f"/api/v1/surveys/{survey_uuid}/questions/",
        json={
            "question_text": "Source",
            "question_type": "single_choice",
            "options": ["A"],
            "config": {"question_key": "source"},
            "section_id": section_id,
        },
    )
    assert source.status_code == 201

    duplicate = await client.post(
        f"/api/v1/surveys/{survey_uuid}/questions/",
        json={
            "question_text": "Duplicate key",
            "question_type": "text",
            "config": {"question_key": "source"},
            "section_id": section_id,
        },
    )
    assert duplicate.status_code == 422
    assert "must be unique" in duplicate.json()["message"]

    invalid_map_key = await client.post(
        f"/api/v1/surveys/{survey_uuid}/questions/",
        json={
            "question_text": "Dependent options",
            "question_type": "single_choice",
            "options": ["X"],
            "config": {
                "options_by_answer": {
                    "question_key": "source",
                    "choices": {"B": ["X"]},
                },
            },
            "section_id": section_id,
        },
    )
    assert invalid_map_key.status_code == 422
    assert "source question options" in invalid_map_key.json()["message"]


async def test_question_structure_rejects_cross_phase_dependencies(client):
    survey_uuid, section_id = await _create_survey(client, "Cross Phase Dependency Survey")

    source = await client.post(
        f"/api/v1/surveys/{survey_uuid}/questions/",
        json={
            "question_text": "Phase one source",
            "question_type": "single_choice",
            "options": ["Yes", "No"],
            "config": {"question_key": "phase_one_source", "survey_phase": 1},
            "section_id": section_id,
        },
    )
    assert source.status_code == 201

    dependent = await client.post(
        f"/api/v1/surveys/{survey_uuid}/questions/",
        json={
            "question_text": "Phase two dependent",
            "question_type": "text",
            "config": {
                "survey_phase": 2,
                "visible_when": {"question_key": "phase_one_source", "equals": "Yes"},
            },
            "section_id": section_id,
        },
    )
    assert dependent.status_code == 422
    assert "same survey phase" in dependent.json()["message"]


async def test_question_structure_protects_dependencies_from_update_delete_and_reorder(client):
    survey_uuid, section_id = await _create_survey(client, "Dependency Lifecycle Survey")

    source = await client.post(
        f"/api/v1/surveys/{survey_uuid}/questions/",
        json={
            "question_text": "Source",
            "question_type": "single_choice",
            "options": ["Yes", "No"],
            "config": {"question_key": "source"},
            "section_id": section_id,
        },
    )
    dependent = await client.post(
        f"/api/v1/surveys/{survey_uuid}/questions/",
        json={
            "question_text": "Dependent",
            "question_type": "text",
            "config": {
                "visible_when": {"question_key": "source", "equals": "Yes"},
            },
            "section_id": section_id,
        },
    )
    assert source.status_code == dependent.status_code == 201
    source_id = source.json()["data"]["id"]
    dependent_id = dependent.json()["data"]["id"]

    update_source = await client.patch(
        f"/api/v1/surveys/{survey_uuid}/questions/{source_id}",
        json={"config": {}},
    )
    assert update_source.status_code == 422
    assert "unknown question_key" in update_source.json()["message"]

    reordered = await client.patch(
        f"/api/v1/surveys/{survey_uuid}/questions/reorder",
        json={"section_id": section_id, "question_ids": [dependent_id, source_id]},
    )
    assert reordered.status_code == 422
    assert "preceding question" in reordered.json()["message"]

    deleted = await client.request(
        "DELETE", f"/api/v1/surveys/{survey_uuid}/questions/{source_id}"
    )
    assert deleted.status_code == 422
    assert "unknown question_key" in deleted.json()["message"]


async def test_update_question(client):
    survey_uuid, section_id = await _create_survey(client, "Update Survey")
    q_resp = await client.post(
        f"/api/v1/surveys/{survey_uuid}/questions/",
        json={
            "question_text": "Old text?",
            "question_type": "text",
            "section_id": section_id,
        },
    )
    q_id = q_resp.json()["data"]["id"]

    update_resp = await client.patch(
        f"/api/v1/surveys/{survey_uuid}/questions/{q_id}",
        json={"question_text": "New text?"},
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["data"]["question_text"] == "New text?"


async def test_delete_question(client):
    survey_uuid, section_id = await _create_survey(client, "Delete Survey")
    q_resp = await client.post(
        f"/api/v1/surveys/{survey_uuid}/questions/",
        json={
            "question_text": "Delete me?",
            "question_type": "text",
            "section_id": section_id,
        },
    )
    q_id = q_resp.json()["data"]["id"]

    del_resp = await client.request(
        "DELETE",
        f"/api/v1/surveys/{survey_uuid}/questions/{q_id}",
    )
    assert del_resp.status_code == 200
    assert del_resp.json()["data"]["is_deleted"] is True

    list_resp = await client.get(f"/api/v1/surveys/{survey_uuid}/questions/")
    assert len(list_resp.json()["data"]) == 0


async def test_reorder_questions(client):
    survey_uuid, section_id = await _create_survey(client, "Reorder Survey")
    q1 = await client.post(
        f"/api/v1/surveys/{survey_uuid}/questions/",
        json={
            "question_text": "First",
            "question_type": "text",
            "section_id": section_id,
        },
    )
    q2 = await client.post(
        f"/api/v1/surveys/{survey_uuid}/questions/",
        json={
            "question_text": "Second",
            "question_type": "text",
            "section_id": section_id,
        },
    )

    reorder_resp = await client.patch(
        f"/api/v1/surveys/{survey_uuid}/questions/reorder",
        json={"question_ids": [q2.json()["data"]["id"], q1.json()["data"]["id"]]},
    )
    assert reorder_resp.status_code == 200
    reordered = reorder_resp.json()["data"]
    assert reordered[0]["question_text"] == "Second"
    assert reordered[0]["order_index"] == 0
    assert reordered[1]["question_text"] == "First"
    assert reordered[1]["order_index"] == 1
