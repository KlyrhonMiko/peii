from uuid import UUID

from core.analytics_cache import (
    get_analytics_cached,
    invalidate_analytics_cache,
    invalidate_survey_analytics,
    set_analytics_cached,
)
from core.config import settings

SURVEY_ID = UUID("00000000-0000-0000-0000-000000000001")
OTHER_SURVEY_ID = UUID("00000000-0000-0000-0000-000000000002")
PEII_KEY = ("peii", str(SURVEY_ID), "2024", "Engineering")
AGGREGATE_KEY = ("aggregates", str(SURVEY_ID))


def _reset() -> None:
    invalidate_analytics_cache()


def test_cache_hit_returns_stored_value(monkeypatch) -> None:
    _reset()
    monkeypatch.setattr(settings, "ANALYTICS_CACHE_TTL_SECONDS", 60)
    set_analytics_cached(PEII_KEY, {"score": 1})
    assert get_analytics_cached(PEII_KEY) == {"score": 1}


def test_invalidate_survey_drops_only_that_survey(monkeypatch) -> None:
    _reset()
    monkeypatch.setattr(settings, "ANALYTICS_CACHE_TTL_SECONDS", 60)
    set_analytics_cached(PEII_KEY, {"score": 1})
    set_analytics_cached(AGGREGATE_KEY, [{"count": 3}])
    set_analytics_cached(("peii", str(OTHER_SURVEY_ID), "2024", ""), {"score": 2})
    invalidate_survey_analytics(SURVEY_ID)
    assert get_analytics_cached(PEII_KEY) is None
    assert get_analytics_cached(AGGREGATE_KEY) is None
    assert get_analytics_cached(("peii", str(OTHER_SURVEY_ID), "2024", "")) == {"score": 2}


def test_zero_ttl_disables_cache(monkeypatch) -> None:
    _reset()
    monkeypatch.setattr(settings, "ANALYTICS_CACHE_TTL_SECONDS", 0)
    set_analytics_cached(PEII_KEY, {"score": 1})
    assert get_analytics_cached(PEII_KEY) is None


def test_ttl_expiry_evicts(monkeypatch) -> None:
    _reset()
    monkeypatch.setattr(settings, "ANALYTICS_CACHE_TTL_SECONDS", 1)
    import core.analytics_cache as module

    clock = {"now": 100.0}
    monkeypatch.setattr(module.time, "monotonic", lambda: clock["now"])
    set_analytics_cached(PEII_KEY, {"score": 1})
    assert get_analytics_cached(PEII_KEY) == {"score": 1}
    clock["now"] = 200.0
    assert get_analytics_cached(PEII_KEY) is None
