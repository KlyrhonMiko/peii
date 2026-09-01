import asyncio
from collections.abc import Mapping
from dataclasses import dataclass
from functools import lru_cache
from uuid import UUID

import jwt
from fastapi import Header
from jwt import PyJWKClient

from core.config import settings
from core.exceptions import AppError
from core.logging import get_logger

logger = get_logger(__name__)


@dataclass(frozen=True)
class AuthClaims:
    subject: UUID
    access_token: str
    session_id: UUID | None = None
    amr: tuple[str, ...] = ()
    email: str | None = None
    is_anonymous: bool | None = None
    app_metadata: dict[str, object] | None = None

    @property
    def has_oauth_amr(self) -> bool:
        return "oauth" in self.amr


@lru_cache(maxsize=1)
def _jwks_client() -> PyJWKClient:
    return PyJWKClient(f"{settings.SUPABASE_URL}/auth/v1/.well-known/jwks.json")


async def verify_bearer_token(authorization: str | None = Header(default=None)) -> AuthClaims:
    if not authorization or not authorization.startswith("Bearer "):
        raise AppError("Authentication required.", status_code=401)
    access_token = authorization.removeprefix("Bearer ").strip()
    try:
        signing_key = await asyncio.to_thread(_jwks_client().get_signing_key_from_jwt, access_token)
        claims = jwt.decode(
            access_token,
            signing_key.key,
            algorithms=["RS256", "ES256"],
            issuer=f"{settings.SUPABASE_URL}/auth/v1",
            audience="authenticated",
            leeway=60,
        )
        if not isinstance(claims, Mapping):
            raise TypeError("JWT claims must be an object")
        return AuthClaims(
            subject=_required_uuid_claim(claims, "sub"),
            access_token=access_token,
            session_id=_optional_uuid_claim(claims, "session_id"),
            amr=_optional_amr_claim(claims.get("amr")),
            email=_optional_string_claim(claims.get("email"), "email"),
            is_anonymous=_optional_bool_claim(claims.get("is_anonymous"), "is_anonymous"),
            app_metadata=_optional_metadata_claim(claims.get("app_metadata")),
        )
    except (jwt.PyJWTError, KeyError, TypeError, ValueError) as exc:
        logger.warning("jwt_verification_failed", error_type=type(exc).__name__)
        raise AppError("Authentication required.", status_code=401) from exc


def _required_uuid_claim(claims: Mapping[str, object], name: str) -> UUID:
    value = claims[name]
    if not isinstance(value, str) or not value:
        raise TypeError(f"{name} must be a UUID string")
    return UUID(value)


def _optional_uuid_claim(claims: Mapping[str, object], name: str) -> UUID | None:
    if name not in claims or claims[name] is None:
        return None
    return _required_uuid_claim(claims, name)


def _optional_amr_claim(value: object) -> tuple[str, ...]:
    if value is None:
        return ()
    if not isinstance(value, list):
        raise TypeError("amr must be a list")

    methods: list[str] = []
    for entry in value:
        if isinstance(entry, str):
            method_value: object = entry
        elif isinstance(entry, Mapping):
            method_value = entry.get("method")
        else:
            raise TypeError("amr entries must be strings or objects")
        if not isinstance(method_value, str):
            raise TypeError("amr entries must contain a method")
        method = method_value
        method = method.strip().casefold()
        if not method:
            raise ValueError("amr entries must not be empty")
        methods.append(method)
    return tuple(methods)


def _optional_string_claim(value: object, name: str) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str) or not value.strip():
        raise TypeError(f"{name} must be a non-empty string")
    return value


def _optional_bool_claim(value: object, name: str) -> bool | None:
    if value is None:
        return None
    if type(value) is not bool:
        raise TypeError(f"{name} must be a boolean")
    return value


def _optional_metadata_claim(value: object) -> dict[str, object] | None:
    if value is None:
        return None
    if not isinstance(value, Mapping) or not all(isinstance(key, str) for key in value):
        raise TypeError("app_metadata must be an object with string keys")
    return dict(value)
