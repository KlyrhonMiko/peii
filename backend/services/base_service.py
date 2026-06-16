from datetime import datetime, timezone


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def apply_updates(instance: object, updates: dict[str, object]) -> object:
    for field, value in updates.items():
        setattr(instance, field, value)
    if hasattr(instance, "updated_at"):
        setattr(instance, "updated_at", utc_now())
    return instance
