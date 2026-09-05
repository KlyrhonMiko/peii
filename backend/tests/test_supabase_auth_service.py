from __future__ import annotations

from typing import cast

import pytest

from core.exceptions import AppError
from services import supabase_auth_service

pytestmark = pytest.mark.anyio


class FakeResponse:
    def __init__(
        self,
        status_code: int = 200,
        payload: dict[str, object] | None = None,
    ) -> None:
        self.status_code = status_code
        self._payload = payload or {}

    def json(self) -> dict[str, object]:
        return self._payload

    @property
    def text(self) -> str:
        return str(self._payload)


class FakeClient:
    def __init__(self) -> None:
        self.calls: list[dict[str, object]] = []

    async def __aenter__(self) -> FakeClient:
        return self

    async def __aexit__(self, *_: object) -> None:
        return None

    async def post(self, url: str, **kwargs: object) -> FakeResponse:
        self.calls.append({"url": url, **kwargs})
        return FakeResponse()


async def test_recovery_sends_redirect_to_as_query_parameter(monkeypatch):
    client = FakeClient()
    monkeypatch.setattr(supabase_auth_service, "get_http_client", lambda: client)

    await supabase_auth_service.send_recovery_email(
        "user@example.com", "http://localhost:3000/auth/confirm?next=/reset-password"
    )

    assert client.calls[0]["params"] == {
        "redirect_to": "http://localhost:3000/auth/confirm?next=/reset-password"
    }
    assert client.calls[0]["json"] == {"email": "user@example.com"}


async def test_invitation_sends_redirect_to_as_query_parameter(monkeypatch):
    client = FakeClient()
    monkeypatch.setattr(supabase_auth_service, "get_http_client", lambda: client)

    await supabase_auth_service.invite_user(
        "user@example.com", "http://localhost:3000/auth/confirm?next=/reset-password"
    )

    assert client.calls[0]["params"] == {
        "redirect_to": "http://localhost:3000/auth/confirm?next=/reset-password"
    }
    assert client.calls[0]["json"] == {"email": "user@example.com"}


async def test_revoke_user_sessions_uses_supabase_admin_global_logout(monkeypatch):
    client = FakeClient()
    monkeypatch.setattr(supabase_auth_service, "get_http_client", lambda: client)

    await supabase_auth_service.revoke_user_sessions("00000000-0000-0000-0000-000000000003")

    url = client.calls[0]["url"]
    assert isinstance(url, str)
    assert url.endswith(
        "/auth/v1/admin/users/00000000-0000-0000-0000-000000000003/logout"
    )
    assert client.calls[0]["json"] == {"scope": "global"}


async def test_logout_user_session_uses_the_callers_access_token(monkeypatch):
    client = FakeClient()
    monkeypatch.setattr(supabase_auth_service, "get_http_client", lambda: client)

    await supabase_auth_service.logout_user_session("user-access-token")

    url = client.calls[0]["url"]
    headers = client.calls[0]["headers"]
    assert isinstance(url, str)
    assert isinstance(headers, dict)
    assert url.endswith("/auth/v1/logout")
    assert headers["Authorization"] == "Bearer user-access-token"


class FakeListClient:
    def __init__(self, pages: list[list[dict[str, object]]]) -> None:
        self.pages = pages
        self.calls: list[dict[str, object]] = []

    async def __aenter__(self) -> FakeListClient:
        return self

    async def __aexit__(self, *_: object) -> None:
        return None

    async def get(self, url: str, **kwargs: object) -> FakeResponse:
        self.calls.append({"url": url, **kwargs})
        params = kwargs["params"]
        assert isinstance(params, dict)
        page = int(cast(str, params.get("page")))
        return FakeResponse(payload={"users": self.pages[page - 1]})


def _bulk_users(count: int) -> list[dict[str, object]]:
    return [
        {"id": f"00000000-0000-0000-0000-{index:012d}", "email": f"bulk{index}@example.com"}
        for index in range(count)
    ]


async def test_auth_user_lookup_scans_past_the_first_page(monkeypatch):
    client = FakeListClient(
        [
            _bulk_users(1000),
            [
                {
                    "id": "00000000-0000-0000-0000-000000000099",
                    "email": "Target@Example.COM",
                }
            ],
        ]
    )
    monkeypatch.setattr(supabase_auth_service, "get_http_client", lambda: client)

    result = await supabase_auth_service.get_auth_user_by_email(" target@example.com ")

    assert result is not None
    assert result["id"] == "00000000-0000-0000-0000-000000000099"
    assert len(client.calls) == 2
    assert client.calls[1]["params"] == {"page": 2, "per_page": 1000}


async def test_auth_user_lookup_stops_after_a_short_page(monkeypatch):
    client = FakeListClient([_bulk_users(1000), _bulk_users(10)])
    monkeypatch.setattr(supabase_auth_service, "get_http_client", lambda: client)

    result = await supabase_auth_service.get_auth_user_by_email("missing@example.com")

    assert result is None
    assert len(client.calls) == 2


async def test_auth_user_lookup_fails_closed_on_non_200(monkeypatch):
    class FailingClient:
        status_code = 500

        async def __aenter__(self) -> FailingClient:
            return self

        async def __aexit__(self, *_: object) -> None:
            return None

        async def get(self, *_: object, **__: object) -> FakeResponse:
            return FakeResponse(status_code=500)

    monkeypatch.setattr(
        supabase_auth_service, "get_http_client", lambda: FailingClient()
    )

    with pytest.raises(AppError) as exc_info:
        await supabase_auth_service.get_auth_user_by_email("user@example.com")
    assert exc_info.value.status_code == 502


async def test_invite_maps_duplicate_auth_user_to_conflict(monkeypatch):
    class DuplicateClient:
        async def __aenter__(self) -> DuplicateClient:
            return self

        async def __aexit__(self, *_: object) -> None:
            return None

        async def post(self, *_: object, **__: object) -> FakeResponse:
            return FakeResponse(status_code=400, payload={"message": "User already registered"})

    monkeypatch.setattr(
        supabase_auth_service, "get_http_client", lambda: DuplicateClient()
    )

    with pytest.raises(AppError) as exc_info:
        await supabase_auth_service.invite_user(
            "user@example.com", "http://localhost:3000/auth/confirm?next=/reset-password"
        )
    assert exc_info.value.status_code == 409
    assert exc_info.value.errors == ["User already registered"]


async def test_invite_keeps_generic_502_for_other_failures(monkeypatch):
    class FailingClient:
        async def __aenter__(self) -> FailingClient:
            return self

        async def __aexit__(self, *_: object) -> None:
            return None

        async def post(self, *_: object, **__: object) -> FakeResponse:
            return FakeResponse(status_code=500, payload={"message": "boom"})

    monkeypatch.setattr(
        supabase_auth_service, "get_http_client", lambda: FailingClient()
    )

    with pytest.raises(AppError) as exc_info:
        await supabase_auth_service.invite_user(
            "user@example.com", "http://localhost:3000/auth/confirm?next=/reset-password"
        )
    assert exc_info.value.status_code == 502
