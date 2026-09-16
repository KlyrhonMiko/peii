from __future__ import annotations

import csv
import io
from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest
from sqlmodel import col, select

from core.database import get_async_session
from core.deps import Principal, get_current_principal
from main import app
from models.audit_log import AuditLog
from models.survey import Survey
from models.survey_response import SurveyResponse
from services import response_import_service

pytestmark = pytest.mark.anyio


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


async def _create_survey(client, question_specs: list[dict[str, object]]):
    survey_response = await client.post("/api/v1/surveys/", json={"title": "Import Survey"})
    assert survey_response.status_code == 201
    survey = survey_response.json()["data"]
    section_response = await client.post(
        f"/api/v1/surveys/{survey['id']}/sections/",
        json={"title": "Responses"},
    )
    assert section_response.status_code == 201
    section_id = section_response.json()["data"]["id"]
    question_ids: list[str] = []
    for spec in question_specs:
        response = await client.post(
            f"/api/v1/surveys/{survey['id']}/questions/",
            json={**spec, "section_id": section_id},
        )
        assert response.status_code == 201
        question_ids.append(response.json()["data"]["id"])
    return survey, question_ids


def _csv_payload(headers: list[str], rows: list[list[str]]) -> bytes:
    output = io.StringIO(newline="")
    writer = csv.writer(output, lineterminator="\r\n")
    writer.writerow(headers)
    writer.writerows(rows)
    return b"\xef\xbb\xbf" + output.getvalue().encode("utf-8")


async def _template_headers(client, survey_uuid: str) -> list[str]:
    response = await client.get(
        f"/api/v1/surveys/{survey_uuid}/responses/import-template"
    )
    assert response.status_code == 200
    assert response.content.startswith(b"\xef\xbb\xbf")
    assert response.content.endswith(b"\r\n")
    return next(csv.reader(io.StringIO(response.content.decode("utf-8-sig"), newline="")))


async def _stored_survey(survey_uuid: str) -> Survey:
    session_generator = app.dependency_overrides[get_async_session]()
    session = await anext(session_generator)
    try:
        return (
            await session.exec(
                select(Survey).where(Survey.id == UUID(survey_uuid))
            )
        ).one()
    finally:
        await session_generator.aclose()


async def _stored_responses(survey_uuid: str) -> list[SurveyResponse]:
    session_generator = app.dependency_overrides[get_async_session]()
    session = await anext(session_generator)
    try:
        return list(
            (
                await session.exec(
                    select(SurveyResponse).where(
                        SurveyResponse.survey_id == UUID(survey_uuid)
                    )
                )
            ).all()
        )
    finally:
        await session_generator.aclose()


async def _import_audits(survey_business_id: str) -> list[AuditLog]:
    session_generator = app.dependency_overrides[get_async_session]()
    session = await anext(session_generator)
    try:
        return list(
            (
                await session.exec(
                    select(AuditLog).where(
                        col(AuditLog.resource_type) == "survey",
                        col(AuditLog.resource_id) == survey_business_id,
                        col(AuditLog.action) == "responses_imported",
                    )
                )
            ).all()
        )
    finally:
        await session_generator.aclose()


async def test_downloads_exact_survey_specific_csv_template(client):
    _grant_import_permission()
    survey, question_ids = await _create_survey(
        client,
        [
            {
                "question_text": "Name",
                "question_type": "text",
            },
            {
                "question_text": "Status",
                "question_type": "single_choice",
                "options": ["Employed", "Seeking work"],
            },
        ],
    )

    response = await client.get(
        f"/api/v1/surveys/{survey['id']}/responses/import-template"
    )
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert "attachment" in response.headers["content-disposition"]
    headers = next(csv.reader(io.StringIO(response.content.decode("utf-8-sig"), newline="")))
    assert headers == [
        "submitted_at",
        "Q001 | Responses | Name",
        "Q002 | Responses | Status",
    ]
    assert not any(question_id in header for question_id in question_ids for header in headers)


async def test_template_numbers_repeated_question_text_without_exposing_ids(client):
    _grant_import_permission()
    survey, question_ids = await _create_survey(
        client,
        [
            {"question_text": "How was it?", "question_type": "text"},
            {"question_text": "How was it?", "question_type": "text"},
        ],
    )
    headers = await _template_headers(client, survey["id"])
    assert headers == [
        "submitted_at",
        "Q001 | Responses | How was it?",
        "Q002 | Responses | How was it?",
    ]
    assert not any(question_id in header for question_id in question_ids for header in headers)


