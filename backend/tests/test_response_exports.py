import csv
import io
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any, cast
from uuid import UUID, uuid4

import pytest
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from core.deps import Principal, get_current_principal
from core.exceptions import AppError
from main import app
from models.audit_log import AuditLog
from models.survey_response import SurveyResponse
from services import response_export_service

pytestmark = pytest.mark.anyio


async def _create_export_survey(client):
    survey_response = await client.post(
        "/api/v1/surveys/", json={"title": f"Export {uuid4()}"}
    )
    survey = survey_response.json()["data"]
    section = await client.post(
        f"/api/v1/surveys/{survey['id']}/sections/", json={"title": "Main"}
    )
    question = await client.post(
        f"/api/v1/surveys/{survey['id']}/questions/",
        json={
            "question_text": "Export question",
            "question_type": "text",
            "section_id": section.json()["data"]["id"],
        },
    )
    activated = await client.patch(
        f"/api/v1/surveys/{survey['survey_id']}", json={"status": "Active"}
    )
    assert activated.status_code == 200
    distribution = await client.post(
        f"/api/v1/surveys/{survey['id']}/distributions/",
        json={"expires_at": (datetime.now(UTC) + timedelta(days=29)).isoformat()},
    )
    return survey, question.json()["data"]["id"], distribution.json()["data"]["token"]


async def _submit(client, token: str, question_id: str, answer: str):
    return await client.post(
        f"/api/v1/survey/{token}/respond",
        json={
            "answers": {question_id: answer},
            "consent": {"accepted": True, "version": "2026-08-25"},
            "withdrawal_code": secrets.token_urlsafe(32),
        },
        headers={"Idempotency-Key": str(uuid4())},
    )


def _override_permissions(*permissions: str) -> None:
    async def override() -> Principal:
        from models.user import User

        return Principal(
            user=User(
                id=UUID("00000000-0000-0000-0000-000000000001"),
                user_id="USER-TESTADMIN",
                auth_user_id=UUID("00000000-0000-0000-0000-000000000002"),
                email="admin@example.com",
                username="admin",
                first_name="Test",
                last_name="Admin",
            ),
            permissions=frozenset(permissions),
            access_token="test",
        )

    app.dependency_overrides[get_current_principal] = override


async def _session() -> tuple[AsyncSession, Any]:
    from core.database import get_async_session

    generator = app.dependency_overrides[get_async_session]()
    return await anext(generator), generator


async def test_export_permission_headers_and_correlated_start_success_audits(client):
    survey, question_id, token = await _create_export_survey(client)
    assert (await _submit(client, token, question_id, "answer")).status_code == 201
    _override_permissions("surveys.manage")
    forbidden = await client.get(f"/api/v1/surveys/{survey['id']}/responses/export")
    assert forbidden.status_code == 403

    _override_permissions("survey_responses.export")
    exported = await client.get(f"/api/v1/surveys/{survey['id']}/responses/export")
    assert exported.status_code == 200
    assert UUID(exported.headers["x-export-id"])
    assert exported.headers["cache-control"] == "private, no-store, max-age=0"
    assert exported.headers["pragma"] == "no-cache"
    assert exported.headers["expires"] == "0"
    assert exported.headers["x-content-type-options"] == "nosniff"
    assert exported.headers["referrer-policy"] == "no-referrer"
    assert exported.headers["content-security-policy"] == "sandbox"
    assert exported.headers["cross-origin-resource-policy"] == "same-origin"
    assert exported.headers["x-accel-buffering"] == "no"

    session, generator = await _session()
    try:
        audits = (
            await session.exec(
                select(AuditLog).where(
                    col(AuditLog.resource_id) == survey["survey_id"],
                    col(AuditLog.action).in_(["export_started", "export"]),
                )
            )
        ).all()
    finally:
        await generator.aclose()
    assert {audit.action for audit in audits} == {"export_started", "export"}
    for audit in audits:
        assert audit.changes is not None
        assert audit.changes["export_id"] == exported.headers["x-export-id"]
        assert set(audit.changes) <= {"export_id", "response_count", "answer_row_count"}


async def test_export_has_stable_long_form_columns_and_safety(client):
    survey, question_id, token = await _create_export_survey(client)
    response = await _submit(client, token, question_id, "=SUM(A1)\x00")
    assert response.status_code == 201
    exported = await client.get(f"/api/v1/surveys/{survey['id']}/responses/export")
    rows = list(csv.DictReader(io.StringIO(exported.text)))
    assert list(rows[0]) == [
        "response_id",
        "submitted_at",
        "question_id",
        "question_text",
        "question_type",
        "answer_json",
    ]
    assert rows[0]["answer_json"] == '"=SUM(A1)\\u0000"'
    assert "\x00" not in exported.text


async def test_export_excludes_expired_deleted_and_allows_archived_access(client):
    survey, question_id, token = await _create_export_survey(client)
    for answer in ("deleted", "expired", "live"):
        assert (await _submit(client, token, question_id, answer)).status_code == 201
    session, generator = await _session()
    try:
        responses = list((await session.exec(select(SurveyResponse))).all())
        for response in responses:
            answer = cast(str, response.answers[question_id])
            if answer == "deleted":
                response.is_deleted = True
            elif answer == "expired":
                response.retention_expires_at = datetime(2020, 1, 1)
            session.add(response)
        await session.commit()
    finally:
        await generator.aclose()
    assert (
        await client.request("DELETE", f"/api/v1/surveys/{survey['survey_id']}", json={})
    ).status_code == 200
    exported = await client.get(f"/api/v1/surveys/{survey['id']}/responses/export")
    assert exported.status_code == 200
    assert "live" in exported.text
    assert "deleted" not in exported.text
    assert "expired" not in exported.text


