from typing import cast

import pytest
from sqlmodel import select

from core.database import get_session
from main import app
from models.user import User
from utils.security import verify_password

pytestmark = pytest.mark.anyio


async def test_create_and_list_users(client):
    payload = {
        "email": "user@example.com",
        "username": "janedoe",
        "password": "test-password-123",
        "role": "admin",
        "first_name": "Jane",
        "last_name": "Doe",
        "middle_name": None,
        "contact": None,
        "is_active": True,
        "performed_by": None,
    }

    create_response = await client.post("/api/v1/users/", json=payload)
    assert create_response.status_code == 201
    assert create_response.json()["data"]["email"] == payload["email"]
    assert create_response.json()["data"]["username"] == payload["username"]
    assert "password" not in create_response.json()["data"]

    list_response = await client.get("/api/v1/users/")
    assert list_response.status_code == 200
    assert list_response.json()["meta"]["pagination"] == {
        "total": 1,
        "count": 1,
        "limit": 20,
        "offset": 0,
        "has_next": False,
        "has_prev": False,
    }
    assert list_response.json()["meta"]["filters"] == {
        "sort_order": "desc",
        "sort_by": "created_at",
        "include_deleted": False,
        "role": None,
        "is_active": None,
        "search": None,
    }


async def test_password_is_stored_as_argon2_hash(client):
    plain_password = "test-password-123"
    payload = {
        "email": "secure@example.com",
        "username": "secureuser",
        "password": plain_password,
        "role": "admin",
        "first_name": "Jane",
        "last_name": "Doe",
        "middle_name": None,
        "contact": None,
        "is_active": True,
        "performed_by": None,
    }

    create_response = await client.post("/api/v1/users/", json=payload)
    assert create_response.status_code == 201

    override = app.dependency_overrides[get_session]
    session_generator = override()
    session = next(session_generator)
    try:
        user = session.exec(select(User).where(User.email == payload["email"])).first()
    finally:
        session_generator.close()

    assert user is not None
    hashed_password = cast(str, user.password)
    assert hashed_password.startswith("$argon2")
    assert verify_password(plain_password, hashed_password) is True


async def test_user_not_found_uses_universal_error_shape(client):
    response = await client.get("/api/v1/users/00000000-0000-0000-0000-000000000000")

    assert response.status_code == 404
    assert response.json() == {
        "data": None,
        "message": "User not found.",
        "errors": None,
        "meta": None,
    }


async def test_validation_error_uses_universal_error_shape(client):
    response = await client.post("/api/v1/users/", json={})

    assert response.status_code == 422
    body = response.json()
    assert body["data"] is None
    assert body["message"] == "Validation error."
    assert isinstance(body["errors"], list)
    assert body["meta"] is None


async def test_list_users_uses_shared_query_params(client):
    payloads = [
        {
            "email": "first@example.com",
            "username": "firstuser",
            "password": "test-password-123",
            "role": "admin",
            "first_name": "First",
            "last_name": "User",
            "middle_name": None,
            "contact": None,
            "is_active": True,
            "performed_by": None,
        },
        {
            "email": "second@example.com",
            "username": "seconduser",
            "password": "test-password-123",
            "role": "admin",
            "first_name": "Second",
            "last_name": "User",
            "middle_name": None,
            "contact": None,
            "is_active": True,
            "performed_by": None,
        },
    ]

    for payload in payloads:
        response = await client.post("/api/v1/users/", json=payload)
        assert response.status_code == 201

    response = await client.get("/api/v1/users/?limit=1&offset=0&sort_order=asc&sort_by=email")

    assert response.status_code == 200
    body = response.json()
    assert len(body["data"]) == 1
    assert body["data"][0]["email"] == payloads[0]["email"]
    assert body["meta"] == {
        "pagination": {
            "total": 2,
            "count": 1,
            "limit": 1,
            "offset": 0,
            "has_next": True,
            "has_prev": False,
        },
        "filters": {
            "sort_order": "asc",
            "sort_by": "email",
            "include_deleted": False,
            "role": None,
            "is_active": None,
            "search": None,
        },
    }


async def test_list_users_filters_by_role_and_is_active(client):
    payloads = [
        {
            "email": "admin-active@example.com",
            "username": "adminactive",
            "password": "test-password-123",
            "role": "admin",
            "first_name": "Admin",
            "last_name": "Active",
            "middle_name": None,
            "contact": None,
            "is_active": True,
            "performed_by": None,
        },
        {
            "email": "staff-inactive@example.com",
            "username": "staffinactive",
            "password": "test-password-123",
            "role": "staff",
            "first_name": "Staff",
            "last_name": "Inactive",
            "middle_name": None,
            "contact": None,
            "is_active": False,
            "performed_by": None,
        },
    ]

    for payload in payloads:
        response = await client.post("/api/v1/users/", json=payload)
        assert response.status_code == 201

    response = await client.get("/api/v1/users/?role=admin&is_active=true")

    assert response.status_code == 200
    body = response.json()
    assert len(body["data"]) == 1
    assert body["data"][0]["email"] == payloads[0]["email"]
    assert body["meta"]["pagination"]["total"] == 1
    assert body["meta"]["filters"]["role"] == "admin"
    assert body["meta"]["filters"]["is_active"] is True


