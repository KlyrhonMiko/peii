import json
from typing import Any

from starlette.datastructures import Headers, MutableHeaders
from starlette.types import ASGIApp, Receive, Scope, Send
from uuid6 import uuid7

from core.context import request_id_ctx
from core.exceptions import RequestTooLargeError
from core.responses import error_response


class RequestIdMiddleware:
    def __init__(self, app: ASGIApp, path_prefix: str | None = None) -> None:
        self.app = app
        self.path_prefix = path_prefix.rstrip("/") if path_prefix else None

    def _requires_server_request_id(self, scope: Scope) -> bool:
        if self.path_prefix is None:
            return False
        path = scope.get("path", "")
        return path == self.path_prefix or path.startswith(f"{self.path_prefix}/")

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] not in ("http", "websocket"):
            await self.app(scope, receive, send)
            return

        headers = Headers(scope=scope)
        request_id = headers.get("X-Request-ID")
        if not request_id or self._requires_server_request_id(scope):
            request_id = uuid7().hex

        token = request_id_ctx.set(request_id)

        async def send_wrapper(message: Any) -> None:
            if message["type"] == "http.response.start":
                headers_list = message.setdefault("headers", [])
                headers_list.append((b"x-request-id", request_id.encode("utf-8")))
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            request_id_ctx.reset(token)


def get_request_id() -> str | None:
    """Helper function to retrieve the current request ID."""
    return request_id_ctx.get()


class RequestSizeLimitMiddleware:
    """Reject oversized bodies before FastAPI/Pydantic parses them."""

    def __init__(self, app: ASGIApp, max_body_bytes: int) -> None:
        self.app = app
        self.max_body_bytes = max_body_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        content_length = Headers(scope=scope).get("content-length")
        if content_length is not None:
            try:
                declared_length = int(content_length)
            except ValueError:
                declared_length = 0
            if declared_length > self.max_body_bytes:
                await self._send_too_large(send)
                return

        received_bytes = 0
        response_started = False

        async def send_wrapper(message: Any) -> None:
            nonlocal response_started
            if message["type"] == "http.response.start":
                response_started = True
            await send(message)

        async def receive_wrapper() -> Any:
            nonlocal received_bytes
            message = await receive()
            if message["type"] == "http.request":
                received_bytes += len(message.get("body", b""))
                if received_bytes > self.max_body_bytes:
                    raise RequestTooLargeError()
            return message

        try:
            await self.app(scope, receive_wrapper, send_wrapper)
        except RequestTooLargeError:
            if not response_started:
                await self._send_too_large(send)

    async def _send_too_large(self, send: Send) -> None:
        payload = error_response("Request body is too large.")
        body = json.dumps(payload).encode("utf-8")
        await send(
            {
                "type": "http.response.start",
                "status": 413,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"content-length", str(len(body)).encode("ascii")),
                ],
            }
        )
        await send({"type": "http.response.body", "body": body})


class SecurityHeadersMiddleware:
    """Apply baseline browser security headers without weakening route-specific policy."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_wrapper(message: Any) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                headers.setdefault("X-Content-Type-Options", "nosniff")
                headers.setdefault("X-Frame-Options", "DENY")
                headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
                headers.setdefault(
                    "Permissions-Policy",
                    "camera=(), geolocation=(), microphone=(), payment=()",
                )
            await send(message)

        await self.app(scope, receive, send_wrapper)


class PublicSurveySecurityHeadersMiddleware:
    """Prevent caching, indexing, framing, and referrer leakage on token routes."""

    def __init__(self, app: ASGIApp, path_prefix: str) -> None:
        self.app = app
        self.path_prefix = path_prefix.rstrip("/") + "/"

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or not scope.get("path", "").startswith(self.path_prefix):
            await self.app(scope, receive, send)
            return

        async def send_wrapper(message: Any) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                headers["Cache-Control"] = "private, no-store, max-age=0"
                headers["Pragma"] = "no-cache"
                headers["Referrer-Policy"] = "no-referrer"
                headers["X-Robots-Tag"] = "noindex, nofollow, noarchive"
                headers["X-Content-Type-Options"] = "nosniff"
                headers["X-Frame-Options"] = "DENY"
                headers["Content-Security-Policy"] = "frame-ancestors 'none'"
            await send(message)

        await self.app(scope, receive, send_wrapper)
