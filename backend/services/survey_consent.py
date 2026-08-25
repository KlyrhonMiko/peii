from fastapi import status

from core.config import settings
from core.exceptions import AppError
from schemas.survey_public import PublicConsentContract


def get_public_consent_policy() -> PublicConsentContract:
    """Return the current server-owned public survey consent contract."""
    return PublicConsentContract(
        version=settings.PUBLIC_SURVEY_CONSENT_VERSION,
        notice=settings.PUBLIC_SURVEY_PRIVACY_NOTICE,
        purpose=settings.PUBLIC_SURVEY_PURPOSE,
        retention=settings.PUBLIC_SURVEY_RETENTION,
        contact=settings.PUBLIC_SURVEY_CONTACT,
    )


def require_current_consent(version: str) -> PublicConsentContract:
    policy = get_public_consent_policy()
    if version != policy.version:
        raise AppError(
            "Consent version is stale. Please review the current privacy notice.",
            status_code=status.HTTP_409_CONFLICT,
            errors={"code": "stale_consent"},
        )
    return policy
