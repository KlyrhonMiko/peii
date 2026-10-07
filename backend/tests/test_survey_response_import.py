"""API tests for importing Google Forms response exports.

The fixture workbook mirrors the structure of a real Google Forms export of the
Graduate Tracer survey (header wording, grid columns, per-industry category columns,
"3 = Neutral" scale text, abbreviated barangays, hidden direction marks) with
synthetic values only.
"""

from __future__ import annotations

import csv
import io
import json
from datetime import datetime, timedelta
from typing import Any
from uuid import UUID

import pytest
from openpyxl import Workbook, load_workbook
from sqlmodel import col, select

from core.database import get_async_session
from core.deps import Principal, get_current_principal
from main import app
from models.audit_log import AuditLog
from models.survey import Survey
from models.survey_question import SurveyQuestion
from models.survey_response import SurveyResponse
from scripts import seed_alumni_questionnaire as seed
from services import response_import_service

pytestmark = pytest.mark.anyio

XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
CONSENT_HEADER = (
    "I have read and understood the Data Privacy Statement and voluntarily agree to "
    "participate in this survey."
)
FIRST_GEN_HEADER = (
    "First-generation graduate in the family:\n(You are the first in the immediate family "
    "to graduate from a college or university.)"
)
GRID_TITLES = [
    "A.{phase}. {when}: Employability and Economic Mobility",
    "B.{phase}. {when}: Family Upliftment and Financial Stability",
    "C.{phase}. {when}: Personal Development and Life Quality",
    "D.{phase}. {when}: Civic Engagement and Community Contribution",
    # Google's form says "Government"; the survey says "Governance".
    "E.{phase}. {when}: Government Trust and LGU Support Valuation",
]
GOOGLE_INDUSTRY_SPELLING = {
    "Advertising, Arts, & Media": "Advertising, Arts & Media",
    "Self-Employment": "Self Employment",
    "Retail & Consumer Products": " Retail & Consumer Products",
    "Sales": " Sales",
}
FEEDBACK_HEADERS = [
    "What specific technical or soft skills do you wish were given more focus at PLP?",
    "What improvements should PLP implement to better support students?",
    "What message would you like to share with Pasig City leaders regarding PLP?",
]
PERSONAL_HEADERS = [
    "Name*: Surname, First name, Middle Initial (e.g. Dela Cruz, Juan A.)",
    "PLP Email Address: (@plpasig.edu.ph)",
    "Non-PLP Email Address: (GMail, Yahoo, Etc.)",
    "Contact Number/s:",
]
INDUSTRIES = [
    ("Education & Training", "Teaching – Secondary", "Teacher I-VII"),
    ("Information & Communication Technology", "Help Desk & IT Support", "Systems Developer"),
    ("Self-Employment", "Self Employment", "Account Executive"),
]
SCALE_LABELS = seed.PEII_SCALE_LABELS


# ------------------------------------------------------------------- helpers


def _grant_permissions(*permissions: str) -> None:
    from models.user import User

    async def override() -> Principal:
        return Principal(
            user=User(
                id=UUID("00000000-0000-0000-0000-000000000001"),
                user_id="USER-IMPORT-TEST",
                auth_user_id=UUID("00000000-0000-0000-0000-000000000002"),
                email="import@example.com",
                username="importer",
                first_name="Import",
                last_name="Tester",
            ),
            permissions=frozenset(permissions),
            access_token="test",
        )

    app.dependency_overrides[get_current_principal] = override


def _grant_import_permission(*extra: str) -> None:
    _grant_permissions("survey_responses.import", "surveys.manage", *extra)


async def _session():
    generator = app.dependency_overrides[get_async_session]()
    return generator, await anext(generator)


async def _seed_tracer_survey() -> str:
    generator, session = await _session()
    try:
        survey = await seed._seed(session)
        return str(survey.id)
    finally:
        await generator.aclose()


async def _stored_responses(survey_uuid: str) -> list[SurveyResponse]:
    generator, session = await _session()
    try:
        return list(
            (
                await session.exec(
                    select(SurveyResponse)
                    .where(SurveyResponse.survey_id == UUID(survey_uuid))
                    .order_by(col(SurveyResponse.created_at))
                )
            ).all()
        )
    finally:
        await generator.aclose()


