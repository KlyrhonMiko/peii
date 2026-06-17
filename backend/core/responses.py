from typing import Any

from pydantic import BaseModel

from schemas.common import ListMeta, PaginationMeta


def success_response(data: Any, message: str = "Success", meta: dict[str, Any] | None = None) -> dict[str, Any]:
    return {
        "data": data,
        "message": message,
        "errors": None,
        "meta": meta,
    }


def error_response(
    message: str,
    errors: Any | None = None,
    meta: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "data": None,
        "message": message,
        "errors": errors,
        "meta": meta,
    }


def list_meta_response(
    *,
    filters: BaseModel,
    total: int,
    count: int,
    limit: int,
    offset: int,
) -> dict[str, Any]:
    return ListMeta(
        pagination=PaginationMeta(
            total=total,
            count=count,
            limit=limit,
            offset=offset,
            has_next=offset + count < total,
            has_prev=offset > 0,
        ),
        filters=filters,
    ).model_dump(mode="json")
