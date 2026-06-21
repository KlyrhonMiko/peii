from typing import Any

from pydantic import BaseModel

from core.context import request_id_ctx
from schemas.common import APIResponse, PaginationMeta


def success_response[T](
    data: T,
    message: str = "Success",
    meta: dict[str, Any] | None = None,
) -> APIResponse[T]:
    request_id = request_id_ctx.get()
    if request_id:
        if meta is None:
            meta = {}
        if "request_id" not in meta:
            meta["request_id"] = request_id

    return APIResponse(
        data=data,
        message=message,
        errors=None,
        meta=meta,
    )


def error_response(
    message: str,
    errors: Any | None = None,
    meta: dict[str, Any] | None = None,
) -> dict[str, Any]:
    request_id = request_id_ctx.get()
    if request_id:
        if meta is None:
            meta = {}
        if "request_id" not in meta:
            meta["request_id"] = request_id

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
    return {
        "pagination": PaginationMeta(
            total=total,
            count=count,
            limit=limit,
            offset=offset,
            has_next=offset + count < total,
            has_prev=offset > 0,
        ).model_dump(mode="json"),
        "filters": filters.model_dump(
            mode="json",
            exclude={"limit", "offset"},
        ),
    }