async def _question_ids(survey_uuid: str) -> dict[str, str]:
    generator, session = await _session()
    try:
        rows = (
            await session.exec(
                select(SurveyQuestion).where(SurveyQuestion.survey_id == UUID(survey_uuid))
            )
        ).all()
        by_text: dict[str, str] = {}
        for question in rows:
            phase = (question.config or {}).get("survey_phase")
            by_text.setdefault(f"{phase}|{question.question_text}", str(question.id))
            by_text.setdefault(question.question_text, str(question.id))
        return by_text
    finally:
        await generator.aclose()


async def _audits(survey_uuid: str, action: str) -> list[AuditLog]:
    generator, session = await _session()
    try:
        survey = (
            await session.exec(select(Survey).where(Survey.id == UUID(survey_uuid)))
        ).one()
        return list(
            (
                await session.exec(
                    select(AuditLog).where(
                        col(AuditLog.resource_id) == survey.survey_id,
                        col(AuditLog.action) == action,
                    )
                )
            ).all()
        )
    finally:
        await generator.aclose()


def _headers(*, personal: bool = False, collected_email: bool = False) -> list[str]:
    headers = ["Timestamp"]
    if collected_email:
        headers.append("Email Address")
    headers.append(CONSENT_HEADER)
    if personal:
        headers.extend(PERSONAL_HEADERS)
    headers.extend(
        [
            "Year Graduated:",
            "Degree Program Category",
            "Sex Assigned At Birth:",
            "Current Location:",
            "Baranggay",
            FIRST_GEN_HEADER,
            "Current Status:",
            "Employment Type:",
            "Employment Sector:",
            "Job Level:",
            "Civil Status:",
            "Job Industry",
        ]
    )
    headers.extend(
        f"Categories for {GOOGLE_INDUSTRY_SPELLING.get(industry, industry)}"
        for industry in seed.JOB_INDUSTRY_OPTIONS
    )
    headers.extend(
        [
            "Roles",
            "Work Location:",
            "Monthly Income Range",
            "Is your current job related to your college degree?",
            "How difficult was it to find your first job after graduation?",
            "Time to First Job After Graduation:",
            "How did you obtain your first job?",
        ]
    )
    for phase, when in ((1, "BEFORE"), (2, "AFTER")):
        for title, section in zip(GRID_TITLES, seed.PEII_SECTIONS_PHASE_1, strict=True):
            for question in section["questions"]:
                headers.append(f"{title.format(phase=phase, when=when)} [{question['text']}]")
    headers.extend(FEEDBACK_HEADERS)
    return headers


def _base_time() -> datetime:
    # Local (UTC+8) wall-clock time, as Google Sheets writes it.
    return (datetime.now() - timedelta(days=30)).replace(microsecond=0)


def _row(index: int, *, personal: bool = False, collected_email: bool = False) -> dict[str, Any]:
    industry, category, role = INDUSTRIES[index % len(INDUSTRIES)]
    in_pasig = index % 4 != 3
    values: dict[str, Any] = {
        "Timestamp": _base_time() + timedelta(hours=index, seconds=index),
        "Email Address": f"respondent{index}@example.com",
        CONSENT_HEADER: "Yes",
        PERSONAL_HEADERS[0]: f"Respondent{index}, Test A.",
        PERSONAL_HEADERS[1]: f"test{index}@plpasig.edu.ph",
        PERSONAL_HEADERS[2]: f"respondent{index}@example.com",
        PERSONAL_HEADERS[3]: f"0917 555 {index:04d}",
        "Year Graduated:": 2023 + index % 3,
        "Degree Program Category": "Bachelor of Science in Information Technology",
        "Sex Assigned At Birth:": "Female" if index % 2 else "Male",
        "Current Location:": "Pasig City" if in_pasig else "NCR (Outside Pasig)",
        "Baranggay": ("Sta. Lucia" if index % 2 else "Pinagbuhatan") if in_pasig else None,
        FIRST_GEN_HEADER: "Yes",
        "Current Status:": "Employed full-time",
        "Employment Type:": "Permanent",
        "Employment Sector:": "Private",
        "Job Level:": "Entry-Level",
        "Civil Status:": "Single",
        "Job Industry": industry,
        f"Categories for {GOOGLE_INDUSTRY_SPELLING.get(industry, industry)}": category,
        "Roles": f"‎{role}",
        "Work Location:": "Pasig City",
        "Monthly Income Range": "₱15,001 – ₱25,000",
        "Is your current job related to your college degree?": "Highly related",
        "How difficult was it to find your first job after graduation?": "Easy",
        "Time to First Job After Graduation:": "< 3 months",
        "How did you obtain your first job?": "Referral",
    }
    headers = _headers(personal=personal, collected_email=collected_email)
    grid_headers = [header for header in headers if header.endswith("]")]
    for offset, header in enumerate(grid_headers):
        score = (index + offset) % 5 + 1
        values[header] = f"{score} = {SCALE_LABELS[score - 1]}"
    for offset, header in enumerate(FEEDBACK_HEADERS):
        values[header] = f"Feedback {offset} from respondent {index}"
    return values


