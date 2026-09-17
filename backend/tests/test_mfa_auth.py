from __future__ import annotations

from typing import Any
from uuid import UUID

import httpx
import pytest

from core import deps
from core.auth import AuthClaims, verify_bearer_token
from core.config import settings
from core.deps import get_current_principal
from core.exceptions import AppError
from main import app
from models.user import User
from services import supabase_auth_service

pytestmark = pytest.mark.anyio
PROVIDER_USER_ID = "00000000-0000-0000-0000-000000000402"


class FakeResponse:
    def __init__(self, status_code: int = 200, payload: object = None) -> None:
        self.status_code = status_code
        self._payload = payload

    def json(self) -> object:
        return self._payload


class SequenceClient:
    def __init__(self, responses: list[FakeResponse]) -> None:
        self.responses = responses
        self.calls: list[tuple[str, dict[str, object]]] = []

    async def get(self, url: str, **kwargs: object) -> FakeResponse:
        self.calls.append((url, kwargs))
        return self.responses.pop(0)


def _portal_user() -> User:
    return User(
        id=UUID("00000000-0000-0000-0000-000000000401"),
        user_id="USER-MFA",
        auth_user_id=UUID("00000000-0000-0000-0000-000000000402"),
        email="mfa@example.com",
        username="mfa-user",
        first_name="Mfa",
        last_name="User",
    )


def _claims(user: User, *, aal: str = "aal1", amr: tuple[str, ...] = ("password",)) -> AuthClaims:
    assert user.auth_user_id is not None
    return AuthClaims(
        subject=user.auth_user_id,
        access_token="caller-access-token",
        aal=aal,  # type: ignore[arg-type]
        amr=amr,
        is_anonymous=False,
    )


async def test_factor_lookup_uses_caller_bearer_and_treats_any_verified_factor_as_mfa(
    monkeypatch,
):
    client = SequenceClient(
        [
            FakeResponse(
                payload={
                    "id": PROVIDER_USER_ID,
                    "factors": [
                        {"factor_type": "totp", "status": "unverified"},
                        {"factor_type": "phone", "status": "verified"},
                    ]
                }
            )
        ]
    )
    monkeypatch.setattr(supabase_auth_service, "get_http_client", lambda: client)

    assert await supabase_auth_service.has_verified_mfa_factor("caller-access-token") is True

    url, kwargs = client.calls[0]
    assert url.endswith("/auth/v1/user")
    headers = kwargs["headers"]
    assert isinstance(headers, dict)
    assert headers == {
        "apikey": settings.SUPABASE_PUBLISHABLE_KEY,
        "Authorization": "Bearer caller-access-token",
    }


async def test_factor_lookup_does_not_cache_negative_state(monkeypatch):
    client = SequenceClient(
        [
            FakeResponse(payload={"id": PROVIDER_USER_ID, "factors": []}),
            FakeResponse(
                payload={
                    "id": PROVIDER_USER_ID,
                    "factors": [{"factor_type": "totp", "status": "verified"}],
                }
            ),
        ]
    )
    monkeypatch.setattr(supabase_auth_service, "get_http_client", lambda: client)

    assert await supabase_auth_service.has_verified_mfa_factor("caller-access-token") is False
    assert await supabase_auth_service.has_verified_mfa_factor("caller-access-token") is True
    assert len(client.calls) == 2


async def test_factor_lookup_allows_authenticated_user_with_omitted_empty_factors(monkeypatch):
    client = SequenceClient([FakeResponse(payload={"id": PROVIDER_USER_ID})])
    monkeypatch.setattr(supabase_auth_service, "get_http_client", lambda: client)

    assert await supabase_auth_service.has_verified_mfa_factor("caller-access-token") is False


