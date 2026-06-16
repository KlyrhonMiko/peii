from typing import Any


def success_response(data: Any, message: str = "Success", meta: dict[str, Any] | None = None) -> dict[str, Any]:
    response: dict[str, Any] = {
        "data": data,
        "message": message,
    }
    if meta is not None:
        response["meta"] = meta
    return response