def _matrix(
    rows: list[dict[str, Any]],
    *,
    personal: bool = False,
    collected_email: bool = False,
) -> tuple[list[str], list[list[Any]]]:
    headers = _headers(personal=personal, collected_email=collected_email)
    return headers, [[row.get(header) for header in headers] for row in rows]


def _xlsx(rows: list[dict[str, Any]], **kwargs: bool) -> bytes:
    headers, matrix = _matrix(rows, **kwargs)
    workbook = Workbook()
    sheet = workbook.active
    assert sheet is not None
    sheet.title = "Form Responses 1"
    sheet.append(headers)
    for values in matrix:
        sheet.append(values)
    logs = workbook.create_sheet("Logs")
    logs.append(["Timestamp", "Name", "Email", "Year", "Degree Program", "Status", "Message"])
    logs.append([_base_time(), "Decoy, Person Z.", "decoy@example.com", 2024, "BSIT", "OK", "x"])
    output = io.BytesIO()
    workbook.save(output)
    return output.getvalue()


def _csv(rows: list[dict[str, Any]], **kwargs: bool) -> bytes:
    headers, matrix = _matrix(rows, **kwargs)
    output = io.StringIO(newline="")
    writer = csv.writer(output, lineterminator="\r\n")
    writer.writerow(headers)
    for values in matrix:
        formatted = []
        for value in values:
            if isinstance(value, datetime):
                # Google Sheets CSV: M/D/YYYY H:MM:SS without a timezone.
                formatted.append(
                    f"{value.month}/{value.day}/{value.year} "
                    f"{value.hour}:{value.minute:02d}:{value.second:02d}"
                )
            else:
                formatted.append("" if value is None else str(value))
        writer.writerow(formatted)
    return output.getvalue().encode("utf-8")


async def _preview(
    client,
    survey_uuid: str,
    payload: bytes,
    *,
    filename: str = "responses.xlsx",
    overrides: dict[str, Any] | None = None,
    extra: dict[str, str] | None = None,
):
    data = dict(extra or {})
    if overrides is not None:
        data["overrides"] = json.dumps(overrides)
    return await client.post(
        f"/api/v1/surveys/{survey_uuid}/responses/import/validate",
        files={"file": (filename, payload, XLSX_TYPE if filename.endswith("xlsx") else "text/csv")},
        data=data,
    )


async def _commit(
    client,
    survey_uuid: str,
    payload: bytes,
    structure_version: str,
    *,
    filename: str = "responses.xlsx",
    overrides: dict[str, Any] | None = None,
    extra: dict[str, str] | None = None,
):
    data = {**(extra or {}), "structure_version": structure_version}
    if overrides is not None:
        data["overrides"] = json.dumps(overrides)
    return await client.post(
        f"/api/v1/surveys/{survey_uuid}/responses/import",
        files={"file": (filename, payload, XLSX_TYPE if filename.endswith("xlsx") else "text/csv")},
        data=data,
    )


async def _import(client, survey_uuid: str, payload: bytes, **kwargs: Any) -> dict[str, Any]:
    preview = await _preview(client, survey_uuid, payload, **kwargs)
    assert preview.status_code == 200, preview.text
    body = preview.json()["data"]
    assert body["can_import"] is True, body
    result = await _commit(
        client, survey_uuid, payload, body["structure_version"], **kwargs
    )
    assert result.status_code == 201, result.text
    return result.json()["data"]


