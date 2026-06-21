from typing import Any

from starlette.datastructures import Headers
from starlette.types import ASGIApp, Receive, Scope, Send
from uuid6 import uuid7

from core.context import request_id_ctx


class RequestIdMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] not in ("http", "websocket"):
            await self.app(scope, receive, send)
            return

        headers = Headers(scope=scope)
        request_id = headers.get("X-Request-ID")
        if not request_id:
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
