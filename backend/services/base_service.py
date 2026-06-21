from datetime import UTC, datetime


def utc_now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def apply_updates(instance: object, updates: dict[str, object]) -> object:
    for field, value in updates.items():
        setattr(instance, field, value)
    if hasattr(instance, "updated_at"):
        setattr(instance, "updated_at", utc_now())
    return instance
