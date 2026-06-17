from uuid import UUID

from sqlmodel import select

from core.database import get_session
from main import app
from models.user import User
from utils.security import verify_password


def test_create_and_list_users(client):
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

    create_response = client.post("/api/v1/users/", json=payload)
    assert create_response.status_code == 201
    assert create_response.json()["data"]["email"] == payload["email"]
    assert create_response.json()["data"]["username"] == payload["username"]
    assert "password" not in create_response.json()["data"]

    list_response = client.get("/api/v1/users/")
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


def test_password_is_stored_as_argon2_hash(client):
    payload = {
        "email": "secure@example.com",
        "username": "secureuser",
        "password": "test-password-123",
        "role": "admin",
        "first_name": "Jane",
        "last_name": "Doe",
        "middle_name": None,
        "contact": None,
        "is_active": True,
        "performed_by": None,
    }

    create_response = client.post("/api/v1/users/", json=payload)
    assert create_response.status_code == 201

    override = app.dependency_overrides[get_session]
    session_generator = override()
    session = next(session_generator)
    try:
        user = session.exec(select(User).where(User.email == payload["email"])).first()
    finally:
        session_generator.close()

    assert user is not None
    assert user.password.startswith("$argon2")
    assert verify_password(payload["password"], user.password) is True


def test_user_not_found_uses_universal_error_shape(client):
    response = client.get("/api/v1/users/00000000-0000-0000-0000-000000000000")

    assert response.status_code == 404
    assert response.json() == {
        "data": None,
        "message": "User not found.",
        "errors": None,
        "meta": None,
    }


def test_validation_error_uses_universal_error_shape(client):
    response = client.post("/api/v1/users/", json={})

    assert response.status_code == 422
    body = response.json()
    assert body["data"] is None
    assert body["message"] == "Validation error."
    assert isinstance(body["errors"], list)
    assert body["meta"] is None


def test_list_users_uses_shared_query_params(client):
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
        response = client.post("/api/v1/users/", json=payload)
        assert response.status_code == 201

    response = client.get("/api/v1/users/?limit=1&offset=0&sort_order=asc&sort_by=email")

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


def test_list_users_filters_by_role_and_is_active(client):
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
        response = client.post("/api/v1/users/", json=payload)
        assert response.status_code == 201

    response = client.get("/api/v1/users/?role=admin&is_active=true")

    assert response.status_code == 200
    body = response.json()
    assert len(body["data"]) == 1
    assert body["data"][0]["email"] == payloads[0]["email"]
    assert body["meta"]["pagination"]["total"] == 1
    assert body["meta"]["filters"]["role"] == "admin"
    assert body["meta"]["filters"]["is_active"] is True


def test_list_users_filters_by_search(client):
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
        response = client.post("/api/v1/users/", json=payload)
        assert response.status_code == 201

    response = client.get("/api/v1/users/?search=jane")

    assert response.status_code == 200
    body = response.json()
    assert len(body["data"]) == 1
    assert body["data"][0]["email"] == payloads[0]["email"]
    assert body["meta"]["pagination"]["total"] == 1
    assert body["meta"]["filters"]["search"] == "jane"


def test_list_users_uses_stable_secondary_sort_for_ties(client):
    payloads = [
        {
            "email": "tie-one@example.com",
            "username": "tieone",
            "password": "test-password-123",
            "role": "admin",
            "first_name": "Tie",
            "last_name": "Same",
            "middle_name": None,
            "contact": None,
            "is_active": True,
            "performed_by": None,
        },
        {
            "email": "tie-two@example.com",
            "username": "tietwo",
            "password": "test-password-123",
            "role": "admin",
            "first_name": "Tie",
            "last_name": "Same",
            "middle_name": None,
            "contact": None,
            "is_active": True,
            "performed_by": None,
        },
    ]

    created_ids: list[str] = []
    for payload in payloads:
        response = client.post("/api/v1/users/", json=payload)
        assert response.status_code == 201
        created_ids.append(response.json()["data"]["id"])

    asc_response = client.get("/api/v1/users/?sort_by=last_name&sort_order=asc")
    assert asc_response.status_code == 200
    asc_ids = [item["id"] for item in asc_response.json()["data"]]
    assert asc_ids == [str(value) for value in sorted(UUID(user_id) for user_id in created_ids)]

    desc_response = client.get("/api/v1/users/?sort_by=last_name&sort_order=desc")
    assert desc_response.status_code == 200
    desc_ids = [item["id"] for item in desc_response.json()["data"]]
    assert desc_ids == [
        str(value)
        for value in sorted((UUID(user_id) for user_id in created_ids), reverse=True)
    ]


def test_soft_deleted_user_is_hidden_by_default_and_can_be_restored(client):
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

    create_response = client.post("/api/v1/users/", json=payload)
    assert create_response.status_code == 201
    user_id = create_response.json()["data"]["id"]

    delete_response = client.request(
        "DELETE",
        f"/api/v1/users/{user_id}",
        json={"performed_by": None},
    )
    assert delete_response.status_code == 200
    assert delete_response.json()["data"]["is_deleted"] is True
    assert delete_response.json()["data"]["deleted_at"] is not None

    get_response = client.get(f"/api/v1/users/{user_id}")
    assert get_response.status_code == 404

    default_list_response = client.get("/api/v1/users/")
    assert default_list_response.status_code == 200
    assert default_list_response.json()["meta"]["pagination"]["total"] == 0

    include_deleted_response = client.get("/api/v1/users/?include_deleted=true")
    assert include_deleted_response.status_code == 200
    assert include_deleted_response.json()["meta"]["pagination"]["total"] == 1
    assert include_deleted_response.json()["data"][0]["is_deleted"] is True

    restore_response = client.post(
        f"/api/v1/users/{user_id}/restore",
        json={"performed_by": None},
    )
    assert restore_response.status_code == 200
    assert restore_response.json()["message"] == "User restored."
    assert restore_response.json()["data"]["is_deleted"] is False
    assert restore_response.json()["data"]["deleted_at"] is None

    restored_get_response = client.get(f"/api/v1/users/{user_id}")
    assert restored_get_response.status_code == 200
    assert restored_get_response.json()["data"]["id"] == user_id


def test_restore_rejects_active_user(client):
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

    create_response = client.post("/api/v1/users/", json=payload)
    assert create_response.status_code == 201
    user_id = create_response.json()["data"]["id"]

    restore_response = client.post(
        f"/api/v1/users/{user_id}/restore",
        json={"performed_by": None},
    )
    assert restore_response.status_code == 400
    assert restore_response.json()["message"] == "User is not deleted."


def test_create_rejects_duplicate_email_from_soft_deleted_user(client):
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

    create_response = client.post("/api/v1/users/", json=original_payload)
    assert create_response.status_code == 201
    user_id = create_response.json()["data"]["id"]

    delete_response = client.request(
        "DELETE",
        f"/api/v1/users/{user_id}",
        json={"performed_by": None},
    )
    assert delete_response.status_code == 200

    duplicate_response = client.post("/api/v1/users/", json=replacement_payload)
    assert duplicate_response.status_code == 400
    assert duplicate_response.json()["message"] == (
        "A deleted user with this email already exists. Restore that user instead."
    )
