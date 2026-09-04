"""Unit tests for Supabase Storage export artifact helpers.

The Storage sign endpoint returns a tenant-relative path; the browser must
navigate to an absolute URL, so `create_signed_export_url` prefixes relative
values with the Storage base URL.
"""

import pytest

from services import export_storage_service

pytestmark = pytest.mark.anyio


class _FakeResponse:
    def __init__(self, status_code: int, payload: dict) -> None:
        self.status_code = status_code
        self._payload = payload

    def json(self) -> dict:
        return self._payload


class _FakeClient:
    def __init__(self, response: _FakeResponse) -> None:
        self._response = response
        self.posts: list[tuple[str, dict]] = []

    async def post(self, url: str, **kwargs: object) -> _FakeResponse:
        self.posts.append((url, kwargs))
        return self._response


def _patch_client(monkeypatch: pytest.MonkeyPatch, response: _FakeResponse) -> _FakeClient:
    client = _FakeClient(response)
    monkeypatch.setattr(export_storage_service, "get_http_client", lambda: client)
    return client


async def test_relative_signed_url_is_prefixed_with_storage_base(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _patch_client(monkeypatch, _FakeResponse(200, {"signedURL": "/object/sign/b/o.csv?token=abc"}))
    url = await export_storage_service.create_signed_export_url("o.csv")
    assert url.startswith("https://")
    assert url.endswith("/object/sign/b/o.csv?token=abc")


async def test_absolute_signed_url_passes_through_unchanged(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    absolute = "https://example.test/storage/v1/object/sign/b/o.csv?token=abc"
    _patch_client(monkeypatch, _FakeResponse(200, {"signedURL": absolute}))
    assert await export_storage_service.create_signed_export_url("o.csv") == absolute
