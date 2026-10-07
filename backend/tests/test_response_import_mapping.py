from datetime import datetime

import pytest

from models.question_type import QuestionType
from services.response_import_mapping import (
    ImportQuestion,
    clean_text,
    comparison_key,
    convert_cell,
    day_first_dates,
    email_keys,
    name_key,
    parse_timestamp,
    phone_keys,
    propose_mapping,
)


def _question(
    question_type: QuestionType,
    text: str = "Question",
    options: list[str] | None = None,
    config: dict[str, object] | None = None,
    question_id: str = "q1",
) -> ImportQuestion:
    return ImportQuestion(
        id=question_id,
        text=text,
        section_title="Section",
        question_type=question_type,
        options=options or [],
        config=config or {},
        order=0,
    )


def test_text_normalization_removes_invisible_marks_and_expands_abbreviations() -> None:
    assert clean_text("‎Systems  Developer ") == "Systems Developer"
    assert comparison_key("Sta. Lucia") == comparison_key("Santa Lucia")
    assert comparison_key("Advertising, Arts & Media") == comparison_key(
        "Advertising, Arts, & Media"
    )


@pytest.mark.parametrize(
    ("raw", "expected"),
    [("3 = Neutral", 3), ("5", 5), ("Strongly Agree", 5), (" 1 – Strongly Disagree", 1)],
)
def test_scale_cells_accept_google_labels(raw: str, expected: int) -> None:
    question = _question(
        QuestionType.SCALE,
        options=["Strongly Disagree", "Disagree", "Neutral", "Agree", "Strongly Agree"],
        config={"min": 1, "max": 5},
    )
    assert convert_cell(question, raw).value == expected


def test_checkbox_answers_split_on_commas_without_breaking_options_with_commas() -> None:
    question = _question(
        QuestionType.MULTIPLE_CHOICE,
        options=["Advertising, Arts, & Media", "Sales", "Legal"],
    )
    converted = convert_cell(question, "Advertising, Arts, & Media, Legal")
    assert converted.value == ["Advertising, Arts, & Media", "Legal"]
    assert convert_cell(question, "Sales, Unknown").issue is True


def test_unknown_choice_is_an_issue_until_overridden() -> None:
    question = _question(QuestionType.SINGLE_CHOICE, options=["Yes", "No"])
    assert convert_cell(question, "Maybe").issue is True
    assert convert_cell(question, "Maybe", {"Maybe": "No"}).value == "No"
    assert convert_cell(question, "Maybe", {"Maybe": None}).value is None


def test_timestamps_round_to_the_second_and_respect_google_offsets() -> None:
    # An Excel float can land a hair before the second shown in the CSV.
    excel = datetime(2026, 7, 8, 16, 31, 18, 999_900)
    assert parse_timestamp(excel, utc_offset_minutes=480, day_first=False) == datetime(
        2026, 7, 8, 8, 31, 19
    )
    assert parse_timestamp(
        "7/8/2026 16:31:19", utc_offset_minutes=480, day_first=False
    ) == datetime(2026, 7, 8, 8, 31, 19)
    assert parse_timestamp(
        "2026/07/08 4:31:19 PM GMT+8", utc_offset_minutes=0, day_first=False
    ) == datetime(2026, 7, 8, 8, 31, 19)
    with pytest.raises(ValueError):
        parse_timestamp("yesterday", utc_offset_minutes=480, day_first=False)


def test_day_first_detection_needs_evidence() -> None:
    assert day_first_dates(["13/07/2026 10:00:00", "01/02/2026 10:00:00"]) is True
    assert day_first_dates(["07/13/2026 10:00:00"]) is False
    assert day_first_dates(["01/02/2026 10:00:00"]) is False


def test_identity_keys_normalize_contacts_and_names() -> None:
    assert email_keys("Main: A.B@Example.com / alt@x.org") == {"a.b@example.com", "alt@x.org"}
    assert phone_keys("0917 555 0000 / +63 917-555-0000") == {"9175550000"}
    assert name_key("Dela Cruz, Juan A.") == name_key("Juan Dela Cruz")
    assert name_key("Juan") is None


def test_mapping_matches_grid_rows_by_phase_and_columns_by_values() -> None:
    before = _question(
        QuestionType.SCALE,
        text="I trust the LGU.",
        options=["1", "2", "3", "4", "5"],
        config={"min": 1, "max": 5, "survey_phase": 1},
        question_id="before",
    )
    after = _question(
        QuestionType.SCALE,
        text="I trust the LGU.",
        options=["1", "2", "3", "4", "5"],
        config={"min": 1, "max": 5, "survey_phase": 2},
        question_id="after",
    )
    status = _question(
        QuestionType.SINGLE_CHOICE,
        text="What is your current employment status?",
        options=["Employed full-time", "Unemployed - seeking work"],
        question_id="status",
    )
    headers = [
        "Timestamp",
        "E.2. AFTER: Trust [I trust the LGU.]",
        "E.1. BEFORE: Trust [I trust the LGU.]",
        "Current Status:",
        "Email Address",
    ]
    rows = [[None, "4", "3", "Employed full-time", "a@example.com"]]
    mapping = propose_mapping(headers, rows, [before, after, status])
    assert [item.target for item in mapping] == [
        "submitted_at",
        "question",
        "question",
        "question",
        "match_only",
    ]
    assert [item.question_id for item in mapping[1:4]] == ["after", "before", "status"]
    assert mapping[3].match == "values"