async def test_list_users_filters_by_search(client):
    payloads = [
        {
            "email": "jane.doe@example.com",
            "username": "janedoe",
            "password": "test-password-123",
            "role": "admin",
            "first_name": "Jane",
            "last_name": "Doe",
            "middle_name": None,
            "contact": None,
            "is_active": True,
            "performed_by": None,
        },
        {
            "email": "john.smith@example.com",
            "username": "johnsmith",
            "password": "test-password-123",
            "role": "staff",
            "first_name": "John",
            "last_name": "Smith",
            "middle_name": None,
            "contact": None,
            "is_active": True,
            "performed_by": None,
        },
    ]

    for payload in payloads:
        response = await client.post("/api/v1/users/", json=payload)
        assert response.status_code == 201

    response = await client.get("/api/v1/users/?search=jane")

    assert response.status_code == 200
    body = response.json()
    assert len(body["data"]) == 1
    assert body["data"][0]["email"] == payloads[0]["email"]
    assert body["meta"]["pagination"]["total"] == 1
    assert body["meta"]["filters"]["search"] == "jane"


async def test_list_users_sorts_by_field(client):
    payloads = [
        {
            "email": "alast@example.com",
            "username": "userb",
            "password": "test-password-123",
            "role": "admin",
            "first_name": "Alpha",
            "last_name": "Beta",
            "middle_name": None,
            "contact": None,
            "is_active": True,
            "performed_by": None,
        },
        {
            "email": "zzzz@example.com",
            "username": "usera",
            "password": "test-password-123",
            "role": "admin",
            "first_name": "Zeta",
            "last_name": "Alpha",
            "middle_name": None,
            "contact": None,
            "is_active": True,
            "performed_by": None,
        },
    ]

    for payload in payloads:
        response = await client.post("/api/v1/users/", json=payload)
        assert response.status_code == 201

    asc_response = await client.get("/api/v1/users/?sort_by=last_name&sort_order=asc")
    assert asc_response.status_code == 200
    asc_names = [item["last_name"] for item in asc_response.json()["data"]]
    assert asc_names == sorted(asc_names)

    desc_response = await client.get("/api/v1/users/?sort_by=last_name&sort_order=desc")
    assert desc_response.status_code == 200
    desc_names = [item["last_name"] for item in desc_response.json()["data"]]
    assert desc_names == sorted(desc_names, reverse=True)


async def test_soft_deleted_user_is_hidden_by_default_and_can_be_restored(client):
    payload = {
        "email": "restore-me@example.com",
        "username": "restoreme",
        "password": "test-password-123",
        "role": "admin",
        "first_name": "Restore",
        "last_name": "Target",
        "middle_name": None,
        "contact": None,
        "is_active": True,
        "performed_by": None,
    }

    create_response = await client.post("/api/v1/users/", json=payload)
    assert create_response.status_code == 201
    user_id = create_response.json()["data"]["user_id"]

    delete_response = await client.request(
        "DELETE",
        f"/api/v1/users/{user_id}",
        json={"performed_by": None},
    )
    assert delete_response.status_code == 200
    assert delete_response.json()["data"]["is_deleted"] is True
    assert delete_response.json()["data"]["deleted_at"] is not None

    get_response = await client.get(f"/api/v1/users/{user_id}")
    assert get_response.status_code == 404

    default_list_response = await client.get("/api/v1/users/")
    assert default_list_response.status_code == 200
    assert default_list_response.json()["meta"]["pagination"]["total"] == 0

    include_deleted_response = await client.get("/api/v1/users/?include_deleted=true")
    assert include_deleted_response.status_code == 200
    assert include_deleted_response.json()["meta"]["pagination"]["total"] == 1
    assert include_deleted_response.json()["data"][0]["is_deleted"] is True

    restore_response = await client.post(
        f"/api/v1/users/{user_id}/restore",
        json={"performed_by": None},
    )
    assert restore_response.status_code == 200
    assert restore_response.json()["message"] == "User restored."
    assert restore_response.json()["data"]["is_deleted"] is False
    assert restore_response.json()["data"]["deleted_at"] is None

    restored_get_response = await client.get(f"/api/v1/users/{user_id}")
    assert restored_get_response.status_code == 200
    assert restored_get_response.json()["data"]["user_id"] == user_id


