"""Read uploaded .xlsx or .csv files into plain rows of cell values.

The reader is deliberately resource-agnostic: it knows nothing about surveys. It
bounds the work an upload can cause (compressed and uncompressed size) before any
XML is parsed, and openpyxl parses workbook XML through defusedxml when that package
is installed.
"""

from __future__ import annotations

import csv
import io
import zipfile
from dataclasses import dataclass
from datetime import date, datetime, time
from typing import Literal

CellValue = str | int | float | bool | datetime | None
SpreadsheetFormat = Literal["xlsx", "csv"]

MAX_UNCOMPRESSED_XLSX_BYTES = 50 * 1024 * 1024
_ZIP_MAGIC = b"PK\x03\x04"


class SpreadsheetError(ValueError):
    """The upload cannot be read as a supported spreadsheet."""


@dataclass(frozen=True, slots=True)
class Sheet:
    name: str
    rows: list[list[CellValue]]


@dataclass(frozen=True, slots=True)
class Workbook:
    format: SpreadsheetFormat
    sheets: list[Sheet]


def _normalize_cell(value: object) -> CellValue:
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, float):
        return int(value) if value.is_integer() else value
    if isinstance(value, (int, str, datetime)):
        return value
    if isinstance(value, date):
        return datetime.combine(value, time())
    if isinstance(value, time):
        return value.isoformat()
    return str(value)


def _is_blank(value: CellValue) -> bool:
    return value is None or (isinstance(value, str) and not value.strip())


def _trim(rows: list[list[CellValue]]) -> list[list[CellValue]]:
    """Drop trailing blank rows and trailing all-blank columns."""
    while rows and all(_is_blank(cell) for cell in rows[-1]):
        rows.pop()
    width = 0
    for row in rows:
        for index in range(len(row) - 1, -1, -1):
            if not _is_blank(row[index]):
                width = max(width, index + 1)
                break
    return [row[:width] + [None] * (width - len(row[:width])) for row in rows]


def _read_xlsx(raw: bytes) -> Workbook:
    try:
        archive = zipfile.ZipFile(io.BytesIO(raw))
    except zipfile.BadZipFile as exc:
        raise SpreadsheetError("The file is not a readable .xlsx workbook.") from exc
    with archive:
        uncompressed = sum(info.file_size for info in archive.infolist())
        if uncompressed > MAX_UNCOMPRESSED_XLSX_BYTES:
            raise SpreadsheetError("The workbook expands beyond the supported size.")

    # Import lazily so CSV-only paths and app startup do not pay for openpyxl.
    from openpyxl import load_workbook

    try:
        workbook = load_workbook(
            io.BytesIO(raw),
            read_only=True,
            data_only=True,
            keep_links=False,
        )
    except Exception as exc:  # openpyxl raises many unrelated exception types.
        raise SpreadsheetError("The file is not a readable .xlsx workbook.") from exc
    try:
        sheets = [
            Sheet(
                name=str(worksheet.title),
                rows=_trim(
                    [
                        [_normalize_cell(cell) for cell in row]
                        for row in worksheet.iter_rows(values_only=True)
                    ]
                ),
            )
            for worksheet in workbook.worksheets
        ]
    except Exception as exc:
        raise SpreadsheetError("The workbook could not be read.") from exc
    finally:
        workbook.close()
    return Workbook(format="xlsx", sheets=sheets)


def _read_csv(raw: bytes) -> Workbook:
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise SpreadsheetError(
            "The CSV file must use UTF-8. Download it again from Google Sheets as CSV, "
            "or upload the .xlsx file."
        ) from exc
    try:
        rows: list[list[CellValue]] = [
            list(record) for record in csv.reader(io.StringIO(text, newline=""), strict=True)
        ]
    except csv.Error as exc:
        raise SpreadsheetError("The CSV file could not be parsed.") from exc
    return Workbook(format="csv", sheets=[Sheet(name="CSV", rows=_trim(rows))])


def read_spreadsheet(raw: bytes, filename: str | None = None) -> Workbook:
    """Read an .xlsx or .csv upload. The format comes from the bytes, not the name."""
    if not raw:
        raise SpreadsheetError("The file is empty.")
    if raw.startswith(_ZIP_MAGIC):
        return _read_xlsx(raw)
    lowered = (filename or "").casefold()
    if lowered.endswith((".xlsx", ".xlsm", ".xls")):
        raise SpreadsheetError("The file is not a readable .xlsx workbook.")
    return _read_csv(raw)
