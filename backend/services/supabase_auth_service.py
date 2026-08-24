from typing import Any
from uuid import UUID

import httpx

from core.config import settings
from core.exceptions import AppError


def _headers(secret: bool = False) -> dict[str, str]:
    key = settings.SUPABASE_SECRET_KEY if secret else settings.SUPABASE_PUBLISHABLE_KEY
    return {"apikey": key, "Authorization": f"Bearer {key}"}


def _auth_url(path: str) -> str:
    return f"{settings.SUPABASE_URL}/auth/v1{path}"


async def password_login(email: str, password: str) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.post(
            _auth_url("/token?grant_type=password"),
            headers=_headers(),
            json={"email": email, "password": password},
        )
    if response.status_code != 200:
        raise AppError("Invalid credentials.", status_code=401)
    return response.json()


async def invite_user(email: str, redirect_to: str) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.post(
            _auth_url("/invite"),
            headers={**_headers(secret=True), "Content-Type": "application/json"},
            params={"redirect_to": redirect_to},
            json={"email": email},
        )
    if response.status_code not in {200, 201}:
        raise AppError("Unable to send invitation.", status_code=502)
    return response.json()


async def get_auth_user_by_email(email: str) -> dict[str, Any] | None:
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(
            _auth_url("/admin/users?page=1&per_page=1000"),
            headers=_headers(secret=True),
        )
    if response.status_code != 200:
        raise AppError("Unable to read Supabase users.", status_code=502)
    users = response.json().get("users", [])
    return next(
        (user for user in users if user.get("email", "").lower() == email.lower()),
        None,
    )


async def send_recovery_email(email: str, redirect_to: str) -> None:
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.post(
            _auth_url("/recover"),
            headers={**_headers(), "Content-Type": "application/json"},
            params={"redirect_to": redirect_to},
            json={"email": email},
        )
    if response.status_code not in {200, 204}:
        raise AppError("Unable to send recovery email.", status_code=502)


async def revoke_user_sessions(auth_user_id: UUID | str) -> None:
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.post(
            _auth_url(f"/admin/users/{auth_user_id}/logout"),
            headers={**_headers(secret=True), "Content-Type": "application/json"},
            json={"scope": "global"},
        )
    if response.status_code not in {200, 204}:
        raise AppError("Unable to revoke user sessions.", status_code=502)


async def logout_user_session(access_token: str) -> None:
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.post(
            _auth_url("/logout"),
            headers={
                "apikey": settings.SUPABASE_PUBLISHABLE_KEY,
                "Authorization": f"Bearer {access_token}",
            },
        )
    if response.status_code not in {200, 204}:
        raise AppError("Unable to log out.", status_code=502)


async def update_password(access_token: str, password: str) -> None:
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.put(
            _auth_url("/user"),
            headers={
                "apikey": settings.SUPABASE_PUBLISHABLE_KEY,
                "Authorization": f"Bearer {access_token}",
            },
            json={"password": password},
        )
    if response.status_code != 200:
        raise AppError("Unable to update password.", status_code=502)