async def test_restore_rejects_active_user(client):
    payload = {
        "email": "active-user@example.com",
        "username": "activeuser",
        "password": "test-password-123",
        "role": "admin",
        "first_name": "Active",
        "last_name": "User",
        "middle_name": None,
        "contact": None,
        "is_active": True,
        "performed_by": None,
    }

    create_response = await client.post("/api/v1/users/", json=payload)
    assert create_response.status_code == 201
    user_id = create_response.json()["data"]["user_id"]

    restore_response = await client.post(
        f"/api/v1/users/{user_id}/restore",
        json={"performed_by": None},
    )
    assert restore_response.status_code == 400
    assert restore_response.json()["message"] == "User is not deleted."


async def test_create_rejects_duplicate_email_from_soft_deleted_user(client):
    original_payload = {
        "email": "deleted-email@example.com",
        "username": "deletedemailuser",
        "password": "test-password-123",
        "role": "admin",
        "first_name": "Deleted",
        "last_name": "Email",
        "middle_name": None,
        "contact": None,
        "is_active": True,
        "performed_by": None,
    }
    replacement_payload = {
        **original_payload,
        "username": "replacementuser",
    }

    create_response = await client.post("/api/v1/users/", json=original_payload)
    assert create_response.status_code == 201
    user_id = create_response.json()["data"]["user_id"]

    delete_response = await client.request(
        "DELETE",
        f"/api/v1/users/{user_id}",
        json={"performed_by": None},
    )
    assert delete_response.status_code == 200

    duplicate_response = await client.post("/api/v1/users/", json=replacement_payload)
    assert duplicate_response.status_code == 400
    assert duplicate_response.json()["message"] == (
        "A deleted user with this email already exists. Restore that user instead."
    )


async def test_batch_create_users(client):
    payload = {
        "users": [
            {
                "email": "batch-one@example.com",
                "username": "batchone",
                "password": "test-password-123",
                "role": "admin",
                "first_name": "Batch",
                "last_name": "One",
                "middle_name": None,
                "contact": None,
                "is_active": True,
                "performed_by": None,
            },
            {
                "email": "batch-two@example.com",
                "username": "batchtwo",
                "password": "test-password-456",
                "role": "staff",
                "first_name": "Batch",
                "last_name": "Two",
                "middle_name": None,
                "contact": None,
                "is_active": True,
                "performed_by": None,
            },
        ]
    }

    response = await client.post("/api/v1/users/batch", json=payload)
    assert response.status_code == 201
    body = response.json()
    assert len(body["data"]) == 2
    assert body["data"][0]["email"] == "batch-one@example.com"
    assert body["data"][1]["email"] == "batch-two@example.com"
    assert "password" not in body["data"][0]
    assert body["data"][0]["user_id"].startswith("USER-")
    assert body["message"] == "Users created."

    list_response = await client.get("/api/v1/users/?sort_by=email&sort_order=asc")
    assert list_response.status_code == 200
    assert list_response.json()["meta"]["pagination"]["total"] >= 2


async def test_batch_create_rejects_duplicate_email_in_payload(client):
    payload = {
        "users": [
            {
                "email": "dup-batch@example.com",
                "username": "dupuser1",
                "password": "test-password-123",
                "role": "admin",
                "first_name": "Dup",
                "last_name": "One",
                "middle_name": None,
                "contact": None,
                "is_active": True,
                "performed_by": None,
            },
            {
                "email": "dup-batch@example.com",
                "username": "dupuser2",
                "password": "test-password-456",
                "role": "staff",
                "first_name": "Dup",
                "last_name": "Two",
                "middle_name": None,
                "contact": None,
                "is_active": True,
                "performed_by": None,
            },
        ]
    }

    response = await client.post("/api/v1/users/batch", json=payload)
    assert response.status_code == 400
    assert response.json()["message"] == "Duplicate email in batch."


async def test_batch_create_rejects_existing_email(client):
    # First create a user
    create_payload = {
        "email": "existing@example.com",
        "username": "existinguser",
        "password": "test-password-123",
        "role": "admin",
        "first_name": "Existing",
        "last_name": "User",
        "middle_name": None,
        "contact": None,
        "is_active": True,
        "performed_by": None,
    }
    create_response = await client.post("/api/v1/users/", json=create_payload)
    assert create_response.status_code == 201

    # Then try to batch create with the same email
    batch_payload = {
        "users": [
            {
                "email": "existing@example.com",
                "username": "newuser",
                "password": "test-password-123",
                "role": "staff",
                "first_name": "New",
                "last_name": "User",
                "middle_name": None,
                "contact": None,
                "is_active": True,
                "performed_by": None,
            }
        ]
    }
    response = await client.post("/api/v1/users/batch", json=batch_payload)
    assert response.status_code == 400
    assert response.json()["message"] == "Some emails already exist."
