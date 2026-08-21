from uuid import uuid4

import pytest

pytestmark = pytest.mark.anyio


async def test_user_mutations_create_audit_logs(client):
    # 1. Create a user
    payload = {
        "email": "audit-test@example.com",
        "username": "audittestuser",
        "password": "test-password-123",
        "role": "staff",
        "first_name": "Audit",
        "last_name": "Tester",
        "middle_name": None,
        "contact": None,
        "is_active": True,
        "performed_by": None,
    }

    create_response = await client.post("/api/v1/users/", json=payload)
    assert create_response.status_code == 201
    user_id = create_response.json()["data"]["user_id"]

    # Check that audit log exists
    audit_list_response = await client.get(
        f"/api/v1/audit-logs/?resource_type=user&resource_id={user_id}"
    )
    assert audit_list_response.status_code == 200
    data = audit_list_response.json()["data"]
    assert len(data) == 1
    assert data[0]["action"] == "create"
    assert data[0]["resource_type"] == "user"
    assert data[0]["resource_id"] == user_id
    assert "request_id" in data[0]

    # Get individual log
    log_id = data[0]["id"]
    log_response = await client.get(f"/api/v1/audit-logs/{log_id}")
    assert log_response.status_code == 200
    assert log_response.json()["data"]["id"] == log_id

    # 2. Update the user
    update_payload = {
        "first_name": "Audited",
        "last_name": "Tested",
    }
    update_response = await client.patch(f"/api/v1/users/{user_id}", json=update_payload)
    assert update_response.status_code == 200

    # Check updated audit log
    audit_list_response = await client.get(
        f"/api/v1/audit-logs/?resource_type=user&resource_id={user_id}&action=update"
    )
    assert audit_list_response.status_code == 200
    data = audit_list_response.json()["data"]
    assert len(data) == 1
    assert data[0]["action"] == "update"
    assert data[0]["changes"] == {
        "first_name": {"before": "Audit", "after": "Audited"},
        "last_name": {"before": "Tester", "after": "Tested"},
    }

    # 3. Soft delete the user
    performed_by_uuid = str(uuid4())
    delete_response = await client.request(
        "DELETE",
        f"/api/v1/users/{user_id}",
        json={"performed_by": performed_by_uuid},
    )
    assert delete_response.status_code == 200

    # Check deleted audit log
    audit_list_response = await client.get(
        f"/api/v1/audit-logs/?resource_type=user&resource_id={user_id}&action=delete"
    )
    assert audit_list_response.status_code == 200
    data = audit_list_response.json()["data"]
    assert len(data) == 1
    assert data[0]["action"] == "delete"
    assert data[0]["performed_by"] == performed_by_uuid

    # 4. Restore the user
    restore_response = await client.post(
        f"/api/v1/users/{user_id}/restore",
        json={"performed_by": performed_by_uuid},
    )
    assert restore_response.status_code == 200

    # Check restored audit log
    audit_list_response = await client.get(
        f"/api/v1/audit-logs/?resource_type=user&resource_id={user_id}&action=restore"
    )
    assert audit_list_response.status_code == 200
    data = audit_list_response.json()["data"]
    assert len(data) == 1
    assert data[0]["action"] == "restore"
    assert data[0]["performed_by"] == performed_by_uuid


async def test_get_nonexistent_audit_log(client):
    response = await client.get("/api/v1/audit-logs/00000000-0000-0000-0000-000000000000")
    assert response.status_code == 404


async def _audits_for(client, resource_type, resource_id, action=None):
    query = f"resource_type={resource_type}&resource_id={resource_id}"
    if action:
        query += f"&action={action}"
    response = await client.get(f"/api/v1/audit-logs/?{query}&limit=100")
    assert response.status_code == 200
    return response.json()["data"]


