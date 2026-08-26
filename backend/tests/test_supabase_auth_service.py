import pytest

from services import supabase_auth_service

pytestmark = pytest.mark.anyio


class FakeResponse:
    status_code = 200

    def json(self) -> dict[str, object]:
        return {"user": {"id": "00000000-0000-0000-0000-000000000003"}}


class FakeClient:
    def __init__(self) -> None:
        self.calls: list[dict[str, object]] = []

    async def __aenter__(self) -> "FakeClient":
        return self

    async def __aexit__(self, *_: object) -> None:
        return None

    async def post(self, url: str, **kwargs: object) -> FakeResponse:
        self.calls.append({"url": url, **kwargs})
        return FakeResponse()


async def test_recovery_sends_redirect_to_as_query_parameter(monkeypatch):
    client = FakeClient()
    monkeypatch.setattr(supabase_auth_service.httpx, "AsyncClient", lambda **_: client)

    await supabase_auth_service.send_recovery_email(
        "user@example.com", "http://localhost:3000/auth/confirm?next=/reset-password"
    )

    assert client.calls[0]["params"] == {
        "redirect_to": "http://localhost:3000/auth/confirm?next=/reset-password"
    }
    assert client.calls[0]["json"] == {"email": "user@example.com"}


async def test_invitation_sends_redirect_to_as_query_parameter(monkeypatch):
    client = FakeClient()
    monkeypatch.setattr(supabase_auth_service.httpx, "AsyncClient", lambda **_: client)

    await supabase_auth_service.invite_user(
        "user@example.com", "http://localhost:3000/auth/confirm?next=/reset-password"
    )

    assert client.calls[0]["params"] == {
        "redirect_to": "http://localhost:3000/auth/confirm?next=/reset-password"
    }
    assert client.calls[0]["json"] == {"email": "user@example.com"}


async def test_revoke_user_sessions_uses_supabase_admin_global_logout(monkeypatch):
    client = FakeClient()
    monkeypatch.setattr(supabase_auth_service.httpx, "AsyncClient", lambda **_: client)

    await supabase_auth_service.revoke_user_sessions("00000000-0000-0000-0000-000000000003")

    url = client.calls[0]["url"]
    assert isinstance(url, str)
    assert url.endswith(
        "/auth/v1/admin/users/00000000-0000-0000-0000-000000000003/logout"
    )
    assert client.calls[0]["json"] == {"scope": "global"}


async def test_logout_user_session_uses_the_callers_access_token(monkeypatch):
    client = FakeClient()
    monkeypatch.setattr(supabase_auth_service.httpx, "AsyncClient", lambda **_: client)

    await supabase_auth_service.logout_user_session("user-access-token")

    url = client.calls[0]["url"]
    headers = client.calls[0]["headers"]
    assert isinstance(url, str)
    assert isinstance(headers, dict)
    assert url.endswith("/auth/v1/logout")
    assert headers["Authorization"] == "Bearer user-access-token"
