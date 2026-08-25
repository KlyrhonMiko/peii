from datetime import UTC, datetime, timedelta
from hashlib import sha256
from types import SimpleNamespace
from uuid import UUID

import pytest
from sqlmodel import select

from core.database import get_async_session
from main import app
from models.survey_distribution import SurveyDistribution
from schemas.survey_distribution import SurveyDistributionRead
from services import distribution_service

pytestmark = pytest.mark.anyio
EXPIRY = "2099-01-01T00:00:00+00:00"


@pytest.fixture(autouse=True)
def configured_distribution_expiry(monkeypatch):
    # The integration step that adds these settings is intentionally separate.
    monkeypatch.setattr(
        distribution_service,
        "settings",
        SimpleNamespace(SURVEY_DISTRIBUTION_MAX_EXPIRY_DAYS=36500),
    )


def test_distribution_expiry_is_required_in_model_and_read_contract():
    table = getattr(SurveyDistribution, "__table__")
    assert table.c.expires_at.nullable is False
    assert SurveyDistributionRead.model_fields["expires_at"].is_required()


def test_distribution_token_compatibility_columns_are_nullable_and_constrained():
    table = getattr(SurveyDistribution, "__table__")
    assert table.c.token_digest.nullable is True
    assert table.c.token_digest.type.length == 64
    assert table.c.token_digest.unique is True
    assert table.c.token_prefix.nullable is True
    assert table.c.token_prefix.type.length == 8


async def _stored_distribution(distribution_id: str) -> SurveyDistribution:
    session_generator = app.dependency_overrides[get_async_session]()
    session = await anext(session_generator)
    try:
        result = await session.exec(
            select(SurveyDistribution).where(SurveyDistribution.id == UUID(distribution_id))
        )
        return result.one()
    finally:
        await session_generator.aclose()


async def _create_active_survey(client):
    resp = await client.post("/api/v1/surveys/", json={"title": "Distributable Survey"})
    survey = resp.json()["data"]
    section = await client.post(f"/api/v1/surveys/{survey['id']}/sections/", json={"title": "Main"})
    await client.post(
        f"/api/v1/surveys/{survey['id']}/questions/",
        json={
            "question_text": "Status",
            "question_type": "text",
            "section_id": section.json()["data"]["id"],
        },
    )
    activated = await client.patch(
        f"/api/v1/surveys/{survey['survey_id']}", json={"status": "Active"}
    )
    assert activated.status_code == 200
    return survey["id"]


async def test_create_and_list_distributions(client):
    survey_uuid = await _create_active_survey(client)
    dist_resp = await client.post(
        f"/api/v1/surveys/{survey_uuid}/distributions/", json={"expires_at": EXPIRY}
    )
    assert dist_resp.status_code == 201
    assert len(dist_resp.json()["data"]["token"]) > 20
    list_resp = await client.get(f"/api/v1/surveys/{survey_uuid}/distributions/")
    assert list_resp.status_code == 200
    assert list_resp.json()["data"][0]["status"] == "active"
    assert "token" not in list_resp.json()["data"][0]

    stored = await _stored_distribution(dist_resp.json()["data"]["id"])
    token = dist_resp.json()["data"]["token"]
    assert stored.token == token
    assert stored.token_digest == sha256(token.encode()).hexdigest()
    assert stored.token_prefix == token[:8]


async def test_legacy_plaintext_distribution_token_still_resolves(client):
    survey_uuid = await _create_active_survey(client)
    legacy_token = "legacy-plaintext-distribution-token"
    session_generator = app.dependency_overrides[get_async_session]()
    session = await anext(session_generator)
    try:
        session.add(
            SurveyDistribution(
                survey_id=UUID(survey_uuid),
                token=legacy_token,
                expires_at=datetime(2099, 1, 1),
            )
        )
        await session.commit()
        resolved = await distribution_service.get_distribution_by_token(session, legacy_token)
    finally:
        await session_generator.aclose()

    assert resolved.token == legacy_token
    assert resolved.token_digest is None


async def test_create_and_rotate_return_secret_once_without_listing_it(client):
    survey_uuid = await _create_active_survey(client)
    created = await client.post(
        f"/api/v1/surveys/{survey_uuid}/distributions/", json={"expires_at": EXPIRY}
    )
    first_token = created.json()["data"]["token"]
    distribution_id = created.json()["data"]["id"]

    listed = await client.get(f"/api/v1/surveys/{survey_uuid}/distributions/")
    assert "token" not in listed.json()["data"][0]

    rotated = await client.post(
        f"/api/v1/surveys/{survey_uuid}/distributions/{distribution_id}/rotate",
        json={"expires_at": EXPIRY},
    )
    second_token = rotated.json()["data"]["token"]
    assert first_token != second_token
    assert "token" not in (
        await client.get(f"/api/v1/surveys/{survey_uuid}/distributions/")
    ).json()["data"][0]


async def test_distribution_rejects_expiry_beyond_configured_maximum(client, monkeypatch):
    monkeypatch.setattr(
        distribution_service.settings,
        "SURVEY_DISTRIBUTION_MAX_EXPIRY_DAYS",
        30,
        raising=False,
    )
    survey_uuid = await _create_active_survey(client)
    too_far = (datetime.now(UTC) + timedelta(days=31)).isoformat()
    response = await client.post(
        f"/api/v1/surveys/{survey_uuid}/distributions/",
        json={"expires_at": too_far},
    )
    assert response.status_code == 400
    assert "maximum" in response.json()["message"].lower()