@pytest.fixture(autouse=True)
def _no_cache_side_effects(monkeypatch) -> None:
    async def fake_analytics(survey_id: UUID) -> None:
        return None

    async def fake_prefix(namespace: str, prefix: str = "") -> None:
        return None

    monkeypatch.setattr(response_import_service, "ainvalidate_survey_analytics", fake_analytics)
    monkeypatch.setattr(response_import_service, "cache_invalidate_prefix", fake_prefix)


# --------------------------------------------------------------------- tests


async def test_preview_maps_a_google_forms_export_without_manual_changes(client):
    _grant_import_permission()
    survey_uuid = await _seed_tracer_survey()
    rows = [_row(index) for index in range(6)]

    response = await _preview(client, survey_uuid, _xlsx(rows))

    assert response.status_code == 200, response.text
    assert response.headers["cache-control"].startswith("private, no-store")
    assert "request_id" in response.json()["meta"]
    data = response.json()["data"]
    assert data["file_format"] == "xlsx"
    assert data["sheet_names"] == ["Form Responses 1", "Logs"]
    assert data["sheet"] == "Form Responses 1"
    assert data["value_issues"] == []
    assert data["errors"] == []
    assert data["rows"] == {
        "total": 6,
        "new": 6,
        "will_update": 0,
        "unchanged": 0,
        "merged_in_file": 0,
        "needs_review": 0,
        "invalid": 0,
    }
    assert data["can_import"] is True
    assert data["includes_personal_data"] is False
    assert data["consent_question_id"] is not None
    assert len(data["structure_version"]) == 64
    assert data["warnings"] == []

    columns = {column["header"]: column for column in data["columns"]}
    non_empty = [column for column in data["columns"] if column["status"] != "ignored"]
    assert all(column["status"] == "matched" for column in non_empty)
    assert columns["Timestamp"]["target"] == "submitted_at"

    ids = await _question_ids(survey_uuid)
    assert columns["Current Status:"]["question_id"] == ids[
        "What is your current employment status?"
    ]
    assert columns["Baranggay"]["question_id"] == ids[
        "If you currently live in Pasig City, which barangay do you live in?"
    ]
    category_id = ids["Which category best describes your work in that industry?"]
    assert {
        columns[f"Categories for {name}"]["question_id"]
        for name in ("Education & Training", "Self Employment")
    } == {category_id}

    statement = seed.PEII_SECTIONS_PHASE_1[4]["questions"][0]["text"]
    before = columns[f"{GRID_TITLES[4].format(phase=1, when='BEFORE')} [{statement}]"]
    after = columns[f"{GRID_TITLES[4].format(phase=2, when='AFTER')} [{statement}]"]
    assert before["question_id"] == ids[f"1|{statement}"]
    assert after["question_id"] == ids[f"2|{statement}"]

    # The decoy Logs sheet never reaches the browser.
    assert "Decoy" not in response.text and "decoy@example.com" not in response.text


