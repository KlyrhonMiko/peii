import secrets
import uuid
from uuid import UUID, uuid4

import pytest
from sqlmodel import select

from core.database import get_async_session
from core.deps import Principal, get_current_principal
from main import app
from models.false_positive_feedback import FalsePositiveFeedback
from models.survey_response import SurveyResponse

pytestmark = pytest.mark.anyio
CONSENT = {"accepted": True, "version": "2026-08-25"}
ADMIN_ID = UUID("00000000-0000-0000-0000-000000000001")


@pytest.fixture(autouse=True)
def _no_ml_inference(monkeypatch):
    """Keep tests deterministic: never initialize the local ML pipeline."""
    from services.ml_service import FeedbackAnalyzer


    class _DummyAnalyzer:
        def register_false_positive(self, text: str) -> None:
            return None

    monkeypatch.setattr(
        FeedbackAnalyzer, "get_instance", classmethod(lambda cls: _DummyAnalyzer())
    )


def _override_permissions(*permissions: str) -> None:
    async def override() -> Principal:
        from models.user import User

        return Principal(
            user=User(
                id=ADMIN_ID,
                user_id="USER-FP",
                auth_user_id=UUID("00000000-0000-0000-0000-000000000002"),
                email="fp@example.com",
                username="fp",
                first_name="FP",
                last_name="Tester",
            ),
            permissions=frozenset(permissions),
            access_token="test",
        )

    app.dependency_overrides[get_current_principal] = override


async def _create_survey_with_text_question(client) -> tuple[dict, str]:
    survey_response = await client.post(
        "/api/v1/surveys/", json={"title": f"FP Survey {uuid4()}"}
    )
    survey = survey_response.json()["data"]
    section_response = await client.post(
        f"/api/v1/surveys/{survey['id']}/sections/", json={"title": "Main"}
    )
    question_response = await client.post(
        f"/api/v1/surveys/{survey['id']}/questions/",
        json={
            "section_id": section_response.json()["data"]["id"],
            "question_text": "What could be improved?",
            "question_type": "text",
        },
    )
    question_id = question_response.json()["data"]["id"]
    activated = await client.patch(
        f"/api/v1/surveys/{survey['survey_id']}", json={"status": "Active"}
    )
    assert activated.status_code == 200
    return survey, question_id


async def _stored_response(response_id: UUID | None = None) -> SurveyResponse:
    generator = app.dependency_overrides[get_async_session]()
    session = await anext(generator)
    try:
        statement = select(SurveyResponse)
        if response_id is not None:
            statement = statement.where(SurveyResponse.id == response_id)
        result = await session.exec(statement)
        return result.one()
    finally:
        await generator.aclose()


async def _submit_text_response(client, token: str, question_id: str) -> UUID:
    submitted = await client.post(
        f"/api/v1/survey/{token}/respond",
        json={
            "answers": {question_id: "The curriculum could focus more on employability."},
            "consent": CONSENT,
            "withdrawal_code": secrets.token_urlsafe(32),
        },
        headers={"Idempotency-Key": str(uuid.uuid4())},
    )
    assert submitted.status_code == 201, submitted.text
    return (await _stored_response()).id


async def _set_ml_sentiments(response_id: UUID, question_id: str, value) -> None:
    generator = app.dependency_overrides[get_async_session]()
    session = await anext(generator)
    try:
        result = await session.exec(
            select(SurveyResponse).where(SurveyResponse.id == response_id)
        )
        response = result.first()
        assert response is not None
        response.ml_sentiments = {question_id: value}
        session.add(response)
        await session.commit()
    finally:
        await generator.aclose()


async def _feedback_rows() -> list[FalsePositiveFeedback]:
    generator = app.dependency_overrides[get_async_session]()
    session = await anext(generator)
    try:
        result = await session.exec(select(FalsePositiveFeedback))
        return list(result.all())
    finally:
        await generator.aclose()


async def _audit_events(resource_type: str) -> list:
    generator = app.dependency_overrides[get_async_session]()
    session = await anext(generator)
    try:
        from models.audit_log import AuditLog

        result = await session.exec(
            select(AuditLog).where(AuditLog.resource_type == resource_type)
        )
        return list(result.all())
    finally:
        await generator.aclose()


async def test_false_positive_requires_surveys_manage(client):
    survey, question_id = await _create_survey_with_text_question(client)
    response_id = await _submit_text_response(client, survey["survey_id"], question_id)

    _override_permissions("survey_responses.read_aggregates")
    result = await client.post(
        f"/api/v1/surveys/{survey['id']}/responses/peii/false-positive",
        json={"response_id": str(response_id), "question_id": question_id},
    )
    assert result.status_code == 403


