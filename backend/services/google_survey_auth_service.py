"""Google identity attestation for identifiable survey respondents."""

import asyncio
import hashlib
import hmac
from collections.abc import Mapping
from datetime import timedelta
from uuid import UUID

import httpx
from fastapi import status
from sqlalchemy.exc import IntegrityError
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from core.auth import AuthClaims
from core.config import settings
from core.exceptions import AppError
from core.http_client import get_http_client
from models.google_survey_auth_proof import GoogleSurveyAuthProof
from services.audit_service import AuditEvent, commit_with_audit
from services.base_service import utc_now

GOOGLE_AUTH_ERROR_MESSAGE = "Google authentication could not be verified."
GOOGLE_AUTH_UNAVAILABLE_MESSAGE = "Google authentication is temporarily unavailable."
GOOGLE_TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo"
GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
GOOGLE_SESSION_RESOURCE_DOMAIN = b"google-survey-auth-proof-audit-resource:v1:"
GOOGLE_AUTH_PROOF_PRIMARY_KEY_CONSTRAINT = "google_survey_auth_proofs_pkey"


def google_subject_digest(subject: str) -> str:
    """Return the only representation of a Google subject allowed to persist."""
    return hmac.new(
        settings.SURVEY_RESPONDENT_HMAC_SECRET.encode("utf-8"),
        subject.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def google_session_proof_resource_id(session_id: UUID) -> str:
    """Return a stable, non-reversible audit identifier for an auth session."""
    digest = hmac.new(
        settings.SURVEY_RESPONDENT_HMAC_SECRET.encode("utf-8"),
        GOOGLE_SESSION_RESOURCE_DOMAIN + str(session_id).encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return f"google-session:{digest}"


def _attestation_error() -> AppError:
    return AppError(
        GOOGLE_AUTH_ERROR_MESSAGE,
        status_code=status.HTTP_401_UNAUTHORIZED,
        errors={"code": "google_attestation_failed"},
    )


def _unavailable_error() -> AppError:
    return AppError(
        GOOGLE_AUTH_UNAVAILABLE_MESSAGE,
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        errors={"code": "google_attestation_unavailable"},
    )


def _sanitized_display_name(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    sanitized = " ".join(
        "".join(
            " " if character in "\r\n\t" else character
            for character in value
            if character >= " " or character in "\r\n\t"
        ).split()
    )
    if not sanitized:
        return None
    return sanitized[:255]


def _verified_email(value: object) -> str:
    if not isinstance(value, str):
        raise ValueError("email is not a string")
    email = value.strip().casefold()
    if (
        not 3 <= len(email) <= 320
        or "@" not in email
        or any(character.isspace() or ord(character) < 32 for character in email)
    ):
        raise ValueError("email is invalid")
    return email


def _json_object(response: httpx.Response) -> Mapping[str, object]:
    payload = response.json()
    if not isinstance(payload, Mapping):
        raise ValueError("upstream payload is not an object")
    return payload


def _has_linked_google_identity(payload: Mapping[str, object], subject: str) -> bool:
    identities = payload.get("identities")
    if not isinstance(identities, list):
        return False
    for identity in identities:
        if not isinstance(identity, Mapping):
            continue
        provider = identity.get("provider")
        identity_data = identity.get("identity_data")
        if provider != "google" or not isinstance(identity_data, Mapping):
            continue
        if identity_data.get("sub") == subject:
            return True
    return False


def _validate_session_claims(claims: AuthClaims) -> UUID:
    if (
        not claims.has_oauth_amr
        or claims.session_id is None
        or claims.is_anonymous is not False
    ):
        raise _attestation_error()
    return claims.session_id


async def _fetch_google_payloads(
    provider_token: str,
) -> tuple[Mapping[str, object], Mapping[str, object]]:
    try:
        client = get_http_client()
        tokeninfo_response, userinfo_response = await asyncio.gather(
            client.get(GOOGLE_TOKENINFO_URL, params={"access_token": provider_token}),
            client.get(
                GOOGLE_USERINFO_URL, headers={"Authorization": f"Bearer {provider_token}"}
            ),
            return_exceptions=True,
        )
        tokeninfo_response = _expect_google_response(tokeninfo_response)
        if tokeninfo_response.status_code != status.HTTP_200_OK:
            raise _attestation_error()
        tokeninfo = _json_object(tokeninfo_response)
        if tokeninfo.get("aud") != settings.GOOGLE_OAUTH_CLIENT_ID:
            raise _attestation_error()

        userinfo_response = _expect_google_response(userinfo_response)
        if userinfo_response.status_code != status.HTTP_200_OK:
            raise _attestation_error()
        userinfo = _json_object(userinfo_response)
    except AppError:
        raise
    except (httpx.HTTPError, ValueError, TypeError):
        raise _unavailable_error() from None

    return tokeninfo, userinfo


def _expect_google_response(outcome: object) -> httpx.Response:
    """Lift an awaitable outcome from gather(return_exceptions=True) into a response."""
    if isinstance(outcome, BaseException):
        raise outcome
    if not isinstance(outcome, httpx.Response):
        raise TypeError("unexpected upstream outcome")
    return outcome


async def _fetch_supabase_user(claims: AuthClaims) -> Mapping[str, object]:
    try:
        client = get_http_client()
        supabase_response = await client.get(
            f"{settings.SUPABASE_URL}/auth/v1/user",
            headers={
                "apikey": settings.SUPABASE_PUBLISHABLE_KEY,
                "Authorization": f"Bearer {claims.access_token}",
            },
        )
        if supabase_response.status_code != status.HTTP_200_OK:
            if supabase_response.status_code in {401, 403}:
                raise _attestation_error()
            raise _unavailable_error()
        return _json_object(supabase_response)
    except AppError:
        raise
    except (httpx.HTTPError, ValueError, TypeError):
        raise _unavailable_error() from None


def _validated_google_identity(userinfo: Mapping[str, object]) -> tuple[str, str]:
    if userinfo.get("email_verified") is not True:
        raise _attestation_error()
    subject = userinfo.get("sub")
    if not isinstance(subject, str) or not subject:
        raise _attestation_error()
    try:
        email = _verified_email(userinfo.get("email"))
    except ValueError:
        raise _attestation_error() from None
    return subject, email


def _proof_matches_google_identity(
    proof: GoogleSurveyAuthProof,
    claims: AuthClaims,
    subject: str,
    email: str,
) -> bool:
    return (
        proof.auth_user_id == claims.subject
        and proof.google_subject_digest == google_subject_digest(subject)
        and proof.verified_email == email
        and proof.email_verified is True
    )


def _is_google_proof_primary_key_conflict(error: IntegrityError) -> bool:
    diagnostic = getattr(error.orig, "diag", None)
    constraint_name = getattr(diagnostic, "constraint_name", None) or getattr(
        error.orig, "constraint_name", None
    )
    return constraint_name == GOOGLE_AUTH_PROOF_PRIMARY_KEY_CONSTRAINT


async def attest_google_survey_session(
    session: AsyncSession,
    claims: AuthClaims,
    provider_token: str,
    *,
    ip_address: str | None = None,
) -> GoogleSurveyAuthProof:
    """Verify the provider token against Google and the bearer against Supabase."""
    session_id = _validate_session_claims(claims)
    if not provider_token.strip():
        raise _attestation_error()

    _tokeninfo, userinfo = await _fetch_google_payloads(provider_token)
    subject, email = _validated_google_identity(userinfo)

    authenticated_at = utc_now()
    proof = (
        await session.exec(
            select(GoogleSurveyAuthProof)
            .where(col(GoogleSurveyAuthProof.session_id) == session_id)
        )
    ).first()

    if proof is not None:
        # A proof binds a session to a Google subject, not to the opaque provider
        # token. Never return it before the current token has been verified by
        # Google; doing so would turn a session-only lookup into an attestation
        # bypass. Once Google has verified the subject, a still-valid matching
        # proof is safe to reuse without another Supabase call or audit write.
        if not _proof_matches_google_identity(proof, claims, subject, email):
            raise _attestation_error()
        if proof.expires_at > authenticated_at:
            return proof

    supabase_user = await _fetch_supabase_user(claims)
    if supabase_user.get("id") != str(claims.subject):
        raise _attestation_error()
    if not _has_linked_google_identity(supabase_user, subject):
        raise _attestation_error()

    proof = (
        await session.exec(
            select(GoogleSurveyAuthProof)
            .where(col(GoogleSurveyAuthProof.session_id) == session_id)
            .with_for_update()
        )
    ).first()
    if proof is not None:
        if not _proof_matches_google_identity(proof, claims, subject, email):
            raise _attestation_error()
        if proof.expires_at > authenticated_at:
            return proof
    if proof is None:
        proof = GoogleSurveyAuthProof(session_id=session_id)
    proof.auth_user_id = claims.subject
    proof.google_subject_digest = google_subject_digest(subject)
    proof.verified_email = email
    proof.display_name = _sanitized_display_name(userinfo.get("name"))
    proof.email_verified = True
    proof.authenticated_at = authenticated_at
    proof.expires_at = authenticated_at + timedelta(
        seconds=settings.SURVEY_GOOGLE_SESSION_MAX_AGE_SECONDS
    )
    session.add(proof)
    try:
        await commit_with_audit(
            session,
            [
                AuditEvent(
                    action="attest",
                    resource_type="google_survey_auth_proof",
                    resource_id=google_session_proof_resource_id(session_id),
                    performed_by=settings.SYSTEM_ACTOR_ID,
                    changes={"attested": True},
                    ip_address=ip_address,
                )
            ],
        )
    except IntegrityError as exc:
        if not _is_google_proof_primary_key_conflict(exc):
            raise

        # commit_with_audit rolls back failed commits. Re-read after that
        # rollback so a concurrent insert can be the one successful proof and
        # audit event for this session. The identity and email are checked
        # again before returning the raced row.
        await session.rollback()
        raced_proof = (
            await session.exec(
                select(GoogleSurveyAuthProof).where(
                    col(GoogleSurveyAuthProof.session_id) == session_id
                )
            )
        ).first()
        if (
            raced_proof is None
            or not _proof_matches_google_identity(raced_proof, claims, subject, email)
            or raced_proof.expires_at <= authenticated_at
        ):
            raise _attestation_error() from None
        return raced_proof
    await session.refresh(proof)
    return proof


async def load_valid_google_proof(
    session: AsyncSession,
    claims: AuthClaims,
) -> GoogleSurveyAuthProof:
    """Load a proof only when it is bound to the current verified bearer session."""
    session_id = _validate_session_claims(claims)
    result = await session.exec(
        select(GoogleSurveyAuthProof).where(
            col(GoogleSurveyAuthProof.session_id) == session_id,
            col(GoogleSurveyAuthProof.auth_user_id) == claims.subject,
            col(GoogleSurveyAuthProof.email_verified).is_(True),
            col(GoogleSurveyAuthProof.expires_at) > utc_now(),
        )
    )
    proof = result.first()
    if proof is None:
        raise _attestation_error()
    return proof
