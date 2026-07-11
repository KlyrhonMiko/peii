from enum import StrEnum


class QuestionType(StrEnum):
    SINGLE_CHOICE = "single_choice"
    MULTIPLE_CHOICE = "multiple_choice"
    TEXT = "text"
    NUMBER = "number"
    SCALE = "scale"
    RANKING = "ranking"
    MATRIX = "matrix"
    DATETIME = "datetime"
    FILE = "file"
    BOOLEAN = "boolean"