async def test_imports_converted_answers_then_reimport_and_csv_are_unchanged(client):
    _grant_import_permission()
    survey_uuid = await _seed_tracer_survey()
    rows = [_row(index) for index in range(4)]

    result = await _import(client, survey_uuid, _xlsx(rows))

    assert result == {
        "survey_id": survey_uuid,
        "imported_count": 4,
        "updated_count": 0,
        "unchanged_count": 0,
        "merged_in_file_count": 0,
        "filled_answer_count": 0,
    }
    stored = await _stored_responses(survey_uuid)
    assert len(stored) == 4
    ids = await _question_ids(survey_uuid)
    first = stored[0].answers
    statement = seed.PEII_SECTIONS_PHASE_1[0]["questions"][0]["text"]
    assert first[ids[f"1|{statement}"]] == 1
    assert first[ids["Year Graduated:"]] == "2023"
    assert first[ids["Which role or job title best describes your work?"]] == "Teacher I-VII"
    assert stored[1].answers[
        ids["If you currently live in Pasig City, which barangay do you live in?"]
    ] == "Santa Lucia"
    # 16:31 local at UTC+08:00 is stored as naive UTC.
    assert stored[0].created_at == rows[0]["Timestamp"] - timedelta(hours=8)
    assert all(response.email is None and response.provider is None for response in stored)
    audits = await _audits(survey_uuid, "responses_imported")
    assert len(audits) == 1
    assert audits[0].changes is not None
    assert audits[0].changes["imported_count"] == 4
    assert audits[0].changes["source"] == "xlsx"

    again = await _preview(client, survey_uuid, _xlsx(rows))
    assert again.json()["data"]["rows"]["unchanged"] == 4
    assert again.json()["data"]["rows"]["new"] == 0
    assert again.json()["data"]["can_import"] is False
    assert {match["matched_by"] for match in again.json()["data"]["matches"]} == {"answers"}

    as_csv = await _preview(client, survey_uuid, _csv(rows), filename="responses.csv")
    assert as_csv.status_code == 200, as_csv.text
    assert as_csv.json()["data"]["file_format"] == "csv"
    assert as_csv.json()["data"]["rows"]["unchanged"] == 4

    committed_again = await _commit(
        client, survey_uuid, _xlsx(rows), again.json()["data"]["structure_version"]
    )
    assert committed_again.status_code == 201
    assert committed_again.json()["data"]["imported_count"] == 0
    assert len(await _stored_responses(survey_uuid)) == 4


async def test_full_export_fills_personal_answers_of_anonymized_rows(client):
    _grant_import_permission()
    survey_uuid = await _seed_tracer_survey()
    await _import(client, survey_uuid, _xlsx([_row(index) for index in range(3)]))

    full = _xlsx([_row(index) for index in range(3)], personal=True, collected_email=True)
    preview = await _preview(client, survey_uuid, full)
    data = preview.json()["data"]
    assert data["rows"]["will_update"] == 3
    assert data["rows"]["new"] == 0
    assert data["includes_personal_data"] is True
    assert len(data["personal_data_question_ids"]) == 4
    email_column = next(column for column in data["columns"] if column["header"] == "Email Address")
    assert email_column["target"] == "match_only"
    assert email_column["samples"] == []
    assert {match["action"] for match in data["matches"]} == {"update"}

    result = await _import(client, survey_uuid, full)
    assert result["imported_count"] == 0
    assert result["updated_count"] == 3
    assert result["filled_answer_count"] == 12
    stored = await _stored_responses(survey_uuid)
    assert len(stored) == 3
    ids = await _question_ids(survey_uuid)
    assert stored[0].answers[ids[PERSONAL_HEADERS[0]]] == "Respondent0, Test A."
    updates = await _audits(survey_uuid, "responses_import_updated")
    assert len(updates) == 1
    assert updates[0].changes == {"updated_count": 3, "filled_answer_count": 12}
    assert "Respondent0" not in json.dumps(updates[0].changes)


async def test_same_person_never_gets_a_second_response(client):
    _grant_import_permission()
    survey_uuid = await _seed_tracer_survey()
    await _import(client, survey_uuid, _xlsx([_row(0)], personal=True))

    changed = _row(0, personal=True)
    changed["Timestamp"] = changed["Timestamp"] + timedelta(days=1)
    changed[FEEDBACK_HEADERS[0]] = "A different answer"
    changed[PERSONAL_HEADERS[0]] = "Someone Else, Entirely"
    preview = await _preview(client, survey_uuid, _xlsx([changed], personal=True))
    data = preview.json()["data"]
    assert data["rows"]["new"] == 0
    assert data["rows"]["unchanged"] == 1
    assert data["matches"][0]["matched_by"] == "email"
    assert data["conflict_count"] == 2
    assert {conflict["code"] for conflict in data["conflicts"]} == {"kept_existing"}

    same_phone = _row(5, personal=True)
    same_phone[PERSONAL_HEADERS[1]] = ""
    same_phone[PERSONAL_HEADERS[2]] = ""
    same_phone[PERSONAL_HEADERS[3]] = "+63 917 555 0000"
    preview = await _preview(client, survey_uuid, _xlsx([same_phone], personal=True))
    assert preview.json()["data"]["matches"][0]["matched_by"] == "contact_number"

    same_name = _row(6, personal=True)
    for header in PERSONAL_HEADERS[1:]:
        same_name[header] = ""
    same_name[PERSONAL_HEADERS[0]] = "Test Respondent0"
    preview = await _preview(client, survey_uuid, _xlsx([same_name], personal=True))
    assert preview.json()["data"]["matches"][0]["matched_by"] == "name"

    namesake = _row(7, personal=True)
    namesake[PERSONAL_HEADERS[0]] = "Respondent0, Test A."
    preview = await _preview(client, survey_uuid, _xlsx([namesake], personal=True))
    # Same name but different emails and phone: a different person.
    assert preview.json()["data"]["rows"]["new"] == 1

    assert len(await _stored_responses(survey_uuid)) == 1


