"""Process-wide shared HTTP client for external service calls.

A single :class:`httpx.AsyncClient` pools connections for Supabase Auth and
Google token/userinfo calls instead of opening a new TCP+TLS connection per
request. The client is created lazily on first use and closed during
application shutdown through :func:`close_http_client`.
"""

import threading

import httpx

DEFAULT_HTTP_TIMEOUT_SECONDS = 10.0

_client: httpx.AsyncClient | None = None
_create_lock = threading.Lock()


def get_http_client() -> httpx.AsyncClient:
    """Return the shared HTTP client, creating it on first use.

    Creation is guarded by a lock so concurrent first calls cannot leak a
    second client. Guarding is non-blocking here: client construction does not
    await, so holding a threading lock briefly is safe in async contexts.
    """
    global _client
    if _client is None:
        with _create_lock:
            if _client is None:
                _client = httpx.AsyncClient(timeout=DEFAULT_HTTP_TIMEOUT_SECONDS)
    return _client


async def close_http_client() -> None:
    """Close the shared HTTP client and release pooled connections."""
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None
