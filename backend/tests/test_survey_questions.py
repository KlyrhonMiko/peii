import pytest

pytestmark = pytest.mark.anyio


async def _create_survey(client, title="Test Survey"):
    resp = await client.post("/api/v1/surveys/", json={
        "title": title, "performed_by": None,
    })
    survey_uuid = resp.json()["data"]["id"]

    sec_resp = await client.post(
        f"/api/v1/surveys/{survey_uuid}/sections/",
        json={"title": "Default Section"},
    )
    section_id = sec_resp.json()["data"]["id"]

    return survey_uuid, section_id


async def test_create_and_list_questions(client):
    survey_uuid, section_id = await _create_survey(client, "Question Survey")

    q1 = await client.post(f"/api/v1/surveys/{survey_uuid}/questions/", json={
        "question_text": "Rate your experience?",
        "question_type": "scale",
        "options": None,
        "section_id": section_id,
    })
    assert q1.status_code == 201
    assert q1.json()["data"]["order_index"] == 0

    q2 = await client.post(f"/api/v1/surveys/{survey_uuid}/questions/", json={
        "question_text": "Any comments?",
        "question_type": "text",
        "options": None,
        "section_id": section_id,
    })
    assert q2.status_code == 201
    assert q2.json()["data"]["order_index"] == 1

    list_resp = await client.get(f"/api/v1/surveys/{survey_uuid}/questions/")
    assert list_resp.status_code == 200
    assert len(list_resp.json()["data"]) == 2


async def test_create_multiple_choice_question(client):
    survey_uuid, section_id = await _create_survey(client, "MCQ Survey")
    resp = await client.post(f"/api/v1/surveys/{survey_uuid}/questions/", json={
        "question_text": "Employment status?",
        "question_type": "single_choice",
        "options": ["Full-Time", "Part-Time", "Unemployed"],
        "section_id": section_id,
    })
    assert resp.status_code == 201
    data = resp.json()["data"]
    assert data["options"] == ["Full-Time", "Part-Time", "Unemployed"]


async def test_update_question(client):
    survey_uuid, section_id = await _create_survey(client, "Update Survey")
    q_resp = await client.post(f"/api/v1/surveys/{survey_uuid}/questions/", json={
        "question_text": "Old text?",
        "question_type": "text",
        "section_id": section_id,
    })
    q_id = q_resp.json()["data"]["id"]

    update_resp = await client.patch(
        f"/api/v1/surveys/{survey_uuid}/questions/{q_id}",
        json={"question_text": "New text?"},
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["data"]["question_text"] == "New text?"


async def test_delete_question(client):
    survey_uuid, section_id = await _create_survey(client, "Delete Survey")
    q_resp = await client.post(f"/api/v1/surveys/{survey_uuid}/questions/", json={
        "question_text": "Delete me?",
        "question_type": "text",
        "section_id": section_id,
    })
    q_id = q_resp.json()["data"]["id"]

    del_resp = await client.request(
        "DELETE", f"/api/v1/surveys/{survey_uuid}/questions/{q_id}",
    )
    assert del_resp.status_code == 200
    assert del_resp.json()["data"]["is_deleted"] is True

    list_resp = await client.get(f"/api/v1/surveys/{survey_uuid}/questions/")
    assert len(list_resp.json()["data"]) == 0


async def test_reorder_questions(client):
    survey_uuid, section_id = await _create_survey(client, "Reorder Survey")
    q1 = await client.post(f"/api/v1/surveys/{survey_uuid}/questions/", json={
        "question_text": "First", "question_type": "text",
        "section_id": section_id,
    })
    q2 = await client.post(f"/api/v1/surveys/{survey_uuid}/questions/", json={
        "question_text": "Second", "question_type": "text",
        "section_id": section_id,
    })

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
