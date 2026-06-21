import logging
from typing import Any

import structlog
from structlog.types import EventDict, WrappedLogger

from core.context import request_id_ctx


def request_id_processor(
    logger: WrappedLogger, method_name: str, event_dict: EventDict
) -> EventDict:
    """Injects the current request_id from contextvars into the log event."""
    request_id = request_id_ctx.get()
    if request_id:
        event_dict["request_id"] = request_id
    return event_dict


def setup_logging(json_output: bool = False, debug: bool = True) -> None:
    """Configures structlog with standard processors and JSON/Console renderers."""
    shared_processors: list[Any] = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.TimeStamper(fmt="iso"),
        request_id_processor,
    ]

    renderer: Any
    if json_output:
        renderer = structlog.processors.JSONRenderer()
    else:
        renderer = structlog.dev.ConsoleRenderer(colors=True)

    log_level = logging.DEBUG if debug else logging.INFO

    structlog.configure(
        processors=shared_processors + [renderer],
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        wrapper_class=structlog.make_filtering_bound_logger(log_level),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str) -> structlog.stdlib.BoundLogger:
    """Returns a bound logger with the logger name context pre-attached."""
    return structlog.get_logger(name)  # type: ignore[return-value]