async def test_false_positive_rejects_unknown_response(client):
    survey, _question_id = await _create_survey_with_text_question(client)

    _override_permissions("surveys.manage")
    result = await client.post(
        f"/api/v1/surveys/{survey['id']}/responses/peii/false-positive",
        json={
            "response_id": str(uuid.uuid4()),
            "question_id": str(uuid.uuid4()),
        },
    )
    assert result.status_code == 404
    assert result.json()["message"] == "Response not found."


async def test_false_positive_creates_feedback_and_audit(client):
    survey, question_id = await _create_survey_with_text_question(client)
    response_id = await _submit_text_response(client, survey["survey_id"], question_id)

    _override_permissions("surveys.manage")
    result = await client.post(
        f"/api/v1/surveys/{survey['id']}/responses/peii/false-positive",
        json={"response_id": str(response_id), "question_id": question_id},
    )
    assert result.status_code == 200
    body = result.json()
    assert body["data"] == {"status": "success"}
    assert body["meta"]["request_id"]

    rows = await _feedback_rows()
    assert len(rows) == 1
    feedback = rows[0]
    assert feedback.response_id == response_id
    assert feedback.question_id == UUID(question_id)
    assert feedback.polarity_override is None
    assert feedback.performed_by == ADMIN_ID

    logs = await _audit_events("false_positive_feedback")
    assert len(logs) == 1
    assert logs[0].action == "create"
    assert logs[0].performed_by == ADMIN_ID
    assert logs[0].resource_id == str(feedback.id)


async def test_false_positive_flips_existing_sentiments(client):
    survey, question_id = await _create_survey_with_text_question(client)
    response_id = await _submit_text_response(client, survey["survey_id"], question_id)
    original = [["Employability and Economic Mobility", 0.5]]
    await _set_ml_sentiments(response_id, question_id, original)

    _override_permissions("surveys.manage")
    result = await client.post(
        f"/api/v1/surveys/{survey['id']}/responses/peii/false-positive",
        json={"response_id": str(response_id), "question_id": question_id},
    )
    assert result.status_code == 200

    response = await _stored_response(response_id)
    assert response.ml_sentiments is not None
    assert response.ml_sentiments[question_id] == [
        ["Employability and Economic Mobility", -0.5]
    ]

    logs = await _audit_events("survey_response")
    assert any(log.action == "update" and log.performed_by == ADMIN_ID for log in logs)


async def test_false_positive_forces_polarity_override(client):
    survey, question_id = await _create_survey_with_text_question(client)
    response_id = await _submit_text_response(client, survey["survey_id"], question_id)
    original = [
        ["Employability and Economic Mobility", 0.5],
        ["Civic Engagement and Community Contribution", -0.5],
    ]
    await _set_ml_sentiments(response_id, question_id, original)

    _override_permissions("surveys.manage")
    result = await client.post(
        f"/api/v1/surveys/{survey['id']}/responses/peii/false-positive",
        json={
            "response_id": str(response_id),
            "question_id": question_id,
            "polarity_override": 1.0,
        },
    )
    assert result.status_code == 200

    response = await _stored_response(response_id)
    assert response.ml_sentiments is not None
    assert response.ml_sentiments[question_id] == [
        ["Employability and Economic Mobility", 1.0],
        ["Civic Engagement and Community Contribution", 1.0],
    ]


async def test_false_positive_updates_existing_feedback(client):
    survey, question_id = await _create_survey_with_text_question(client)
    response_id = await _submit_text_response(client, survey["survey_id"], question_id)

    _override_permissions("surveys.manage")
    first = await client.post(
        f"/api/v1/surveys/{survey['id']}/responses/peii/false-positive",
        json={"response_id": str(response_id), "question_id": question_id},
    )
    assert first.status_code == 200

    second = await client.post(
        f"/api/v1/surveys/{survey['id']}/responses/peii/false-positive",
        json={
            "response_id": str(response_id),
            "question_id": question_id,
            "polarity_override": -1.0,
        },
    )
    assert second.status_code == 200

    rows = await _feedback_rows()
    assert len(rows) == 1
    assert rows[0].polarity_override == -1.0

    logs = await _audit_events("false_positive_feedback")
    assert len(logs) == 2
    assert {log.action for log in logs} == {"create", "update"}