async def test_all_mutation_families_create_audits(client):
    survey_response = await client.post(
        "/api/v1/surveys/",
        json={"title": "Audited Survey", "status": "Active"},
        headers={"X-Request-ID": "audit-integration-request"},
    )
    survey = survey_response.json()["data"]
    survey_id = survey["survey_id"]
    survey_uuid = survey["id"]
    survey_audits = await _audits_for(client, "survey", survey_id)
    assert [audit["action"] for audit in survey_audits] == ["create"]
    assert survey_audits[0]["request_id"] == "audit-integration-request"

    await client.patch(f"/api/v1/surveys/{survey_id}", json={"title": "Updated Survey"})
    assert len(await _audits_for(client, "survey", survey_id, "update")) == 1

    first_section = await client.post(
        f"/api/v1/surveys/{survey_uuid}/sections/", json={"title": "First"}
    )
    second_section = await client.post(
        f"/api/v1/surveys/{survey_uuid}/sections/", json={"title": "Second"}
    )
    first_section_id = first_section.json()["data"]["id"]
    second_section_id = second_section.json()["data"]["id"]
    await client.patch(
        f"/api/v1/surveys/{survey_uuid}/sections/{first_section_id}",
        json={"title": "Renamed First"},
    )
    reorder_sections = await client.patch(
        f"/api/v1/surveys/{survey_uuid}/sections/reorder",
        json={"section_ids": [second_section_id, first_section_id]},
    )
    assert reorder_sections.status_code == 200
    assert len(await _audits_for(client, "survey_section", first_section_id, "reorder")) == 1
    assert len(await _audits_for(client, "survey_section", second_section_id, "reorder")) == 1

    first_question = await client.post(
        f"/api/v1/surveys/{survey_uuid}/questions/",
        json={"question_text": "First?", "question_type": "text", "section_id": first_section_id},
    )
    second_question = await client.post(
        f"/api/v1/surveys/{survey_uuid}/questions/",
        json={"question_text": "Second?", "question_type": "text", "section_id": first_section_id},
    )
    third_question = await client.post(
        f"/api/v1/surveys/{survey_uuid}/questions/",
        json={
            "question_text": "Second section?",
            "question_type": "text",
            "section_id": second_section_id,
        },
    )
    first_question_id = first_question.json()["data"]["id"]
    second_question_id = second_question.json()["data"]["id"]
    await client.patch(
        f"/api/v1/surveys/{survey_uuid}/questions/{first_question_id}",
        json={"question_text": "Renamed first?"},
    )
    await client.patch(
        f"/api/v1/surveys/{survey_uuid}/questions/reorder",
        json={"question_ids": [second_question_id, first_question_id]},
    )
    assert len(await _audits_for(client, "survey_question", first_question_id, "reorder")) == 1
    assert len(await _audits_for(client, "survey_question", second_question_id, "reorder")) == 1
    await client.request(
        "DELETE", f"/api/v1/surveys/{survey_uuid}/questions/{first_question_id}"
    )
    assert len(await _audits_for(client, "survey_question", first_question_id, "delete")) == 1
    assert (await client.post(f"/api/v1/surveys/{survey_uuid}/publish")).status_code == 200

    distribution = await client.post(
        f"/api/v1/surveys/{survey_uuid}/distributions/",
        json={"expires_at": "2099-01-01T00:00:00+00:00"},
    )
    distribution_data = distribution.json()["data"]
    distribution_id = distribution_data["id"]
    assert len(await _audits_for(client, "survey_distribution", distribution_id, "create")) == 1

    response = await client.post(
        f"/api/v1/survey/{distribution_data['token']}/respond",
        json={
            "answers": {
                second_question_id: "answer",
                third_question.json()["data"]["id"]: "answer",
            }
        },
        headers={"Idempotency-Key": "018f4a1a-7b3b-7d0e-913a-c5f1c5c1c5c2"},
    )
    response_id = response.json()["data"]["id"]
    response_audits = await _audits_for(client, "survey_response", response_id, "create")
    assert len(response_audits) == 1
    assert response_audits[0]["changes"] is None

    await client.request(
        "DELETE", f"/api/v1/surveys/{survey_uuid}/distributions/{distribution_id}"
    )
    await client.request(
        "DELETE", f"/api/v1/surveys/{survey_uuid}/distributions/{distribution_id}"
    )
    revoke_audits = await _audits_for(client, "survey_distribution", distribution_id, "revoke")
    assert len(revoke_audits) == 1
    assert "token" not in (revoke_audits[0]["changes"] or {})


async def test_batch_user_mutation_creates_one_audit_per_user(client):
    response = await client.post(
        "/api/v1/users/batch",
        json={
            "users": [
                {
                    "email": "audit-batch-one@example.com",
                    "username": "audit-batch-one",
                    "password": "test-password-123",
                    "role": "staff",
                    "first_name": "Batch",
                    "last_name": "One",
                },
                {
                    "email": "audit-batch-two@example.com",
                    "username": "audit-batch-two",
                    "password": "test-password-456",
                    "role": "staff",
                    "first_name": "Batch",
                    "last_name": "Two",
                },
            ]
        },
    )
    assert response.status_code == 201

    for user in response.json()["data"]:
        audits = await _audits_for(client, "user", user["user_id"], "create")
        assert len(audits) == 1


async def test_openapi_customizations(client):
    response = await client.get("/api/v1/openapi.json")
    assert response.status_code == 200
    openapi = response.json()
    assert openapi["info"]["title"] == "peii-backend"
    assert "tracing" in openapi["info"]["description"]
    assert "audit-logs" in [tag["name"] for tag in openapi["tags"]]
