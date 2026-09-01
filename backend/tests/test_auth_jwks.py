import asyncio
from uuid import UUID

import pytest

from core import auth
from core.exceptions import AppError


class SigningKey:
    key = "test-key"


class JwksClient:
    def __init__(self) -> None:
        self.tokens: list[str] = []

    def get_signing_key_from_jwt(self, token: str) -> SigningKey:
        self.tokens.append(token)
        return SigningKey()


def test_jwks_client_is_cached(monkeypatch):
    created: list[str] = []

    class CachedJwksClient:
        def __init__(self, url: str) -> None:
            created.append(url)

    auth._jwks_client.cache_clear()
    monkeypatch.setattr(auth, "PyJWKClient", CachedJwksClient)

    first = auth._jwks_client()
    second = auth._jwks_client()

    assert first is second
    assert len(created) == 1
    auth._jwks_client.cache_clear()


@pytest.mark.anyio
async def test_verify_bearer_token_moves_jwks_lookup_off_the_event_loop(monkeypatch):
    client = JwksClient()
    monkeypatch.setattr(auth, "_jwks_client", lambda: client)
    monkeypatch.setattr(
        auth.jwt,
        "decode",
        lambda *_args, **_kwargs: {"sub": "00000000-0000-0000-0000-000000000123"},
    )
    calls: list[object] = []
    original_to_thread = asyncio.to_thread

    async def capture_to_thread(function, /, *args, **kwargs):
        calls.append(function)
        return await original_to_thread(function, *args, **kwargs)

    monkeypatch.setattr(auth.asyncio, "to_thread", capture_to_thread)

    claims = await auth.verify_bearer_token("Bearer token")

    assert claims.subject == UUID("00000000-0000-0000-0000-000000000123")
    assert client.tokens == ["token"]
    assert calls == [client.get_signing_key_from_jwt]


@pytest.mark.anyio
async def test_malformed_jwt_logs_only_safe_error_type(monkeypatch):
    events: list[tuple[str, dict[str, object]]] = []

    class CaptureLogger:
        def warning(self, event: str, **kwargs: object) -> None:
            events.append((event, kwargs))

    class FailingJwksClient:
        def get_signing_key_from_jwt(self, token: str) -> SigningKey:
            raise auth.jwt.DecodeError(f"malformed token: {token}")

    monkeypatch.setattr(auth, "logger", CaptureLogger())
    monkeypatch.setattr(auth, "_jwks_client", lambda: FailingJwksClient())

    raw_token = "malformed-secret-token"
    with pytest.raises(AppError):
        await auth.verify_bearer_token(f"Bearer {raw_token}")

    assert events == [
        (
            "jwt_verification_failed",
            {"error_type": "DecodeError"},
        )
    ]
    assert raw_token not in str(events)


@pytest.mark.anyio
async def test_verify_bearer_token_parses_optional_session_and_auth_claims(monkeypatch):
    monkeypatch.setattr(auth, "_jwks_client", lambda: JwksClient())
    monkeypatch.setattr(
        auth.jwt,
        "decode",
        lambda *_args, **_kwargs: {
            "sub": "00000000-0000-0000-0000-000000000123",
            "session_id": "00000000-0000-0000-0000-000000000124",
            "amr": [{"method": "oauth"}, "password"],
            "email": "respondent@example.com",
            "is_anonymous": False,
            "app_metadata": {"provider": "google"},
        },
    )

    claims = await auth.verify_bearer_token("Bearer token")

    assert claims.session_id == UUID("00000000-0000-0000-0000-000000000124")
    assert claims.amr == ("oauth", "password")
    assert claims.email == "respondent@example.com"
    assert claims.is_anonymous is False
    assert claims.app_metadata == {"provider": "google"}
    assert claims.has_oauth_amr is True


@pytest.mark.anyio
async def test_verify_bearer_token_rejects_malformed_optional_claims(monkeypatch):
    monkeypatch.setattr(auth, "_jwks_client", lambda: JwksClient())
    monkeypatch.setattr(
        auth.jwt,
        "decode",
        lambda *_args, **_kwargs: {
            "sub": "00000000-0000-0000-0000-000000000123",
            "session_id": "not-a-uuid",
        },
    )

    with pytest.raises(AppError) as error:
        await auth.verify_bearer_token("Bearer token")

    assert error.value.status_code == 401
