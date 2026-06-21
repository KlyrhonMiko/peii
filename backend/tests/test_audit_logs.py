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
    assert data[0]["changes"] == {"first_name": "Audited", "last_name": "Tested"}

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


async def test_openapi_customizations(client):
    response = await client.get("/api/v1/openapi.json")
    assert response.status_code == 200
    openapi = response.json()
    assert openapi["info"]["title"] == "peii-backend"
    assert "tracing" in openapi["info"]["description"]
    assert "audit-logs" in [tag["name"] for tag in openapi["tags"]]
