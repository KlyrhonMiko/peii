from collections.abc import Collection

RESPONSE_COUNT_PRIVACY_THRESHOLD = 5

EXACT_RESPONSE_COUNT_CAPABILITIES = frozenset(
    {
        "survey_responses.read_raw",
        "survey_responses.export",
        "survey_responses.erase",
    }
)


def has_exact_response_count_capability(permissions: Collection[str]) -> bool:
    return bool(EXACT_RESPONSE_COUNT_CAPABILITIES.intersection(permissions))


def project_response_count(count: int, permissions: Collection[str]) -> int | None:
    if has_exact_response_count_capability(permissions):
        return count
    if (
        "survey_responses.read_aggregates" in permissions
        and count >= RESPONSE_COUNT_PRIVACY_THRESHOLD
    ):
        return count
    return None
