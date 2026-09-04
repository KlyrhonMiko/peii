"""Short-TTL in-process cache for survey analytics (PEII + aggregates).

Read-hot computed results are cached per survey so repeated dashboard polls do not
re-run the heavy aggregation. Every mutation that changes the underlying responses
(submit, phase 2, withdraw, erase, false-positive marking, ML sentiment refresh, and
retention purge) invalidates the affected survey's entries via
``invalidate_survey_analytics``.
"""

from __future__ import annotations

import time
from uuid import UUID

from core.config import settings

_CACHE: dict[tuple[str, ...], tuple[float, object]] = {}


def get_analytics_cached(key: tuple[str, ...]) -> object | None:
    entry = _CACHE.get(key)
    if entry is None:
        return None
    expires_at, value = entry
    if expires_at <= time.monotonic():
        del _CACHE[key]
        return None
    return value


def set_analytics_cached(key: tuple[str, ...], value: object) -> None:
    ttl = settings.ANALYTICS_CACHE_TTL_SECONDS
    if ttl <= 0:
        return
    _CACHE[key] = (time.monotonic() + ttl, value)


def invalidate_survey_analytics(survey_id: UUID | str) -> None:
    """Drop every cached analytics entry for one survey."""
    survey_key = str(survey_id)
    stale = [key for key in _CACHE if len(key) > 1 and key[1] == survey_key]
    for key in stale:
        del _CACHE[key]


def invalidate_analytics_cache() -> None:
    _CACHE.clear()


async def ainvalidate_survey_analytics(survey_id: UUID | str) -> None:
    """Drop L1 entries and shared Redis PEII/aggregate entries for one survey."""
    invalidate_survey_analytics(survey_id)
    try:
        from core.cache import build_cache_key, cache_invalidate_prefix

        prefix = build_cache_key(survey_id)
        await cache_invalidate_prefix("peii", prefix)
        await cache_invalidate_prefix("aggregates", prefix)
    except Exception:
        return