async def test_duplicates_inside_one_file_are_merged(client):
    _grant_import_permission()
    survey_uuid = await _seed_tracer_survey()
    original = _row(1)
    exact_copy = dict(original)
    exact_copy["Timestamp"] = original["Timestamp"] + timedelta(minutes=5)
    preview = await _preview(client, survey_uuid, _xlsx([original, exact_copy, _row(2)]))
    data = preview.json()["data"]
    assert data["rows"]["new"] == 2
    assert data["rows"]["merged_in_file"] == 1
    assert data["matches"] == [
        {
            "row": 3,
            "matched_by": "answers",
            "target": "file",
            "target_row": 2,
            "action": "unchanged",
            "filled_answer_count": 0,
            "conflict_count": 0,
        }
    ]


async def test_unknown_choice_needs_review_and_other_override_keeps_text(client):
    _grant_import_permission()
    survey_uuid = await _seed_tracer_survey()
    row = _row(0)
    row["Categories for Education & Training"] = "Robotics Coaching"
    payload = _xlsx([row, _row(1), _row(2)])

    preview = await _preview(client, survey_uuid, payload)
    data = preview.json()["data"]
    assert data["rows"]["needs_review"] == 1
    assert data["rows"]["new"] == 2
    assert data["can_import"] is False
    education = next(
        column
        for column in data["columns"]
        if column["header"] == "Categories for Education & Training"
    )
    assert (education["match"], education["status"]) == ("merged", "check")
    [issue] = data["value_issues"]
    assert issue["raw_value"] == "Robotics Coaching"
    assert issue["suggestion"] == "Other (specify)"
    blocked = await _commit(client, survey_uuid, payload, data["structure_version"])
    assert blocked.status_code == 422
    assert blocked.json()["errors"][-1]["code"] == "unresolved_values"

    overrides = {"values": {issue["question_id"]: {"Robotics Coaching": "Other (specify)"}}}
    result = await _import(client, survey_uuid, payload, overrides=overrides)
    assert result["imported_count"] == 3
    ids = await _question_ids(survey_uuid)
    stored = (await _stored_responses(survey_uuid))[0]
    assert stored.answers[issue["question_id"]] == "Other (specify)"
    assert stored.answers[
        ids["If you selected Other (specify), what category best describes your work?"]
    ] == "Robotics Coaching"


async def test_row_errors_are_reported_and_skipped(client):
    _grant_import_permission()
    survey_uuid = await _seed_tracer_survey()
    declined = _row(1)
    declined[CONSENT_HEADER] = "No"
    two_categories = _row(2)
    two_categories["Categories for Accounting"] = "Audit – External"
    hidden = _row(3)
    hidden["Baranggay"] = "Pinagbuhatan"
    future = _row(5)
    future["Timestamp"] = datetime.now() + timedelta(days=3)
    payload = _xlsx([_row(0), declined, two_categories, hidden, future])

    preview = await _preview(client, survey_uuid, payload)
    data = preview.json()["data"]
    assert data["rows"]["invalid"] == 4
    assert data["rows"]["new"] == 1
    assert data["can_import"] is True
    assert {(error["row"], error["code"]) for error in data["errors"]} == {
        (3, "consent_declined"),
        (4, "multiple_values"),
        (5, "hidden_question"),
        (6, "invalid_submitted_at"),
    }

    result = await _import(client, survey_uuid, payload)
    assert result["imported_count"] == 1
    audits = await _audits(survey_uuid, "responses_imported")
    assert audits[0].changes is not None
    assert audits[0].changes["skipped_invalid_count"] == 4


