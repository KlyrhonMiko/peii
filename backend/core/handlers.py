import re
from collections.abc import Sequence

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError

from core.exceptions import AppError
from core.logging import get_logger
from core.responses import error_response

logger = get_logger(__name__)
_TOKEN_PATH_PATTERN = re.compile(r"(/survey/)[^/]+")


def _redact_token_path(path: str) -> str:
    return _TOKEN_PATH_PATTERN.sub(r"\1[REDACTED]", path)


def _safe_validation_errors(errors: Sequence[dict]) -> list[dict]:
    """Keep validation locations/messages while excluding submitted field values."""

    return [
        {
            key: value
            for key, value in error.items()
            if key not in {"input", "ctx"}
        }
        for error in errors
    ]


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
        logger.warning(
            "Application error occurred",
            message=exc.message,
            status_code=exc.status_code,
            path=_redact_token_path(request.url.path),
            method=request.method,
        )
        headers: dict[str, str] = {}
        if exc.status_code == 401:
            headers["WWW-Authenticate"] = "Bearer"
        retry_after = getattr(exc, "retry_after", None)
        if retry_after is not None:
            headers["Retry-After"] = str(retry_after)
        return JSONResponse(
            status_code=exc.status_code,
            content=error_response(exc.message, errors=exc.errors),
            headers=headers or None,
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        safe_errors = _safe_validation_errors(exc.errors())
        logger.info(
            "Validation error occurred",
            errors=safe_errors,
            path=_redact_token_path(request.url.path),
            method=request.method,
        )
        return JSONResponse(
            status_code=422,
            content=error_response("Validation error.", errors=jsonable_encoder(safe_errors)),
        )

    @app.exception_handler(IntegrityError)
    async def integrity_error_handler(request: Request, exc: IntegrityError) -> JSONResponse:
        diagnostic = getattr(exc.orig, "diag", None)
        constraint = getattr(diagnostic, "constraint_name", None) or getattr(
            exc.orig, "constraint_name", None
        )
        table = getattr(diagnostic, "table_name", None) or getattr(exc.orig, "table_name", None)
        logger.error(
            "Database integrity error occurred",
            error_type=type(exc).__name__,
            database_error_type=type(exc.orig).__name__,
            constraint=constraint,
            table=table,
            path=_redact_token_path(request.url.path),
            method=request.method,
        )
        return JSONResponse(
            status_code=400,
            content=error_response("Database integrity error."),
        )
