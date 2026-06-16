def test_create_and_list_users(client):
    payload = {
        "email": "user@example.com",
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

    list_response = client.get("/api/v1/users/")
    assert list_response.status_code == 200
    assert list_response.json()["meta"]["count"] == 1