async def test_validates_normalizes_and_atomically_imports_answers(client, monkeypatch):
    _grant_import_permission(
        "survey_responses.read_raw",
        "survey_responses.read_aggregates",
    )
    analytics_invalidations: list[UUID] = []
    cache_invalidations: list[tuple[str, str]] = []

    async def fake_analytics_invalidation(survey_id: UUID) -> None:
        analytics_invalidations.append(survey_id)

    async def fake_cache_invalidation(namespace: str, prefix: str = "") -> None:
        cache_invalidations.append((namespace, prefix))

    monkeypatch.setattr(
        response_import_service,
        "ainvalidate_survey_analytics",
        fake_analytics_invalidation,
    )
    monkeypatch.setattr(
        response_import_service,
        "cache_invalidate_prefix",
        fake_cache_invalidation,
    )
    survey, question_ids = await _create_survey(
        client,
        [
            {
                "question_text": "Name",
                "question_type": "text",
            },
            {
                "question_text": "Status",
                "question_type": "single_choice",
                "options": ["Employed", "Seeking work"],
            },
            {
                "question_text": "Score",
                "question_type": "scale",
                "config": {"min": 1, "max": 5},
            },
            {
                "question_text": "Remote",
                "question_type": "boolean",
                "is_required": False,
            },
            {
                "question_text": "Tags",
                "question_type": "multiple_choice",
                "options": ["A", "B"],
                "is_required": False,
            },
        ],
    )
    headers = await _template_headers(client, survey["id"])
    timestamp = (datetime.now(UTC) - timedelta(days=1)).isoformat()
    payload = _csv_payload(
        headers,
        [[timestamp, "", "Employed", "4", "TRUE", '["A", "B"]']],
    )

    validation = await client.post(
        f"/api/v1/surveys/{survey['id']}/responses/import/validate",
        content=payload,
        headers={"Content-Type": "text/csv"},
    )
    assert validation.status_code == 200
    assert validation.json()["data"]["valid"] is True
    assert validation.json()["data"]["row_count"] == 1
    assert validation.json()["data"]["errors"] == []

    imported = await client.post(
        f"/api/v1/surveys/{survey['id']}/responses/import",
        content=payload,
        headers={"Content-Type": "text/csv"},
    )
    assert imported.status_code == 201
    assert imported.json()["data"]["imported_count"] == 1
    assert analytics_invalidations == [UUID(survey["id"])]
    assert cache_invalidations == [("surveys", "")]

    responses = await client.get(f"/api/v1/surveys/{survey['id']}/responses/")
    assert responses.status_code == 200
    answers = responses.json()["data"][0]["answers"]
    assert question_ids[0] not in answers
    assert answers[question_ids[1]] == "Employed"
    assert answers[question_ids[2]] == 4
    assert answers[question_ids[3]] is True
    assert answers[question_ids[4]] == ["A", "B"]

    stored_responses = await _stored_responses(survey["id"])
    assert len(stored_responses) == 1
    stored_response = stored_responses[0]
    assert stored_response.consent_version is None
    assert stored_response.consented_at is None
    assert stored_response.provider is None
    assert stored_response.auth_user_id is None
    assert stored_response.respondent_key_digest is None
    assert stored_response.email is None
    assert stored_response.display_name is None
    assert stored_response.email_verified is None
    assert stored_response.identity_captured_at is None
    assert stored_response.idempotency_key is None

    aggregate = await client.get(f"/api/v1/surveys/{survey['id']}/responses/aggregates")
    assert aggregate.status_code == 200
    aggregate_by_type = {
        item["question_type"]: item for item in aggregate.json()["data"]
    }
    assert {
        cell["value"]: cell["count"]
        for cell in aggregate_by_type["single_choice"]["cells"]
    } == {"Employed": 1, "Seeking work": 0}
    assert {
        cell["value"]: cell["count"]
        for cell in aggregate_by_type["scale"]["cells"]
    }[4] == 1

    repeated = await client.post(
        f"/api/v1/surveys/{survey['id']}/responses/import",
        content=payload,
        headers={"Content-Type": "text/csv"},
    )
    assert repeated.status_code == 201
    assert repeated.json()["data"]["imported_count"] == 1
    responses = await client.get(f"/api/v1/surveys/{survey['id']}/responses/")
    assert len(responses.json()["data"]) == 2
    imported_created_at = datetime.fromisoformat(responses.json()["data"][0]["created_at"])
    assert imported_created_at == datetime.fromisoformat(timestamp.replace("+00:00", ""))
    assert (await _stored_survey(survey["id"])).responses_count == 2
    audits = await _import_audits(survey["survey_id"])
    assert len(audits) == 2
    assert all(audit.changes == {"imported_count": 1, "source": "csv"} for audit in audits)
    assert all("answers" not in (audit.changes or {}) for audit in audits)
    assert all("Employed" not in str(audit.changes) for audit in audits)


