from collections.abc import Mapping
from typing import Any, Literal
from uuid import UUID

import httpx

from core.config import settings
from core.exceptions import AppError
from core.http_client import get_http_client


def _headers(secret: bool = False) -> dict[str, str]:
    key = settings.SUPABASE_SECRET_KEY if secret else settings.SUPABASE_PUBLISHABLE_KEY
    return {"apikey": key, "Authorization": f"Bearer {key}"}


def _auth_url(path: str) -> str:
    return f"{settings.SUPABASE_URL}/auth/v1{path}"


MFA_REQUIRED_ERROR_CODE = "mfa_required"
MFA_CHECK_UNAVAILABLE_ERROR_CODE = "mfa_check_unavailable"


def _mfa_check_unavailable() -> AppError:
    """Return a safe, stable error for an unavailable or invalid factor response."""
    return AppError(
        "Unable to verify multi-factor authentication status.",
        status_code=503,
        errors={"code": MFA_CHECK_UNAVAILABLE_ERROR_CODE},
    )


def _has_verified_factor(payload: object) -> bool:
    """Validate the Auth `/user` shape and detect any verified factor.

    Treat every verified factor type as requiring AAL2. That prevents a factor type
    PEII does not yet render from silently weakening the portal boundary.
    Supabase omits `factors` entirely when the authenticated user has none.
    """
    if not isinstance(payload, Mapping):
        raise ValueError("Supabase Auth user response must be an object")
    user_id = payload.get("id")
    if not isinstance(user_id, str):
        raise ValueError("Supabase Auth user response id must be a UUID")
    try:
        UUID(user_id)
    except ValueError as exc:
        raise ValueError("Supabase Auth user response id must be a UUID") from exc

    factors = payload.get("factors", [])
    if not isinstance(factors, list):
        raise ValueError("Supabase Auth user response factors must be a list")

    for factor in factors:
        if not isinstance(factor, Mapping):
            raise ValueError("Supabase Auth factor must be an object")
        factor_type = factor.get("factor_type")
        status = factor.get("status")
        if (
            not isinstance(factor_type, str)
            or not factor_type.strip()
            or not isinstance(status, str)
            or not status.strip()
        ):
            raise ValueError("Supabase Auth factor has an invalid shape")
        if status == "verified":
            return True
        if status != "unverified":
            raise ValueError("Supabase Auth factor has an unknown status")
    return False


async def has_verified_mfa_factor(access_token: str) -> bool:
    """Read the caller's current MFA factor state from Supabase Auth.

    This intentionally performs no caching: a newly enrolled factor must not be
    hidden by a stale negative result, and the bearer token remains caller-bound.
    """
    client = get_http_client()
    try:
        response = await client.get(
            _auth_url("/user"),
            headers={
                "apikey": settings.SUPABASE_PUBLISHABLE_KEY,
                "Authorization": f"Bearer {access_token}",
            },
        )
    except httpx.HTTPError as exc:
        raise _mfa_check_unavailable() from exc
    if response.status_code != 200:
        raise _mfa_check_unavailable()
    try:
        payload = response.json()
        return _has_verified_factor(payload)
    except (TypeError, ValueError) as exc:
        raise _mfa_check_unavailable() from exc


async def password_login(email: str, password: str) -> dict[str, Any]:
    client = get_http_client()
    response = await client.post(
        _auth_url("/token?grant_type=password"),
        headers=_headers(),
        json={"email": email, "password": password},
    )
    if response.status_code != 200:
        raise AppError("Invalid credentials.", status_code=401)
    return response.json()


_ADMIN_USERS_PAGE_SIZE = 1000
_ADMIN_USERS_MAX_PAGES = 50
LogoutScope = Literal["global", "local", "others"]
_LOGOUT_SCOPES = frozenset({"global", "local", "others"})


class LogoutUserSessionError(AppError):
    def __init__(self, *, retryable: bool) -> None:
        self.retryable = retryable
        super().__init__("Unable to log out.", status_code=502)


