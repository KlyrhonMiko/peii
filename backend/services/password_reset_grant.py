"""Signed, one-time password-reset grant validation and replay-key helpers."""

import base64
import hmac
import json
import time
from dataclasses import dataclass
from hashlib import sha256
from typing import Protocol
from uuid import UUID

from core.exceptions import AppError

PASSWORD_RESET_GRANT_VERSION = 1
PASSWORD_RESET_GRANT_MAX_AGE_SECONDS = 600
_REQUIRED_FIELDS = frozenset({"exp", "jti", "purpose", "sid", "sub", "v"})
_BASE64URL_CHARACTERS = frozenset(
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
)


@dataclass(frozen=True)
class PasswordResetGrant:
    subject: UUID
    session_id: UUID
    purpose: str
    jti: str
    expires_at: int


class PasswordResetGrantRedis(Protocol):
    async def set(self, key: str, value: str, *, ex: int, nx: bool) -> object: ...


def _base64url_decode(value: str) -> bytes:
    if not value or not set(value).issubset(_BASE64URL_CHARACTERS):
        raise ValueError("invalid base64url")
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def _base64url_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _canonical_payload(payload: dict[str, object]) -> bytes:
    return json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")


def verify_password_reset_grant(
    token: str,
    secret: str,
    *,
    now: int | None = None,
) -> PasswordResetGrant:
    """Verify the compact HMAC grant format without exposing grant detail to callers."""

    if not secret or len(secret.encode("utf-8")) < 32:
        raise ValueError("password reset grant secret is invalid")
    try:
        payload_part, signature_part = token.split(".")
        payload_bytes = _base64url_decode(payload_part)
        signature = _base64url_decode(signature_part)
        expected_signature = hmac.new(
            secret.encode("utf-8"), payload_part.encode("ascii"), sha256
        ).digest()
        if len(signature) != len(expected_signature) or not hmac.compare_digest(
            signature, expected_signature
        ):
            raise ValueError("invalid signature")
        decoded = json.loads(payload_bytes)
        if not isinstance(decoded, dict) or set(decoded) != _REQUIRED_FIELDS:
            raise ValueError("invalid payload")
        payload = dict(decoded)
        if _base64url_encode(_canonical_payload(payload)) != payload_part:
            raise ValueError("noncanonical payload")
        version = payload["v"]
        expires_at = payload["exp"]
        purpose = payload["purpose"]
        jti = payload["jti"]
        subject = payload["sub"]
        session_id = payload["sid"]
        if (
            type(version) is not int
            or version != PASSWORD_RESET_GRANT_VERSION
            or type(expires_at) is not int
            or not isinstance(purpose, str)
            or purpose not in {"invite", "recovery"}
            or not isinstance(jti, str)
            or not 22 <= len(jti) <= 86
            or not set(jti).issubset(_BASE64URL_CHARACTERS)
            or not isinstance(subject, str)
            or not isinstance(session_id, str)
        ):
            raise ValueError("invalid grant fields")
        current_time = int(time.time()) if now is None else now
        if (
            expires_at <= current_time
            or expires_at > current_time + PASSWORD_RESET_GRANT_MAX_AGE_SECONDS
        ):
            raise ValueError("expired grant")
        return PasswordResetGrant(
            subject=UUID(subject),
            session_id=UUID(session_id),
            purpose=purpose,
            jti=jti,
            expires_at=expires_at,
        )
    except (TypeError, ValueError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise AppError(
            "Password reset confirmation is invalid or expired.", status_code=401
        ) from exc


def password_reset_grant_replay_key(grant: PasswordResetGrant, secret: str) -> str:
    material = (
        f"password-reset-grant:v1:{grant.purpose}:{grant.jti}:"
        f"{grant.subject}:{grant.session_id}"
    )
    digest = hmac.new(secret.encode("utf-8"), material.encode("utf-8"), sha256).hexdigest()
    return f"peii:password-reset-grant:{grant.purpose}:{digest}"


async def consume_password_reset_grant(
    grant: PasswordResetGrant,
    redis_client: PasswordResetGrantRedis | None,
    secret: str,
    *,
    now: int | None = None,
) -> None:
    """Atomically mark a valid grant used; unavailability fails closed before mutation."""

    if redis_client is None:
        raise AppError("Password reset is temporarily unavailable.", status_code=503)
    current_time = int(time.time()) if now is None else now
    ttl_seconds = grant.expires_at - current_time
    if ttl_seconds <= 0:
        raise AppError("Password reset confirmation is invalid or expired.", status_code=401)
    try:
        result = await redis_client.set(
            password_reset_grant_replay_key(grant, secret),
            "1",
            ex=ttl_seconds,
            nx=True,
        )
    except Exception as exc:
        raise AppError("Password reset is temporarily unavailable.", status_code=503) from exc
    if result is not True and str(result).upper() != "OK":
        raise AppError("Password reset confirmation is invalid or expired.", status_code=401)
