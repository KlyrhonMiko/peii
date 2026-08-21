import re

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
        return JSONResponse(
            status_code=exc.status_code,
            content=error_response(exc.message),
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        logger.info(
            "Validation error occurred",
            errors=exc.errors(),
            path=_redact_token_path(request.url.path),
            method=request.method,
        )
        return JSONResponse(
            status_code=422,
            content=error_response(
                "Validation error.", errors=jsonable_encoder(exc.errors())
            ),
        )

    @app.exception_handler(IntegrityError)
    async def integrity_error_handler(request: Request, exc: IntegrityError) -> JSONResponse:
        logger.error(
            "Database integrity error occurred",
            error_type=type(exc).__name__,
            path=_redact_token_path(request.url.path),
            method=request.method,
        )
        return JSONResponse(
            status_code=400,
            content=error_response("Database integrity error."),
        )