async def test_invalid_row_prevents_all_rows_from_being_imported(client):
    _grant_import_permission("survey_responses.read_raw")
    survey, _question_ids = await _create_survey(
        client,
        [
            {
                "question_text": "Status",
                "question_type": "single_choice",
                "options": ["Employed", "Seeking work"],
            }
        ],
    )
    headers = await _template_headers(client, survey["id"])
    timestamp = (datetime.now(UTC) - timedelta(days=1)).isoformat()
    payload = _csv_payload(
        headers,
        [
            [timestamp, "Employed"],
            [timestamp, "Not a configured choice"],
        ],
    )

    validation = await client.post(
        f"/api/v1/surveys/{survey['id']}/responses/import/validate",
        content=payload,
        headers={"Content-Type": "text/csv"},
    )
    assert validation.status_code == 200
    body = validation.json()["data"]
    assert body["valid"] is False
    assert body["row_count"] == 2
    assert body["errors"][0]["row"] == 3
    assert body["errors"][0]["code"] == "invalid_answer"

    imported = await client.post(
        f"/api/v1/surveys/{survey['id']}/responses/import",
        content=payload,
        headers={"Content-Type": "text/csv"},
    )
    assert imported.status_code == 422
    assert imported.json()["errors"][0]["row"] == 3
    responses = await client.get(f"/api/v1/surveys/{survey['id']}/responses/")
    assert responses.status_code == 200
    assert responses.json()["data"] == []
    assert (await _stored_survey(survey["id"])).responses_count == 0


async def test_historical_rows_may_leave_required_questions_blank(client):
    _grant_import_permission("survey_responses.read_raw")
    survey, question_ids = await _create_survey(
        client,
        [
            {"question_text": "Recorded answer", "question_type": "text"},
            {"question_text": "Later-added answer", "question_type": "text"},
        ],
    )
    headers = await _template_headers(client, survey["id"])
    timestamp = (datetime.now(UTC) - timedelta(days=1)).isoformat()
    response = await client.post(
        f"/api/v1/surveys/{survey['id']}/responses/import",
        content=_csv_payload(headers, [[timestamp, "Historical", ""]]),
        headers={"Content-Type": "text/csv"},
    )
    assert response.status_code == 201
    stored = await client.get(f"/api/v1/surveys/{survey['id']}/responses/")
    assert stored.status_code == 200
    assert stored.json()["data"][0]["answers"] == {question_ids[0]: "Historical"}


async def test_import_rejects_more_than_one_thousand_rows(client):
    _grant_import_permission()
    survey, _question_ids = await _create_survey(
        client,
        [{"question_text": "Status", "question_type": "single_choice", "options": ["A"]}],
    )
    headers = await _template_headers(client, survey["id"])
    timestamp = (datetime.now(UTC) - timedelta(days=1)).isoformat()
    response = await client.post(
        f"/api/v1/surveys/{survey['id']}/responses/import/validate",
        content=_csv_payload(headers, [[timestamp, "A"]] * 1001),
        headers={"Content-Type": "text/csv"},
    )
    assert response.status_code == 200
    assert response.json()["data"]["valid"] is False
    assert response.json()["data"]["errors"][0]["code"] == "too_many_rows"


async def test_import_rejects_non_template_headers_and_invalid_timestamp(client):
    _grant_import_permission()
    survey, _question_ids = await _create_survey(
        client,
        [{"question_text": "Comment", "question_type": "text"}],
    )
    payload = _csv_payload(
        ["submitted_at", "Comment"],
        [["2026-01-01T00:00:00", "historical"]],
    )
    response = await client.post(
        f"/api/v1/surveys/{survey['id']}/responses/import/validate",
        content=payload,
        headers={"Content-Type": "text/csv"},
    )
    assert response.status_code == 200
    assert response.json()["data"]["valid"] is False
    assert response.json()["data"]["errors"][0]["code"] == "invalid_header"


async def test_import_is_denied_without_the_dedicated_permission(client):
    survey, _question_ids = await _create_survey(
        client,
        [{"question_text": "Comment", "question_type": "text"}],
    )
    _grant_permissions("surveys.manage")
    response = await client.get(
        f"/api/v1/surveys/{survey['id']}/responses/import-template"
    )
    assert response.status_code == 403


