def normalize_pagination(skip: int = 0, limit: int = 100, max_limit: int = 100) -> tuple[int, int]:
    safe_skip = max(skip, 0)
    safe_limit = min(max(limit, 1), max_limit)
    return safe_skip, safe_limit