@pytest.mark.parametrize(
    "payload",
    [
        None,
        {},
        {"id": "not-a-uuid"},
        {"id": PROVIDER_USER_ID, "factors": None},
        {"id": PROVIDER_USER_ID, "factors": {}},
        {"id": PROVIDER_USER_ID, "factors": [{}]},
        {"id": PROVIDER_USER_ID, "factors": [{"factor_type": "totp", "status": None}]},
        {"id": PROVIDER_USER_ID, "factors": [{"factor_type": "totp", "status": "pending"}]},
    ],
)
async def test_factor_lookup_fails_closed_on_malformed_provider_response(monkeypatch, payload):
    client = SequenceClient([FakeResponse(payload=payload)])
    monkeypatch.setattr(supabase_auth_service, "get_http_client", lambda: client)

    with pytest.raises(AppError) as error:
        await supabase_auth_service.has_verified_mfa_factor("caller-access-token")

    assert error.value.status_code == 503
    assert error.value.errors == {"code": supabase_auth_service.MFA_CHECK_UNAVAILABLE_ERROR_CODE}


async def test_factor_lookup_fails_closed_on_provider_error(monkeypatch):
    class FailingClient:
        async def get(self, _url: str, **_kwargs: object) -> FakeResponse:
            raise httpx.ConnectError("provider unavailable")

    monkeypatch.setattr(supabase_auth_service, "get_http_client", lambda: FailingClient())

    with pytest.raises(AppError) as error:
        await supabase_auth_service.has_verified_mfa_factor("caller-access-token")

    assert error.value.status_code == 503
    assert error.value.errors == {"code": supabase_auth_service.MFA_CHECK_UNAVAILABLE_ERROR_CODE}
    assert "caller-access-token" not in str(error.value)


@pytest.mark.parametrize("status_code", [401, 500])
async def test_factor_lookup_fails_closed_on_non_success_provider_response(
    monkeypatch, status_code
):
    client = SequenceClient([FakeResponse(status_code=status_code)])
    monkeypatch.setattr(supabase_auth_service, "get_http_client", lambda: client)

    with pytest.raises(AppError) as error:
        await supabase_auth_service.has_verified_mfa_factor("caller-access-token")

    assert error.value.status_code == 503
    assert error.value.errors == {"code": supabase_auth_service.MFA_CHECK_UNAVAILABLE_ERROR_CODE}


async def test_current_principal_denies_aal1_when_a_verified_factor_exists(monkeypatch):
    user = _portal_user()
    calls: list[str] = []

    async def get_user(_session: Any, _subject: UUID) -> User:
        return user

    async def permissions(_session: Any, _user_id: UUID) -> set[str]:
        return {"portal.access"}

    async def factor_check(access_token: str) -> bool:
        calls.append(access_token)
        return True

    monkeypatch.setattr(deps.auth_service, "get_user_by_auth_subject", get_user)
    monkeypatch.setattr(deps.auth_service.rbac_service, "effective_permissions_cached", permissions)
    monkeypatch.setattr(deps.supabase_auth_service, "has_verified_mfa_factor", factor_check)

    with pytest.raises(AppError) as error:
        await deps.get_current_principal(session=None, claims=_claims(user))  # type: ignore[arg-type]

    assert error.value.status_code == 403
    assert error.value.message == "Multi-factor authentication is required."
    assert error.value.errors == {"code": supabase_auth_service.MFA_REQUIRED_ERROR_CODE}
    assert calls == ["caller-access-token"]


async def test_current_principal_allows_aal1_without_a_verified_factor(monkeypatch):
    user = _portal_user()
    calls: list[str] = []

    async def get_user(_session: Any, _subject: UUID) -> User:
        return user

    async def permissions(_session: Any, _user_id: UUID) -> set[str]:
        return {"portal.access"}

    async def factor_check(access_token: str) -> bool:
        calls.append(access_token)
        return False

    monkeypatch.setattr(deps.auth_service, "get_user_by_auth_subject", get_user)
    monkeypatch.setattr(deps.auth_service.rbac_service, "effective_permissions_cached", permissions)
    monkeypatch.setattr(deps.supabase_auth_service, "has_verified_mfa_factor", factor_check)

    principal = await deps.get_current_principal(session=None, claims=_claims(user))  # type: ignore[arg-type]

    assert principal.user is user
    assert principal.permissions == frozenset({"portal.access"})
    assert calls == ["caller-access-token"]