async def test_import_rejects_template_surveys(client):
    _grant_permissions("surveys.manage")
    survey_response = await client.post(
        "/api/v1/surveys/",
        json={"title": "Questionnaire Template", "is_template": True},
    )
    assert survey_response.status_code == 201
    survey = survey_response.json()["data"]
    _grant_import_permission()
    response = await client.get(
        f"/api/v1/surveys/{survey['id']}/responses/import-template"
    )
    assert response.status_code == 409
    assert "templates" in response.json()["message"]


async def test_import_rejects_surveys_without_active_questions(client):
    _grant_permissions("surveys.manage")
    survey_response = await client.post(
        "/api/v1/surveys/",
        json={"title": "Empty Import Survey"},
    )
    assert survey_response.status_code == 201
    survey = survey_response.json()["data"]
    _grant_import_permission()
    response = await client.get(
        f"/api/v1/surveys/{survey['id']}/responses/import-template"
    )
    assert response.status_code == 409
    assert "no active questions" in response.json()["message"]


async def test_import_rejects_archived_surveys(client):
    _grant_import_permission()
    survey, _question_ids = await _create_survey(
        client,
        [{"question_text": "Comment", "question_type": "text"}],
    )
    archived = await client.request(
        "DELETE",
        f"/api/v1/surveys/{survey['survey_id']}",
        json={},
    )
    assert archived.status_code == 200
    response = await client.get(
        f"/api/v1/surveys/{survey['id']}/responses/import-template"
    )
    assert response.status_code == 404


async def test_import_rejects_retention_expired_timestamp(client):
    _grant_import_permission()
    survey_response = await client.post(
        "/api/v1/surveys/",
        json={
            "title": "Short Retention Import",
            "retention_days": 1,
        },
    )
    assert survey_response.status_code == 201
    survey = survey_response.json()["data"]
    section_response = await client.post(
        f"/api/v1/surveys/{survey['id']}/sections/",
        json={"title": "Responses"},
    )
    question_response = await client.post(
        f"/api/v1/surveys/{survey['id']}/questions/",
        json={
            "section_id": section_response.json()["data"]["id"],
            "question_text": "Comment",
            "question_type": "text",
        },
    )
    assert question_response.status_code == 201
    headers = await _template_headers(client, survey["id"])
    expired = (datetime.now(UTC) - timedelta(days=2)).isoformat()
    response = await client.post(
        f"/api/v1/surveys/{survey['id']}/responses/import/validate",
        content=_csv_payload(headers, [[expired, "historical"]]),
        headers={"Content-Type": "text/csv"},
    )
    assert response.status_code == 200
    assert response.json()["data"]["errors"][0]["code"] == "invalid_submitted_at"


async def test_import_rejects_a_different_surveys_headers(client):
    _grant_import_permission()
    first, _first_questions = await _create_survey(
        client,
        [{"question_text": "First survey answer", "question_type": "text"}],
    )
    second, _second_questions = await _create_survey(
        client,
        [{"question_text": "Second survey answer", "question_type": "text"}],
    )
    second_headers = await _template_headers(client, second["id"])
    timestamp = (datetime.now(UTC) - timedelta(days=1)).isoformat()
    response = await client.post(
        f"/api/v1/surveys/{first['id']}/responses/import/validate",
        content=_csv_payload(second_headers, [[timestamp, "wrong survey"]]),
        headers={"Content-Type": "text/csv"},
    )
    assert response.status_code == 200
    assert response.json()["data"]["valid"] is False
    assert response.json()["data"]["errors"][0]["code"] == "invalid_header"


async def test_import_rejects_hidden_conditional_answer(client):
    _grant_import_permission()
    survey, _question_ids = await _create_survey(
        client,
        [
            {
                "question_text": "Industry",
                "question_type": "single_choice",
                "options": ["Technology", "Other"],
                "config": {"question_key": "industry"},
            },
            {
                "question_text": "Industry category",
                "question_type": "single_choice",
                "options": ["Software", "Unlisted"],
                "config": {
                    "question_key": "industry_category",
                    "options_by_answer": {
                        "question_key": "industry",
                        "choices": {"Technology": ["Software"]},
                    },
                },
            },
        ],
    )
    headers = await _template_headers(client, survey["id"])
    timestamp = (datetime.now(UTC) - timedelta(days=1)).isoformat()
    response = await client.post(
        f"/api/v1/surveys/{survey['id']}/responses/import/validate",
        content=_csv_payload(headers, [[timestamp, "Other", "Software"]]),
        headers={"Content-Type": "text/csv"},
    )
    assert response.status_code == 200
    errors = response.json()["data"]["errors"]
    assert any(error["code"] == "hidden_question" for error in errors)
