from dataclasses import dataclass
from uuid import UUID

import jwt
from fastapi import Header
from jwt import PyJWKClient

from core.config import settings
from core.exceptions import AppError


@dataclass(frozen=True)
class AuthClaims:
    subject: UUID
    access_token: str


def _jwks_client() -> PyJWKClient:
    if settings.SUPABASE_URL is None:
        raise AppError("Supabase authentication is not configured.", status_code=503)
    return PyJWKClient(f"{settings.SUPABASE_URL}/auth/v1/.well-known/jwks.json")


async def verify_bearer_token(authorization: str | None = Header(default=None)) -> AuthClaims:
    if not authorization or not authorization.startswith("Bearer "):
        raise AppError("Authentication required.", status_code=401)
    access_token = authorization.removeprefix("Bearer ").strip()
    try:
        signing_key = _jwks_client().get_signing_key_from_jwt(access_token)
        claims = jwt.decode(
            access_token,
            signing_key.key,
            algorithms=["RS256", "ES256"],
            issuer=f"{settings.SUPABASE_URL}/auth/v1",
            audience="authenticated",
        )
        return AuthClaims(subject=UUID(claims["sub"]), access_token=access_token)
    except (jwt.PyJWTError, KeyError, ValueError) as exc:
        raise AppError("Authentication required.", status_code=401) from exc