async def test_column_overrides_and_missing_timestamp(client):
    _grant_import_permission()
    survey_uuid = await _seed_tracer_survey()
    payload = _xlsx([_row(0)])

    workbook = load_workbook(io.BytesIO(payload))
    sheet = workbook["Form Responses 1"]
    extra_column = sheet.max_column + 1
    sheet.cell(row=1, column=extra_column, value="Favorite color")
    sheet.cell(row=2, column=extra_column, value="Blue")
    extended = io.BytesIO()
    workbook.save(extended)
    unmatched = (await _preview(client, survey_uuid, extended.getvalue())).json()["data"]
    assert unmatched["columns"][-1]["status"] == "unmatched"
    assert unmatched["warnings"][0].startswith("1 column(s) with answers match no question")
    assert unmatched["can_import"] is True

    ignored = await _preview(client, survey_uuid, payload, overrides={"columns": {"0": "ignore"}})
    data = ignored.json()["data"]
    assert data["can_import"] is False
    assert data["errors"][0]["code"] == "missing_timestamp"
    assert data["columns"][0]["status"] == "ignored"

    ids = await _question_ids(survey_uuid)
    remapped = await _preview(
        client,
        survey_uuid,
        payload,
        overrides={"columns": {"7": ids["Civil Status:"], "999": "ignore"}},
    )
    data = remapped.json()["data"]
    assert data["columns"][7]["match"] == "manual"
    assert any(error["code"] == "invalid_mapping" for error in data["errors"])

    bad = await _preview(client, survey_uuid, payload, overrides={"columns": "x"})
    assert bad.status_code == 422


async def test_commit_rejects_a_changed_survey_structure(client):
    _grant_import_permission()
    survey_uuid = await _seed_tracer_survey()
    payload = _xlsx([_row(0)])
    response = await _commit(client, survey_uuid, payload, "0" * 64)
    assert response.status_code == 409
    assert response.json()["errors"][0]["code"] == "survey_changed"
    assert await _stored_responses(survey_uuid) == []


async def test_csv_day_first_dates_and_utc_offset(client):
    _grant_import_permission()
    survey_uuid = await _seed_tracer_survey()
    base = (datetime.now() - timedelta(days=40)).replace(
        day=13, hour=10, minute=0, second=0, microsecond=0
    )
    headers, matrix = _matrix([_row(0)])
    matrix[0][0] = base.strftime("%d/%m/%Y %H:%M:%S")
    output = io.StringIO(newline="")
    csv.writer(output).writerows([headers, *matrix])
    payload = output.getvalue().encode("utf-8")

    result = await _import(
        client,
        survey_uuid,
        payload,
        filename="responses.csv",
        extra={"utc_offset_minutes": "0"},
    )
    assert result["imported_count"] == 1
    [stored] = await _stored_responses(survey_uuid)
    assert stored.created_at == base


async def test_rejects_unreadable_oversized_and_unauthorized_uploads(client, monkeypatch):
    _grant_import_permission()
    survey_uuid = await _seed_tracer_survey()

    broken = await _preview(client, survey_uuid, b"PK\x03\x04not a workbook")
    assert broken.status_code == 400

    not_utf8 = await _preview(client, survey_uuid, "Timestamp\n\xe9".encode("latin-1"),
                              filename="responses.csv")
    assert not_utf8.status_code == 400

    monkeypatch.setattr("utils.spreadsheet.MAX_UNCOMPRESSED_XLSX_BYTES", 10)
    bomb = await _preview(client, survey_uuid, _xlsx([_row(0)]))
    assert bomb.status_code == 400

    monkeypatch.setattr(response_import_service, "MAX_IMPORT_BYTES", 10)
    too_big = await _preview(client, survey_uuid, b"Timestamp\n" * 10, filename="a.csv")
    assert too_big.status_code == 413

    template = await client.get(f"/api/v1/surveys/{survey_uuid}/responses/import-template")
    assert template.status_code in {404, 405}

    _grant_permissions("surveys.manage")
    forbidden = await _preview(client, survey_uuid, b"Timestamp\n", filename="a.csv")
    assert forbidden.status_code == 403
