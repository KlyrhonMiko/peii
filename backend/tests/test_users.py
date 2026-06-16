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
    assert list_response.json()["meta"]["count"] == 1


def test_password_is_stored_as_argon2_hash(client):
    from core.database import get_session
    from main import app
    from models.user import User
    from sqlmodel import select
    from utils.security import verify_password

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
