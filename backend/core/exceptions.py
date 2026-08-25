from typing import Any


class AppError(Exception):
    def __init__(
        self,
        message: str,
        status_code: int = 400,
        errors: Any | None = None,
    ) -> None:
        self.message = message
        self.status_code = status_code
        self.errors = errors
        super().__init__(message)


class RateLimitExceeded(AppError):
    def __init__(self, retry_after: int) -> None:
        self.retry_after = max(1, retry_after)
        super().__init__("Too many requests. Please try again later.", status_code=429)


class RedisUnavailableError(AppError):
    def __init__(self) -> None:
        super().__init__("Traffic security is temporarily unavailable.", status_code=503)


class RequestTooLargeError(BaseException):
    """Internal ASGI signal that bypasses FastAPI's body-parser exception wrapping."""