async def test_revoke_distribution(client):
    survey_uuid = await _create_active_survey(client)
    dist_resp = await client.post(
        f"/api/v1/surveys/{survey_uuid}/distributions/", json={"expires_at": EXPIRY}
    )
    dist_id = dist_resp.json()["data"]["id"]
    revoke_resp = await client.request(
        "DELETE", f"/api/v1/surveys/{survey_uuid}/distributions/{dist_id}"
    )
    assert revoke_resp.status_code == 200
    assert revoke_resp.json()["data"]["is_active"] is False
    assert revoke_resp.json()["data"]["status"] == "revoked"


async def test_cannot_distribute_inactive_survey(client):
    resp = await client.post("/api/v1/surveys/", json={"title": "Inactive Survey"})
    dist_resp = await client.post(
        f"/api/v1/surveys/{resp.json()['data']['id']}/distributions/",
        json={"expires_at": EXPIRY},
    )
    assert dist_resp.status_code == 400
    assert "active" in dist_resp.json()["message"].lower()


async def test_distribution_requires_timezone_aware_future_expiry(client):
    survey_uuid = await _create_active_survey(client)
    missing_timezone = await client.post(
        f"/api/v1/surveys/{survey_uuid}/distributions/",
        json={"expires_at": "2099-01-01T00:00:00"},
    )
    assert missing_timezone.status_code == 422
    expired = await client.post(
        f"/api/v1/surveys/{survey_uuid}/distributions/",
        json={"expires_at": "2020-01-01T00:00:00+00:00"},
    )
    assert expired.status_code == 400


async def test_distribution_suspends_and_reactivates_with_survey_status(client):
    survey_response = await client.post("/api/v1/surveys/", json={"title": "Lifecycle Survey"})
    survey = survey_response.json()["data"]
    survey_uuid = survey["id"]
    survey_business_id = survey["survey_id"]
    section = await client.post(f"/api/v1/surveys/{survey_uuid}/sections/", json={"title": "Main"})
    await client.post(
        f"/api/v1/surveys/{survey_uuid}/questions/",
        json={
            "question_text": "Status",
            "question_type": "text",
            "section_id": section.json()["data"]["id"],
        },
    )
    await client.patch(f"/api/v1/surveys/{survey_business_id}", json={"status": "Active"})
    create_resp = await client.post(
        f"/api/v1/surveys/{survey_uuid}/distributions/", json={"expires_at": EXPIRY}
    )
    distribution_id = create_resp.json()["data"]["id"]
    token = create_resp.json()["data"]["token"]

    await client.patch(f"/api/v1/surveys/{survey_business_id}", json={"status": "Closed"})
    suspended = await client.get(f"/api/v1/surveys/{survey_uuid}/distributions/")
    assert suspended.json()["data"][0]["status"] == "suspended"
    assert (await client.get(f"/api/v1/survey/{token}")).status_code == 404

    await client.patch(f"/api/v1/surveys/{survey_business_id}", json={"status": "Active"})
    active = await client.get(f"/api/v1/surveys/{survey_uuid}/distributions/")
    assert active.json()["data"][0]["status"] == "active"

    rotate = await client.post(
        f"/api/v1/surveys/{survey_uuid}/distributions/{distribution_id}/rotate",
        json={"expires_at": EXPIRY},
    )
    assert rotate.status_code == 201
    assert rotate.json()["data"]["id"] != distribution_id
    assert (await client.get(f"/api/v1/survey/{token}")).status_code == 404
    assert (await client.get(f"/api/v1/survey/{rotate.json()['data']['token']}")).status_code == 200


async def test_archiving_revokes_distributions_and_restore_is_inactive(client):
    survey_uuid = await _create_active_survey(client)
    surveys = (await client.get("/api/v1/surveys/")).json()["data"]
    survey = next(survey for survey in surveys if survey["id"] == survey_uuid)
    created = await client.post(
        f"/api/v1/surveys/{survey_uuid}/distributions/", json={"expires_at": EXPIRY}
    )
    token = created.json()["data"]["token"]

    archived = await client.request("DELETE", f"/api/v1/surveys/{survey['survey_id']}", json={})
    assert archived.status_code == 200
    assert (await client.get(f"/api/v1/survey/{token}")).status_code == 404

    restored = await client.post(f"/api/v1/surveys/{survey['survey_id']}/restore", json={})
    assert restored.status_code == 200
    assert restored.json()["data"]["status"] == "Inactive"

    distributions = await client.get(f"/api/v1/surveys/{survey_uuid}/distributions/")
    assert distributions.json()["data"][0]["status"] == "revoked"


async def test_archiving_revokes_every_distribution_link(client):
    survey_uuid = await _create_active_survey(client)
    surveys = (await client.get("/api/v1/surveys/")).json()["data"]
    survey = next(survey for survey in surveys if survey["id"] == survey_uuid)
    first = await client.post(
        f"/api/v1/surveys/{survey_uuid}/distributions/", json={"expires_at": EXPIRY}
    )
    second = await client.post(
        f"/api/v1/surveys/{survey_uuid}/distributions/", json={"expires_at": EXPIRY}
    )
    first_token = first.json()["data"]["token"]
    second_token = second.json()["data"]["token"]

    archived = await client.request("DELETE", f"/api/v1/surveys/{survey['survey_id']}", json={})
    assert archived.status_code == 200
    assert (await client.get(f"/api/v1/survey/{first_token}")).status_code == 404
    assert (await client.get(f"/api/v1/survey/{second_token}")).status_code == 404

    restored = await client.post(f"/api/v1/surveys/{survey['survey_id']}/restore", json={})
    assert restored.status_code == 200
    distributions = await client.get(f"/api/v1/surveys/{survey_uuid}/distributions/")
    assert len(distributions.json()["data"]) == 2
    assert {item["status"] for item in distributions.json()["data"]} == {"revoked"}