async def test_export_cap_is_preflighted_before_stream_or_audit(monkeypatch):
    class FakeSession:
        stream_called = False

        async def stream(self, _statement):
            self.stream_called = True
            raise AssertionError("stream must not start after a cap failure")

    async def resolve(_session, _survey_id, **_kwargs):
        return type("Survey", (), {"survey_id": "SURV-1"})()

    async def count(_session, _survey_id, _now):
        return 10001

    monkeypatch.setattr(response_export_service, "resolve_survey", resolve)
    monkeypatch.setattr(response_export_service, "_count_exportable_responses", count)
    with pytest.raises(AppError) as error:
        await response_export_service.prepare_response_export(
            cast(AsyncSession, FakeSession()),
            uuid4(),
            actor_id=uuid4(),
        )
    assert error.value.status_code == 413


async def test_export_does_not_stream_responses_inserted_after_preflight(monkeypatch):
    survey_id = uuid4()
    question_id = uuid4()
    initial_response_id = uuid4()
    inserted_response_id = uuid4()
    audits: list[Any] = []

    class FakeResult:
        def __init__(self, rows):
            self.rows = rows
            self.closed = False

        async def partitions(self, _size: int):
            yield self.rows

        async def close(self):
            self.closed = True

    class FakeSession:
        def __init__(self):
            self.rows = [
                (
                    initial_response_id,
                    datetime(2026, 1, 1),
                    {str(question_id): "initial"},
                )
            ]
            self.result = None
            self.statement = None

        async def stream(self, statement):
            self.statement = statement
            # Model a response inserted after the preflight count but before the
            # deferred database stream is opened.
            self.rows.append(
                (
                    inserted_response_id,
                    datetime(2026, 1, 2),
                    {str(question_id): "inserted"},
                )
            )
            self.result = FakeResult(self.rows)
            return self.result

    async def resolve(_session, _survey_id, **_kwargs):
        return type("Survey", (), {"survey_id": "SURV-1"})()

    async def count(_session, _survey_id, _now):
        return 1

    async def questions(_session, _survey_id):
        return [
            type(
                "Question",
                (),
                {
                    "id": question_id,
                    "question_text": "Question",
                    "question_type": "text",
                },
            )()
        ]

    async def audit(_session, events):
        audits.extend(events)

    monkeypatch.setattr(response_export_service, "resolve_survey", resolve)
    monkeypatch.setattr(response_export_service, "_count_exportable_responses", count)
    monkeypatch.setattr(response_export_service, "_load_export_questions", questions)
    monkeypatch.setattr(response_export_service, "commit_with_audit", audit)
    session = FakeSession()
    prepared = await response_export_service.prepare_response_export(
        cast(AsyncSession, session), survey_id, actor_id=uuid4()
    )
    chunks = [chunk async for chunk in prepared.content]
    rows = list(csv.DictReader(io.StringIO(b"".join(chunks).decode("utf-8"))))

    assert len(rows) == 1
    assert rows[0]["response_id"] == str(initial_response_id)
    assert str(inserted_response_id) not in b"".join(chunks).decode("utf-8")
    assert [event.action for event in audits] == ["export_started", "export"]
    assert all(event.changes["response_count"] == 1 for event in audits)
    assert audits[-1].changes["answer_row_count"] == 1


async def test_export_stream_selects_columns_and_yields_bounded_bytes(monkeypatch):
    survey_id = uuid4()
    response_id = uuid4()
    question_id = uuid4()
    audits: list[Any] = []

    class FakeResult:
        closed = False

        async def partitions(self, size: int):
            assert size == response_export_service.EXPORT_PARTITION_SIZE
            yield [(response_id, datetime(2026, 1, 1), {str(question_id): "answer"})]

        async def close(self):
            self.closed = True

    class FakeSession:
        def __init__(self):
            self.result = FakeResult()
            self.statement = None

        async def stream(self, statement):
            self.statement = statement
            return self.result

    async def resolve(_session, _survey_id, **_kwargs):
        return type("Survey", (), {"survey_id": "SURV-1"})()

    async def count(_session, _survey_id, _now):
        return 1

    async def questions(_session, _survey_id):
        return [
            type(
                "Question",
                (),
                {
                    "id": question_id,
                    "question_text": "Question",
                    "question_type": "text",
                },
            )()
        ]

    async def audit(_session, events):
        audits.extend(events)

    monkeypatch.setattr(response_export_service, "resolve_survey", resolve)
    monkeypatch.setattr(response_export_service, "_count_exportable_responses", count)
    monkeypatch.setattr(response_export_service, "_load_export_questions", questions)
    monkeypatch.setattr(response_export_service, "commit_with_audit", audit)
    session = FakeSession()
    prepared = await response_export_service.prepare_response_export(
        cast(AsyncSession, session), survey_id, actor_id=uuid4()
    )
    chunks = [chunk async for chunk in prepared.content]
    assert chunks and max(map(len, chunks)) <= response_export_service.EXPORT_CHUNK_SIZE
    assert session.result.closed is True
    assert session.statement is not None
    assert [column.key for column in session.statement.selected_columns] == [
        "id",
        "created_at",
        "answers",
    ]
    assert all(event.changes and "export_id" in event.changes for event in audits)
    assert [event.action for event in audits] == ["export_started", "export"]
