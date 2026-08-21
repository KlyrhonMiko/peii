import math
from collections.abc import Mapping
from typing import Any

from models.question_type import QuestionType

DEFAULT_MATRIX_COLUMNS = ("Poor", "Fair", "Good", "Excellent")


def _validate_string_options(options: object, *, required: bool = True) -> list[str]:
    if options is None:
        if required:
            raise ValueError("options must contain at least one value")
        return []
    if not isinstance(options, list) or not options or not all(
        isinstance(option, str) and option.strip() for option in options
    ):
        raise ValueError("options must be a non-empty list of non-blank strings")
    if len(options) != len(set(options)):
        raise ValueError("options must not contain duplicates")
    return options


def _validate_config(config: object) -> dict[str, Any]:
    if config is None:
        return {}
    if not isinstance(config, dict):
        raise ValueError("config must be an object")
    return config


def _validate_numeric_bound(value: object, name: str) -> int | float:
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        raise ValueError(f"config.{name} must be a number")
    if not math.isfinite(value):
        raise ValueError(f"config.{name} must be finite")
    return value


def validate_question_definition(
    question_type: QuestionType | str,
    options: object,
    config: object,
) -> None:
    """Validate the persisted contract shared by authors and respondents."""
    try:
        normalized_type = QuestionType(question_type)
    except ValueError as exc:
        raise ValueError("question_type is not supported") from exc

    if normalized_type in {
        QuestionType.SINGLE_CHOICE,
        QuestionType.MULTIPLE_CHOICE,
        QuestionType.RANKING,
    }:
        _validate_string_options(options)
    elif normalized_type == QuestionType.MATRIX:
        _validate_string_options(options)
        normalized_config = _validate_config(config)
        columns = normalized_config.get("columns", DEFAULT_MATRIX_COLUMNS)
        _validate_string_options(columns)
    elif normalized_type == QuestionType.SCALE:
        scale_options = _validate_string_options(options, required=False)
        normalized_config = _validate_config(config)
        minimum = normalized_config.get("min", 1)
        maximum = normalized_config.get("max", len(scale_options) or 4)
        if not isinstance(minimum, int) or isinstance(minimum, bool):
            raise ValueError("config.min must be an integer")
        if not isinstance(maximum, int) or isinstance(maximum, bool):
            raise ValueError("config.max must be an integer")
        if minimum >= maximum:
            raise ValueError("config.min must be less than config.max")
        if scale_options and len(scale_options) > maximum - minimum + 1:
            raise ValueError("scale options exceed the configured range")
    elif normalized_type == QuestionType.NUMBER:
        normalized_config = _validate_config(config)
        minimum = normalized_config.get("min")
        maximum = normalized_config.get("max")
        if minimum is not None:
            minimum = _validate_numeric_bound(minimum, "min")
        if maximum is not None:
            maximum = _validate_numeric_bound(maximum, "max")
        if minimum is not None and maximum is not None and minimum > maximum:
            raise ValueError("config.min must not exceed config.max")
        integer = normalized_config.get("integer")
        if integer is not None and not isinstance(integer, bool):
            raise ValueError("config.integer must be a boolean")
        step = normalized_config.get("step")
        if step is not None and _validate_numeric_bound(step, "step") <= 0:
            raise ValueError("config.step must be greater than zero")
    elif normalized_type == QuestionType.TEXT:
        normalized_config = _validate_config(config)
        max_length = normalized_config.get("max_length")
        if max_length is not None and (
            not isinstance(max_length, int)
            or isinstance(max_length, bool)
            or max_length < 1
            or max_length > 10000
        ):
            raise ValueError("config.max_length must be an integer between 1 and 10000")
    elif normalized_type == QuestionType.BOOLEAN:
        if options is not None:
            raise ValueError("boolean questions must not define options")
        _validate_config(config)
    elif normalized_type == QuestionType.DATETIME:
        if options is not None:
            raise ValueError("datetime questions must not define options")
        _validate_config(config)
    elif normalized_type == QuestionType.FILE:
        raise ValueError("file questions are not supported until file uploads are implemented")


def get_matrix_columns(config: Mapping[str, Any] | None) -> list[str]:
    if not config or "columns" not in config:
        return list(DEFAULT_MATRIX_COLUMNS)
    columns = config["columns"]
    if not isinstance(columns, list):
        raise ValueError("config.columns must be a list")
    return columns


def get_scale_bounds(
    options: list[str] | None,
    config: Mapping[str, Any] | None,
) -> tuple[int, int]:
    normalized_config = config or {}
    minimum = normalized_config.get("min", 1)
    maximum = normalized_config.get("max", len(options or []) or 4)
    if not isinstance(minimum, int) or isinstance(minimum, bool):
        raise ValueError("config.min must be an integer")
    if not isinstance(maximum, int) or isinstance(maximum, bool):
        raise ValueError("config.max must be an integer")
    return minimum, maximum
