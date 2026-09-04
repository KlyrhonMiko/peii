"""Supabase Storage helpers for prepared CSV export artifacts.

The export pipeline generates the CSV on the backend, uploads it to a private
Storage bucket, and returns a short-lived signed URL. Callers own the
bounded-duration database work; the actual download is served by Storage.
"""

from typing import BinaryIO

from core.config import settings
from core.exceptions import AppError
from core.http_client import get_http_client


def _headers() -> dict[str, str]:
    key = settings.SUPABASE_SECRET_KEY
    return {"apikey": key, "Authorization": f"Bearer {key}"}


def _storage_url(path: str) -> str:
    return f"{settings.SUPABASE_URL}/storage/v1{path}"


def _object_path(survey_id: str, export_id: str) -> str:
    return f"{survey_id}/{export_id}.csv"


async def upload_export_artifact(
    object_path: str,
    filename: str,
    content: BinaryIO,
    *,
    content_type: str = "text/csv",
) -> None:
    client = get_http_client()
    response = await client.post(
        _storage_url(f"/object/{settings.EXPORT_STORAGE_BUCKET}/{object_path}"),
        headers={**_headers(), "Cache-Control": "no-store"},
        files={
            "file": (
                filename,
                content,
                content_type,
            )
        },
    )
    if response.status_code != 200:
        raise AppError("Export artifact upload failed.", status_code=502)


async def create_signed_export_url(object_path: str) -> str:
    client = get_http_client()
    response = await client.post(
        _storage_url(f"/object/sign/{settings.EXPORT_STORAGE_BUCKET}/{object_path}"),
        headers=_headers(),
        json={"expiresIn": settings.EXPORT_SIGNED_URL_TTL_SECONDS},
    )
    if response.status_code != 200:
        raise AppError("Export artifact signing failed.", status_code=502)
    payload = response.json()
    signed_url = payload.get("signedURL")
    if not isinstance(signed_url, str) or not signed_url:
        raise AppError("Export artifact signing failed.", status_code=502)
    # The sign endpoint returns a tenant-relative path ("/object/sign/..."); the
    # browser must navigate to an absolute URL, so prefix it here. Absolute URLs
    # (if a future Storage version returns them) pass through unchanged.
    if signed_url.startswith("http://") or signed_url.startswith("https://"):
        return signed_url
    return f"{settings.SUPABASE_URL}/storage/v1{signed_url}"
