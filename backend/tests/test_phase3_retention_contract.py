import pytest
from pydantic import ValidationError

from core.config import Settings, settings
from models.survey import Survey
from models.survey_response import SurveyResponse
from schemas.survey import SurveyCreate, SurveyRead, SurveyUpdate
from schemas.survey_response import SurveyConsentSubmit, SurveyResponseRead, SurveyResponseSubmit


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


def test_withdrawal_hmac_secret_is_required_in_production() -> None:
    values = settings.model_dump()
    values.update(
        DEBUG=False,
        RATE_LIMIT_ENABLED=True,
        RATE_LIMIT_INCLUDE_CLIENT_IP=True,
        RATE_LIMIT_KEY_HMAC_SECRET="r" * 32,
        WITHDRAWAL_CODE_HMAC_SECRET=None,
    )

    with pytest.raises(ValidationError, match="WITHDRAWAL_CODE_HMAC_SECRET"):
        Settings.model_validate(values)

    values["WITHDRAWAL_CODE_HMAC_SECRET"] = "x" * 32
    production_settings = Settings.model_validate(values)
    assert production_settings.WITHDRAWAL_CODE_HMAC_SECRET == "x" * 32
