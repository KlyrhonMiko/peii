import base64
import hashlib
import hmac
import json
import time

import pytest

from core.exceptions import AppError
from services.password_reset_grant import consume_password_reset_grant, verify_password_reset_grant

VECTOR_SECRET = "0123456789abcdef0123456789abcdef"
TS_COMPATIBLE_VECTOR = (
    "eyJleHAiOjE4OTM0NTY2MDAsImp0aSI6IkFCQ0RFRkdISUpLTE1OT1BRUlNUVVZXWFlaYWJjZGVmZ2hpamtsbW5vcHFycyIsInB1cnBvc2UiOiJyZWNvdmVyeSIsInNpZCI6IjEyM2U0NTY3LWU4OWItNDJkMy1hNDU2LTQyNjYxNDE3NDAwMCIsInN1YiI6IjEyM2U0NTY3LWU4OWItNDJkMy1hNDU2LTQyNjYxNDE3NDAwMSIsInYiOjF9.N_faBG5hodYSarIZp9QZ32HVr_dWaFk19871e4uctoM"
)


def _grant(*, expires_at: int, jti: str = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrs") -> str:
    payload = {
        "exp": expires_at,
        "jti": jti,
        "purpose": "recovery",
        "sid": "123e4567-e89b-42d3-a456-426614174000",
        "sub": "123e4567-e89b-42d3-a456-426614174001",
        "v": 1,
    }
    encoded = base64.urlsafe_b64encode(
        json.dumps(payload, separators=(",", ":"), sort_keys=True).encode()
    ).rstrip(b"=").decode()
    signature = base64.urlsafe_b64encode(
        hmac.new(VECTOR_SECRET.encode(), encoded.encode(), hashlib.sha256).digest()
    ).rstrip(b"=").decode()
    return f"{encoded}.{signature}"


def test_validates_the_shared_typescript_compact_grant_vector() -> None:
    grant = verify_password_reset_grant(
        TS_COMPATIBLE_VECTOR, VECTOR_SECRET, now=1_893_456_000
    )

    assert str(grant.subject) == "123e4567-e89b-42d3-a456-426614174001"
    assert str(grant.session_id) == "123e4567-e89b-42d3-a456-426614174000"
    assert grant.purpose == "recovery"


def test_rejects_noncanonical_or_expired_grants() -> None:
    with pytest.raises(AppError) as expired:
        verify_password_reset_grant(_grant(expires_at=100), VECTOR_SECRET, now=100)
    assert expired.value.status_code == 401

    payload, signature = _grant(expires_at=1_893_456_300).split(".")
    with pytest.raises(AppError) as tampered:
        verify_password_reset_grant(
            f"{payload[:-1]}A.{signature}", VECTOR_SECRET, now=1_893_456_000
        )
    assert tampered.value.status_code == 401


@pytest.mark.anyio
async def test_consumption_is_atomic_and_fails_closed_when_redis_is_unavailable() -> None:
    class Redis:
        def __init__(self) -> None:
            self.used = False

        async def set(self, *_args: object, **_kwargs: object) -> bool:
            if self.used:
                return False
            self.used = True
            return True

    now = int(time.time())
    grant = verify_password_reset_grant(_grant(expires_at=now + 300), VECTOR_SECRET, now=now)
    redis = Redis()
    await consume_password_reset_grant(grant, redis, VECTOR_SECRET, now=now)

    with pytest.raises(AppError) as replayed:
        await consume_password_reset_grant(grant, redis, VECTOR_SECRET, now=now)
    assert replayed.value.status_code == 401

    with pytest.raises(AppError) as unavailable:
        await consume_password_reset_grant(grant, None, VECTOR_SECRET, now=now)
    assert unavailable.value.status_code == 503
