import json

import pytest

from core.middleware import RequestIdMiddleware, RequestSizeLimitMiddleware


async def _run_asgi(
    app,
    *,
    headers: list[tuple[bytes, bytes]],
    body: bytes,
    path: str = "/upload",
) -> list[dict]:
    messages: list[dict] = []
    sent = False

    async def receive() -> dict:
        nonlocal sent
        if sent:
            return {"type": "http.disconnect"}
        sent = True
        return {"type": "http.request", "body": body, "more_body": False}

    async def send(message: dict) -> None:
        messages.append(message)

    await app(
        {
            "type": "http",
            "method": "POST",
            "path": path,
            "raw_path": path.encode("ascii"),
            "query_string": b"",
            "headers": headers,
            "client": ("127.0.0.1", 1234),
            "server": ("testserver", 80),
            "scheme": "http",
            "http_version": "1.1",
        },
        receive,
        send,
    )
    return messages


@pytest.mark.anyio
async def test_request_size_middleware_rejects_content_length_with_request_id() -> None:
    async def app(scope, receive, send):
        raise AssertionError("oversized request reached the application")

    wrapped = RequestIdMiddleware(RequestSizeLimitMiddleware(app, max_body_bytes=4))
    messages = await _run_asgi(
        wrapped,
        headers=[(b"content-length", b"5"), (b"x-request-id", b"test-request")],
        body=b"12345",
    )

    assert messages[0]["status"] == 413
    assert (b"x-request-id", b"test-request") in messages[0]["headers"]
    payload = json.loads(messages[1]["body"])
    assert payload["data"] is None
    assert payload["message"] == "Request body is too large."
    assert payload["meta"]["request_id"] == "test-request"


@pytest.mark.anyio
async def test_public_request_id_replaces_caller_value() -> None:
    observed: list[str | None] = []

    async def app(scope, receive, send):
        from core.middleware import get_request_id

        observed.append(get_request_id())
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"ok"})

    caller_id = "token-shaped-caller-id"
    wrapped = RequestIdMiddleware(app, path_prefix="/api/v1/survey")
    messages = await _run_asgi(
        wrapped,
        headers=[(b"x-request-id", caller_id.encode("ascii"))],
        body=b"",
        path="/api/v1/survey/raw-token",
    )

    request_id = messages[0]["headers"][-1][1].decode("utf-8")
    assert request_id != caller_id
    assert observed == [request_id]


@pytest.mark.anyio
async def test_non_public_request_id_preserves_caller_value() -> None:
    async def app(scope, receive, send):
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"ok"})

    caller_id = "caller-request-id"
    wrapped = RequestIdMiddleware(app, path_prefix="/api/v1/survey")
    messages = await _run_asgi(
        wrapped,
        headers=[(b"x-request-id", caller_id.encode("ascii"))],
        body=b"",
    )

    assert (b"x-request-id", caller_id.encode("ascii")) in messages[0]["headers"]


@pytest.mark.anyio
async def test_request_size_middleware_rejects_streamed_body() -> None:
    async def app(scope, receive, send):
        await receive()
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"ok"})

    wrapped = RequestIdMiddleware(RequestSizeLimitMiddleware(app, max_body_bytes=4))
    messages = await _run_asgi(wrapped, headers=[], body=b"12345")

    assert messages[0]["status"] == 413


@pytest.mark.anyio
async def test_actual_api_rejects_streamed_body_with_standard_envelope(client) -> None:
    async def body():
        yield b'{"identifier":"user@example.com","password":"x","padding":"'
        yield b"x" * 66_000
        yield b'"}'

    response = await client.post(
        "/api/v1/auth/login",
        content=body(),
        headers={
            "Content-Type": "application/json",
            "X-Request-ID": "streamed-request",
        },
    )

    assert response.status_code == 413, (
        f"{response.status_code}: {response.text} {response.headers}"
    )
    payload = response.json()
    assert payload["data"] is None
    assert payload["message"] == "Request body is too large."
    assert payload["errors"] is None
    assert payload["meta"]["request_id"] == "streamed-request"
