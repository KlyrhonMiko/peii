"""Shared Redis response cache for read-hot portal endpoints.

Browsers/CDNs stay ``private, no-store`` (privacy); this server-side cache only
saves recompute and DB load. All helpers are fail-open: Redis errors, a missing
client, ``CACHE_ENABLED=false``, or a non-positive TTL degrade to a cache miss
without raising.
"""

from __future__ import annotations

import json
from typing import Any

import structlog

from core.config import settings

logger = structlog.get_logger(__name__)

_NAMESPACE_TTLS = {
    "peii": "CACHE_TTL_PEII_SECONDS",
    "aggregates": "CACHE_TTL_AGGREGATES_SECONDS",
    "surveys": "CACHE_TTL_SURVEYS_SECONDS",
    "users": "CACHE_TTL_USERS_SECONDS",
    "rbac": "CACHE_TTL_RBAC_SECONDS",
}


def build_cache_key(*parts: object) -> str:
    """Join key parts with ':' after sanitizing separators and empties."""
    cleaned: list[str] = []
    for part in parts:
        text = "" if part is None else str(part).strip()
        if not text:
            cleaned.append("_")
            continue
        text = text.replace(":", "-").replace("|", "-").replace(" ", "-")
        cleaned.append(text)
    return ":".join(cleaned) if cleaned else "_"


def get_cache_ttl(namespace: str) -> int:
    """Return the configured TTL for a cache namespace (0 disables)."""
    attr = _NAMESPACE_TTLS.get(namespace)
    if attr is None:
        return 0
    try:
        return int(getattr(settings, attr))
    except (AttributeError, TypeError, ValueError):
        return 0


def _full_key(namespace: str, key: str) -> str:
    prefix = settings.CACHE_PREFIX.rstrip(":")
    return f"{prefix}:{namespace}:{key}"


def _get_client() -> Any | None:
    try:
        from core.rate_limit import get_redis_client

        return get_redis_client()
    except Exception:  # pragma: no cover - import-time safety
        return None


def _is_cacheable() -> bool:
    try:
        return bool(settings.CACHE_ENABLED)
    except Exception:  # pragma: no cover - settings safety
        return False


async def cache_get(namespace: str, key: str) -> Any | None:
    """Return the deserialized cached value, or None on miss/disabled/error."""
    if not _is_cacheable():
        return None
    if get_cache_ttl(namespace) <= 0:
        return None
    client = _get_client()
    if client is None:
        return None
    full_key = _full_key(namespace, key)
    try:
        raw = await client.get(full_key)
    except Exception as exc:
        logger.warning("cache_get_failed", namespace=namespace, error=str(exc))
        return None
    if raw is None:
        return None
    try:
        text = raw.decode("utf-8") if isinstance(raw, (bytes, bytearray)) else str(raw)
        return json.loads(text)
    except Exception as exc:
        logger.warning("cache_decode_failed", namespace=namespace, error=str(exc))
        return None


async def cache_set(
    namespace: str, key: str, value: Any, ttl_seconds: int | None = None
) -> None:
    """Store a JSON-serializable value; no-op on disabled/error."""
    ttl = get_cache_ttl(namespace) if ttl_seconds is None else int(ttl_seconds)
    if not _is_cacheable() or ttl <= 0:
        return
    client = _get_client()
    if client is None:
        return
    full_key = _full_key(namespace, key)
    try:
        payload = json.dumps(value, separators=(",", ":"), allow_nan=False)
    except Exception as exc:
        logger.warning("cache_encode_failed", namespace=namespace, error=str(exc))
        return
    try:
        await client.setex(full_key, int(ttl), payload)
    except Exception as exc:
        logger.warning("cache_set_failed", namespace=namespace, error=str(exc))
        return


async def cache_invalidate_prefix(namespace: str, prefix: str = "") -> None:
    """Delete keys under ``{prefix}:{namespace}:{prefix}*``; no-op on disabled/error."""
    if not _is_cacheable():
        return
    client = _get_client()
    if client is None:
        return
    base = settings.CACHE_PREFIX.rstrip(":")
    pattern = f"{base}:{namespace}:{prefix}*" if prefix else f"{base}:{namespace}:*"
    try:
        cursor = 0
        while True:
            if hasattr(client, "scan"):
                cursor, keys = await client.scan(cursor=cursor, match=pattern, count=200)
            else:  # pragma: no cover - unknown client shape
                return
            if keys:
                str_keys = [
                    k.decode("utf-8") if isinstance(k, (bytes, bytearray)) else str(k)
                    for k in keys
                ]
                try:
                    await client.unlink(*str_keys)
                except Exception:
                    # DEL fallback for clients without UNLINK.
                    for single in str_keys:
                        try:
                            await client.delete(single)
                        except Exception as exc:
                            logger.warning(
                                "cache_delete_failed", namespace=namespace, error=str(exc)
                            )
                            break
            if not cursor:
                break
    except Exception as exc:
        logger.warning("cache_invalidate_failed", namespace=namespace, error=str(exc))
        return