async def test_current_principal_skips_factor_lookup_for_aal2(monkeypatch):
    user = _portal_user()

    async def get_user(_session: Any, _subject: UUID) -> User:
        return user

    async def permissions(_session: Any, _user_id: UUID) -> set[str]:
        return {"portal.access"}

    async def factor_check(_access_token: str) -> bool:
        raise AssertionError("AAL2 must not query Supabase factor state")

    monkeypatch.setattr(deps.auth_service, "get_user_by_auth_subject", get_user)
    monkeypatch.setattr(deps.auth_service.rbac_service, "effective_permissions_cached", permissions)
    monkeypatch.setattr(deps.supabase_auth_service, "has_verified_mfa_factor", factor_check)

    principal = await deps.get_current_principal(session=None, claims=_claims(user, aal="aal2"))  # type: ignore[arg-type]

    assert principal.user is user


async def test_current_principal_does_not_query_factor_state_without_portal_access(monkeypatch):
    user = _portal_user()

    async def get_user(_session: Any, _subject: UUID) -> User:
        return user

    async def permissions(_session: Any, _user_id: UUID) -> set[str]:
        return set()

    async def factor_check(_access_token: str) -> bool:
        raise AssertionError("non-portal principals must not query MFA state")

    monkeypatch.setattr(deps.auth_service, "get_user_by_auth_subject", get_user)
    monkeypatch.setattr(deps.auth_service.rbac_service, "effective_permissions_cached", permissions)
    monkeypatch.setattr(deps.supabase_auth_service, "has_verified_mfa_factor", factor_check)

    with pytest.raises(AppError) as error:
        await deps.get_current_principal(session=None, claims=_claims(user))  # type: ignore[arg-type]

    assert error.value.status_code == 403
    assert error.value.errors is None


async def test_current_principal_rejects_oauth_before_local_or_factor_lookup(monkeypatch):
    user = _portal_user()

    async def fail_get_user(*_args: object) -> User:
        raise AssertionError("OAuth portal sessions must not touch local users")

    async def fail_factor_check(_access_token: str) -> bool:
        raise AssertionError("OAuth portal sessions must not query MFA state")

    monkeypatch.setattr(deps.auth_service, "get_user_by_auth_subject", fail_get_user)
    monkeypatch.setattr(deps.supabase_auth_service, "has_verified_mfa_factor", fail_factor_check)

    with pytest.raises(AppError) as error:
        await deps.get_current_principal(session=None, claims=_claims(user, amr=("oauth",)))  # type: ignore[arg-type]

    assert error.value.status_code == 401
    assert error.value.message == "Authentication is not available for this account."


async def test_portal_mfa_requirement_uses_stable_error_envelope(client, monkeypatch):
    user = _portal_user()
    app.dependency_overrides.pop(get_current_principal, None)

    async def claims_override() -> AuthClaims:
        return _claims(user)

    async def get_user(_session: Any, _subject: UUID) -> User:
        return user

    async def permissions(_session: Any, _user_id: UUID) -> set[str]:
        return {"portal.access"}

    async def factor_check(_access_token: str) -> bool:
        return True

    app.dependency_overrides[verify_bearer_token] = claims_override
    monkeypatch.setattr(deps.auth_service, "get_user_by_auth_subject", get_user)
    monkeypatch.setattr(deps.auth_service.rbac_service, "effective_permissions_cached", permissions)
    monkeypatch.setattr(deps.supabase_auth_service, "has_verified_mfa_factor", factor_check)

    response = await client.get("/api/v1/auth/me")

    assert response.status_code == 403
    payload = response.json()
    assert set(payload) == {"data", "message", "errors", "meta"}
    assert payload["data"] is None
    assert payload["message"] == "Multi-factor authentication is required."
    assert payload["errors"] == {"code": "mfa_required"}
    assert payload["meta"]["request_id"]
