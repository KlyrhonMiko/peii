from uuid import uuid4

import pytest

from core.database import get_async_session
from main import app
from models.survey import Survey
from models.survey_response import SurveyResponse

pytestmark = pytest.mark.anyio


@pytest.mark.parametrize("deleted", [False, True])
async def test_history_locks_actual_metadata_changes_atomically(client, deleted):
    generator = app.dependency_overrides[get_async_session]()
    session = await anext(generator)
    try:
        survey = Survey(survey_id=f"SURV-{uuid4().hex[:8]}", title="Original", status="Inactive")
        session.add(survey)
        await session.flush()
        session.add(SurveyResponse(survey_id=survey.id, answers={}, is_deleted=deleted))
        await session.commit()
        business_id = survey.survey_id
        for field, value in [
            ("title", "Changed"),
            ("description", "Changed"),
            ("target_cohort", "2025"),
            ("retention_days", 20),
            ("retention_enabled", False),
        ]:
            response = await client.patch(
                f"/api/v1/surveys/{business_id}", json={field: value, "status": "Closed"}
            )
            assert response.status_code == 409
            assert response.json()["meta"]["request_id"]
        await session.refresh(survey)
        assert survey.title == "Original"
        assert survey.status == "Inactive"
        response = await client.patch(
            f"/api/v1/surveys/{business_id}",
            json={"title": "Original", "retention_days": 1825, "status": "Closed"},
        )
        assert response.status_code == 200
        detail = (await client.get(f"/api/v1/surveys/{business_id}")).json()["data"]
        assert detail["has_response_history"] is True
        from tests.test_survey_integrity import _override_permissions

        _override_permissions("surveys.read", "surveys.manage")
        private_detail = (await client.get(f"/api/v1/surveys/{business_id}")).json()["data"]
        assert private_detail["has_response_history"] is None
        denied = await client.patch(f"/api/v1/surveys/{business_id}", json={"title": "Denied"})
        assert denied.status_code == 409
        body = denied.json()
        assert body["errors"]["code"] == "survey_content_conflict"
        assert "response" not in body["message"].lower()

    finally:
        await generator.aclose()


async def test_history_detail_flag_preserves_manage_only_privacy(client):
    from tests.test_survey_integrity import _override_permissions

    created = (await client.post("/api/v1/surveys/", json={"title": "Private history"})).json()[
        "data"
    ]
    url = f"/api/v1/surveys/{created['survey_id']}"
    assert (await client.get(url)).json()["data"]["has_response_history"] is False
    _override_permissions("surveys.read", "surveys.manage")
    detail = (await client.get(url)).json()["data"]
    assert detail["has_response_history"] is None
    assert detail["responses_count"] is None
    rows = (await client.get("/api/v1/surveys/")).json()["data"]
    assert all("has_response_history" not in row for row in rows)
