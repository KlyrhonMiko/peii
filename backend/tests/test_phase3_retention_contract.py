from pathlib import Path
from uuid import uuid4

import pytest
from pydantic import ValidationError

from core.config import Settings, settings
from models.survey import Survey
from models.survey_response import SurveyResponse
from schemas.survey import SurveyCreate, SurveyRead, SurveyUpdate
from schemas.survey_response import (
    SurveyConsentSubmit,
    SurveyResponseIdentityRead,
    SurveyResponseRead,
    SurveyResponseSubmit,
)


def test_survey_retention_defaults_are_exposed_by_create_and_read_contracts() -> None:
    payload = SurveyCreate(title="Retention Survey")

    assert payload.retention_enabled is True
    assert payload.retention_days == 1825

    survey = Survey(
        survey_id="SURV-RETENTION",
        title=payload.title,
        retention_enabled=payload.retention_enabled,
        retention_days=payload.retention_days,
    )
    read = SurveyRead.model_validate(survey)
    assert read.retention_enabled is True
    assert read.retention_days == 1825


def test_survey_retention_days_must_be_positive() -> None:
    with pytest.raises(ValidationError):
        SurveyCreate(title="Invalid Retention", retention_days=0)
    with pytest.raises(ValidationError):
        SurveyUpdate(retention_days=-1)


def test_response_contract_accepts_withdrawal_code_without_exposing_digest() -> None:
    payload = SurveyResponseSubmit(
        answers={},
        consent=SurveyConsentSubmit(accepted=True, version="20260825_v1"),
        withdrawal_code="A" * 42 + "B",
    )

    assert payload.withdrawal_code == "A" * 42 + "B"
    assert "withdrawal_credential_digest" not in SurveyResponseRead.model_fields
    assert "withdrawal_credential_digest" in SurveyResponse.metadata.tables["survey_responses"].c


def test_identity_read_exposes_snapshots_without_internal_identifiers() -> None:
    response = SurveyResponse(
        survey_id=uuid4(),
        provider=None,
        email=None,
        email_verified=None,
        identity_captured_at=None,
        answers={},
    )

    read = SurveyResponseIdentityRead.model_validate(response)

    assert "auth_user_id" not in SurveyResponseIdentityRead.model_fields
    assert "respondent_key_digest" not in SurveyResponseIdentityRead.model_fields
    assert read.identity_available is False
    assert "auth_user_id" not in read.model_dump()
    assert "respondent_key_digest" not in read.model_dump()


def test_withdrawal_hmac_secret_is_required_in_production() -> None:
    values = settings.model_dump()
    values.update(
        DEBUG=False,
        RATE_LIMIT_ENABLED=True,
        RATE_LIMIT_INCLUDE_CLIENT_IP=True,
        RATE_LIMIT_KEY_HMAC_SECRET="r" * 32,
        WITHDRAWAL_CODE_HMAC_SECRET=None,
        GOOGLE_OAUTH_CLIENT_ID="production-google-client-id",
        SURVEY_RESPONDENT_HMAC_SECRET="s" * 32,
        PASSWORD_RESET_GRANT_SECRET="p" * 32,
        REDIS_URL="rediss://redis.example.com:6379/0",
        TRUSTED_PROXY_CIDRS=["198.51.100.0/24"],
        DATABASE_TLS_MODE="verify-full",
        APP_ORIGIN="https://app.example.com",
        BACKEND_CORS_ORIGINS=["https://app.example.com"],
    )

    with pytest.raises(ValidationError, match="WITHDRAWAL_CODE_HMAC_SECRET"):
        Settings.model_validate(values)

    values["WITHDRAWAL_CODE_HMAC_SECRET"] = "x" * 32
    production_settings = Settings.model_validate(values)
    assert production_settings.WITHDRAWAL_CODE_HMAC_SECRET == "x" * 32


def test_retention_purge_service_uses_absolute_script_path_with_state_working_directory() -> None:
    service_path = (
        Path(__file__).resolve().parents[2] / "deploy/oracle/peii-retention-purge.service"
    )
    service = service_path.read_text(encoding="utf-8")

    assert "WorkingDirectory=/var/lib/peii" in service
    assert (
        "ExecStart=/opt/peii/backend/.venv/bin/python "
        "/opt/peii/backend/scripts/purge_expired_responses.py --batch-size 100"
    ) in service

    timer_path = Path(__file__).resolve().parents[2] / "deploy/oracle/peii-retention-purge.timer"
    timer = timer_path.read_text(encoding="utf-8")
    assert "Unit=peii-retention-purge.service" in timer
