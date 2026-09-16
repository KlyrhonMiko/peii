import math
from collections.abc import Mapping, Sequence
from typing import Any

from models.question_type import QuestionType

DEFAULT_MATRIX_COLUMNS = ("Poor", "Fair", "Good", "Excellent")
QuestionDefinition = tuple[QuestionType | str, object, object]


def _validate_string_options(options: object, *, required: bool = True) -> list[str]:
    if options is None:
        if required:
            raise ValueError("options must contain at least one value")
        return []
    if (
        not isinstance(options, list)
        or not options
        or not all(isinstance(option, str) and option.strip() for option in options)
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


def _validate_non_blank_string(value: object, name: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{name} must be a non-blank string")
    return value


def _validate_visible_when(value: object) -> None:
    if not isinstance(value, dict):
        raise ValueError("config.visible_when must be an object")

    _validate_non_blank_string(value.get("question_key"), "config.visible_when.question_key")
    has_equals = "equals" in value
    has_one_of = "one_of" in value
    if has_equals == has_one_of:
        raise ValueError("config.visible_when must define exactly one of equals or one_of")
    if has_equals:
        _validate_non_blank_string(value["equals"], "config.visible_when.equals")
        return

    one_of = value["one_of"]
    if (
        not isinstance(one_of, list)
        or not one_of
        or not all(isinstance(option, str) and option.strip() for option in one_of)
    ):
        raise ValueError("config.visible_when.one_of must be a non-empty list of strings")
    if len(one_of) != len(set(one_of)):
        raise ValueError("config.visible_when.one_of must not contain duplicates")


def _validate_options_by_answer(
    value: object,
    options: list[str] | None,
    question_type: QuestionType,
) -> None:
    if question_type != QuestionType.SINGLE_CHOICE:
        raise ValueError("config.options_by_answer is supported only for single_choice questions")
    if not isinstance(value, dict):
        raise ValueError("config.options_by_answer must be an object")

    _validate_non_blank_string(
        value.get("question_key"), "config.options_by_answer.question_key"
    )
    choices = value.get("choices")
    if not isinstance(choices, dict) or not choices:
        raise ValueError("config.options_by_answer.choices must be a non-empty object")
    if options is None:
        raise ValueError("config.options_by_answer requires question options")

    for source_answer, allowed_options in choices.items():
        _validate_non_blank_string(
            source_answer, "config.options_by_answer.choices keys"
        )
        if (
            not isinstance(allowed_options, list)
            or not allowed_options
            or not all(isinstance(option, str) and option.strip() for option in allowed_options)
        ):
            raise ValueError(
                "config.options_by_answer.choices values must be non-empty lists of strings"
            )
        if len(allowed_options) != len(set(allowed_options)):
            raise ValueError("config.options_by_answer choices must not contain duplicates")
        if any(option not in options for option in allowed_options):
            raise ValueError(
                "config.options_by_answer choices must be contained in question options"
            )


def _validate_common_config(
    config: dict[str, Any],
    options: list[str] | None,
    question_type: QuestionType,
) -> None:
    if "question_key" in config:
        _validate_non_blank_string(config["question_key"], "config.question_key")
    if "visible_when" in config:
        _validate_visible_when(config["visible_when"])
    if "options_by_answer" in config:
        _validate_options_by_answer(config["options_by_answer"], options, question_type)


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

    normalized_config = _validate_config(config)
    string_options: list[str] | None = None
    if normalized_type in {
        QuestionType.SINGLE_CHOICE,
        QuestionType.MULTIPLE_CHOICE,
        QuestionType.RANKING,
    }:
        string_options = _validate_string_options(options)
    elif normalized_type == QuestionType.MATRIX:
        string_options = _validate_string_options(options)
        columns = normalized_config.get("columns", DEFAULT_MATRIX_COLUMNS)
        _validate_string_options(columns)
    elif normalized_type == QuestionType.SCALE:
        string_options = _validate_string_options(options, required=False)
        scale_options = string_options
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
    elif normalized_type == QuestionType.DATETIME:
        if options is not None:
            raise ValueError("datetime questions must not define options")
    elif normalized_type == QuestionType.FILE:
        raise ValueError("file questions are not supported until file uploads are implemented")

    _validate_common_config(normalized_config, string_options, normalized_type)


def validate_question_structure(questions: Sequence[QuestionDefinition]) -> None:
    """Validate references between questions in their respondent-facing order.

    Individual question validation intentionally remains usable while an author is
    building a survey.  This pass runs at structure boundaries, where all active
    questions are available, and verifies that conditional references resolve to a
    preceding single-choice question with a unique key.
    """

    normalized_questions: list[tuple[QuestionType, list[str] | None, dict[str, Any]]] = []
    question_key_indexes: dict[str, int] = {}

    for index, (question_type, options, config) in enumerate(questions):
        try:
            normalized_type = QuestionType(question_type)
        except (TypeError, ValueError) as exc:
            raise ValueError(f"Question {index + 1} has an unsupported question_type") from exc

        normalized_config = _validate_config(config)
        normalized_options = options if isinstance(options, list) else None
        question_key = normalized_config.get("question_key")
        if isinstance(question_key, str) and question_key.strip():
            if question_key in question_key_indexes:
                raise ValueError(
                    f"config.question_key values must be unique; duplicate key "
                    f"'{question_key}'"
                )
            question_key_indexes[question_key] = index

        normalized_questions.append(
            (normalized_type, normalized_options, normalized_config)
        )

    for dependent_index, (_, _, dependent_config) in enumerate(normalized_questions):
        for dependency_name in ("visible_when", "options_by_answer"):
            dependency = dependent_config.get(dependency_name)
            if dependency is None:
                continue
            if not isinstance(dependency, dict):
                # validate_question_definition reports this shape error.
                continue

            source_key = dependency.get("question_key")
            if not isinstance(source_key, str):
                continue
            source_index = question_key_indexes.get(source_key)
            if source_index is None:
                raise ValueError(
                    f"config.{dependency_name}.question_key references unknown "
                    f"question_key '{source_key}'"
                )
            if source_index >= dependent_index:
                raise ValueError(
                    f"config.{dependency_name}.question_key must reference a preceding "
                    "question"
                )

            source_type, source_options, source_config = normalized_questions[source_index]
            if source_type != QuestionType.SINGLE_CHOICE:
                raise ValueError(
                    f"config.{dependency_name}.question_key must reference a "
                    "single_choice question"
                )
            if (
                isinstance(source_config.get("survey_phase"), int)
                and not isinstance(source_config.get("survey_phase"), bool)
                and isinstance(dependent_config.get("survey_phase"), int)
                and not isinstance(dependent_config.get("survey_phase"), bool)
                and source_config["survey_phase"] != dependent_config["survey_phase"]
            ):
                raise ValueError(
                    f"config.{dependency_name}.question_key must reference a question "
                    "in the same survey phase"
                )

            if dependency_name == "options_by_answer":
                choices = dependency.get("choices")
                if not isinstance(choices, dict) or source_options is None:
                    continue
                invalid_source_answers = [
                    source_answer
                    for source_answer in choices
                    if source_answer not in source_options
                ]
                if invalid_source_answers:
                    raise ValueError(
                        "config.options_by_answer.choices keys must be contained in "
                        "the source question options"
                    )


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
