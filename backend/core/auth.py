import asyncio
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
        return AuthClaims(subject=UUID(claims["sub"]), access_token=access_token)
    except (jwt.PyJWTError, KeyError, ValueError) as exc:
        logger.warning("jwt_verification_failed", error_type=type(exc).__name__)
        raise AppError("Authentication required.", status_code=401) from exc