async def invite_user(email: str, redirect_to: str) -> dict[str, Any]:
    client = get_http_client()
    response = await client.post(
        _auth_url("/invite"),
        headers={**_headers(secret=True), "Content-Type": "application/json"},
        params={"redirect_to": redirect_to},
        json={"email": email},
    )
    if response.status_code not in {200, 201}:
        detail = ""
        try:
            body = response.json()
            detail = str(body.get("message", body.get("error_description", "")))
        except ValueError:
            detail = response.text or ""
        lowered = detail.casefold()
        is_duplicate = response.status_code in {400, 409, 422} and (
            "already" in lowered or "exists" in lowered
        )
        if is_duplicate:
            raise AppError(
                "Auth user already exists.",
                status_code=409,
                errors=[detail] if detail else None,
            )
        raise AppError("Unable to send invitation.", status_code=502)
    return response.json()


async def get_auth_user_by_email(email: str) -> dict[str, Any] | None:
    normalized = email.strip().casefold()
    client = get_http_client()
    for page in range(1, _ADMIN_USERS_MAX_PAGES + 1):
        response = await client.get(
            _auth_url("/admin/users"),
            headers=_headers(secret=True),
            params={"page": page, "per_page": _ADMIN_USERS_PAGE_SIZE},
        )
        if response.status_code != 200:
            raise AppError("Unable to read Supabase users.", status_code=502)
        users = response.json().get("users", [])
        for user in users:
            if user.get("email", "").strip().casefold() == normalized:
                return user
        if len(users) < _ADMIN_USERS_PAGE_SIZE:
            break
    return None


async def send_recovery_email(email: str, redirect_to: str) -> None:
    client = get_http_client()
    response = await client.post(
        _auth_url("/recover"),
        headers={**_headers(), "Content-Type": "application/json"},
        params={"redirect_to": redirect_to},
        json={"email": email},
    )
    if response.status_code not in {200, 204}:
        raise AppError("Unable to send recovery email.", status_code=502)


async def revoke_user_sessions(auth_user_id: UUID | str) -> None:
    client = get_http_client()
    response = await client.post(
        _auth_url(f"/admin/users/{auth_user_id}/logout"),
        headers={**_headers(secret=True), "Content-Type": "application/json"},
        json={"scope": "global"},
    )
    if response.status_code not in {200, 204}:
        raise AppError("Unable to revoke user sessions.", status_code=502)


async def logout_user_session(access_token: str, scope: LogoutScope) -> None:
    if scope not in _LOGOUT_SCOPES:
        raise ValueError("Invalid logout scope.")
    client = get_http_client()
    try:
        response = await client.post(
            _auth_url("/logout"),
            headers={
                "apikey": settings.SUPABASE_PUBLISHABLE_KEY,
                "Authorization": f"Bearer {access_token}",
            },
            params={"scope": scope},
        )
    except httpx.TransportError as exc:
        raise LogoutUserSessionError(retryable=True) from exc
    if response.status_code not in {200, 204}:
        raise LogoutUserSessionError(retryable=response.status_code >= 500)


def _safe_password_provider_error(response: Any) -> AppError:
    code = ""
    try:
        payload = response.json()
        if isinstance(payload, dict):
            code = str(
                payload.get("code")
                or payload.get("error_code")
                or payload.get("error")
                or payload.get("message")
                or payload.get("error_description")
                or ""
            ).casefold()
    except (TypeError, ValueError):
        pass
    if response.status_code == 429:
        return AppError("Please wait before trying again.", status_code=429)
    if "aal" in code or "insufficient" in code:
        return AppError("Additional authentication is required.", status_code=403)
    if "reauth" in code or "nonce" in code or "expired" in code or "invalid" in code:
        return AppError("Password reauthentication is required.", status_code=400)
    if code in {"weak_password", "same_password"}:
        return AppError("Password does not meet the security requirements.", status_code=400)
    return AppError("Unable to update password.", status_code=502)


async def request_password_reauthentication(access_token: str) -> None:
    client = get_http_client()
    response = await client.get(
        _auth_url("/reauthenticate"),
        headers={
            "apikey": settings.SUPABASE_PUBLISHABLE_KEY,
            "Authorization": f"Bearer {access_token}",
        },
    )
    if response.status_code not in {200, 204}:
        raise _safe_password_provider_error(response)


async def update_password(access_token: str, password: str, nonce: str | None = None) -> None:
    client = get_http_client()
    payload: dict[str, str] = {"password": password}
    if nonce is not None:
        payload["nonce"] = nonce
    response = await client.put(
        _auth_url("/user"),
        headers={
            "apikey": settings.SUPABASE_PUBLISHABLE_KEY,
            "Authorization": f"Bearer {access_token}",
        },
        json=payload,
    )
    if response.status_code != 200:
        raise _safe_password_provider_error(response)
