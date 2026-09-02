import hashlib
import hmac
import json
import math
import secrets
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import Literal
from uuid import UUID

from fastapi import status
from sqlalchemy import func, or_, update
from sqlalchemy.exc import IntegrityError
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from core.config import settings
from core.deps import GoogleSurveyRespondent
from core.exceptions import AppError
from models.question_type import QuestionType
from models.survey import Survey
from models.survey_question import SurveyQuestion
from models.survey_response import ResponseErasureReceipt, SurveyResponse
from models.survey_section import SurveySection
from schemas.survey_response import (
    EraseAllResponses,
    EraseSelectedResponses,
    ResponseErasureResult,
    SurveyResponseListQueryParams,
    SurveyResponseWithdrawalRequest,
    SurveyResponseWithdrawalResult,
)
from services import survey_consent
from services.audit_service import AuditEvent, commit_with_audit
from services.base_service import utc_now
from services.question_validation import (
    get_matrix_columns,
    get_scale_bounds,
    validate_question_definition,
)
from services.survey_service import resolve_survey
from utils.sorting import stable_order_by

_LOCAL_WITHDRAWAL_HMAC_SECRET = secrets.token_bytes(32)
GENERIC_WITHDRAWAL_ERROR = "Response not found or already withdrawn."


@dataclass(frozen=True, slots=True)
class PublicSurveyPhaseState:
    collection_state: Literal["phase1", "phase2", "completed", "withdrawn"] | None
    submission_phase: Literal[1, 2] | None
    visible_phase: int | None
    question_phases: dict[str, int]

    @property
    def phase_aware(self) -> bool:
        return bool(self.question_phases)


def hash_withdrawal_code(withdrawal_code: str) -> str:
    """Return the server-side HMAC digest for a respondent-held code."""
    secret = settings.WITHDRAWAL_CODE_HMAC_SECRET
    key = secret.encode("utf-8") if secret is not None else _LOCAL_WITHDRAWAL_HMAC_SECRET
    return hmac.new(key, withdrawal_code.encode("utf-8"), hashlib.sha256).hexdigest()


def response_idempotency_hash(
    answers: dict[str, object], consent_version: str, withdrawal_code: str
) -> str:
    return hashlib.sha256(
        json.dumps(
            {
                "answers": answers,
                "consent_version": consent_version,
                "withdrawal_code": withdrawal_code,
            },
            sort_keys=True,
            separators=(",", ":"),
            allow_nan=False,
        ).encode()
    ).hexdigest()


def respondent_key_digest(survey_id: UUID, subject_digest: str) -> str:
    """Derive a survey-scoped dedupe key without exposing either identity value."""
    return hmac.new(
        settings.SURVEY_RESPONDENT_HMAC_SECRET.encode("utf-8"),
        f"survey:{survey_id}:subject:{subject_digest}".encode(),
        hashlib.sha256,
    ).hexdigest()


def _response_identity_matches(
    response: SurveyResponse,
    respondent: GoogleSurveyRespondent,
    expected_digest: str,
) -> bool:
    return (
        response.provider == "google"
        and response.auth_user_id == respondent.auth_user_id
        and response.respondent_key_digest == expected_digest
        and response.email == respondent.email
        and response.display_name == respondent.display_name
        and response.email_verified is respondent.email_verified
    )


def _is_respondent_key_integrity_error(error: IntegrityError) -> bool:
    diagnostic = getattr(error.orig, "diag", None)
    constraint = getattr(diagnostic, "constraint_name", None) or getattr(
        error.orig, "constraint_name", None
    )
    if constraint == "uq_survey_responses_survey_respondent_key":
        return True
    message = str(error.orig).lower()
    return "survey_responses.survey_id" in message and (
        "survey_responses.respondent_key_digest" in message
        or "respondent_key_digest" in message
    )


def _is_blank_answer(value: object) -> bool:
    return (
        value is None
        or (isinstance(value, str) and not value.strip())
        or value == []
        or value == {}
    )


def _load_json(value: str | None, name: str) -> object:
    if value is None:
        return None
    try:
        return json.loads(value)
    except json.JSONDecodeError as exc:
        raise ValueError(f"stored {name} is invalid") from exc


async def _load_active_questions(
    session: AsyncSession,
    survey_id: UUID,
) -> dict[str, SurveyQuestion]:
    questions_result = await session.exec(
        select(SurveyQuestion)
        .join(SurveySection, col(SurveySection.id) == SurveyQuestion.section_id)
        .where(
            col(SurveyQuestion.survey_id) == survey_id,
            col(SurveySection.survey_id) == survey_id,
            col(SurveySection.is_deleted).is_(False),
            col(SurveyQuestion.is_deleted).is_(False),
        )
    )
    return {str(question.id): question for question in questions_result.all()}


def _get_question_phases(questions: dict[str, SurveyQuestion]) -> dict[str, int] | None:
    if not questions:
        return None
    phases: dict[str, int] = {}
    for question_id, question in questions.items():
        try:
            config = _load_json(question.config, "config")
        except ValueError:
            return None
        phase = config.get("survey_phase") if isinstance(config, dict) else None
        if type(phase) is not int or phase not in (1, 2):
            return None
        phases[question_id] = phase
    if set(phases.values()) != {1, 2}:
        return None
    return phases


async def get_public_survey_phase_state(
    session: AsyncSession,
    survey_id: UUID,
    questions: dict[str, SurveyQuestion],
    respondent: GoogleSurveyRespondent,
) -> PublicSurveyPhaseState:
    question_phases = _get_question_phases(questions)
    if question_phases is None:
        return PublicSurveyPhaseState(None, None, None, {})

    respondent_digest = respondent_key_digest(survey_id, respondent.subject_digest)
    response_result = await session.exec(
        select(SurveyResponse).where(
            col(SurveyResponse.survey_id) == survey_id,
            col(SurveyResponse.respondent_key_digest) == respondent_digest,
        )
    )
    response = response_result.first()
    if response is None:
        return PublicSurveyPhaseState("phase1", 1, 1, question_phases)
    if response.is_deleted:
        return PublicSurveyPhaseState("withdrawn", None, None, question_phases)

    answer_ids = set(response.answers)
    phase1_ids = {question_id for question_id, phase in question_phases.items() if phase == 1}
    phase2_ids = {question_id for question_id, phase in question_phases.items() if phase == 2}
    phase1_complete = phase1_ids.issubset(answer_ids)
    phase2_complete = phase2_ids.issubset(answer_ids)
    if phase1_complete and phase2_complete:
        return PublicSurveyPhaseState("completed", None, None, question_phases)
    if phase1_complete:
        return PublicSurveyPhaseState("phase2", 2, 2, question_phases)
    return PublicSurveyPhaseState("phase1", 1, 1, question_phases)


def _validate_phase_answer_ids(
    answers: dict[str, object],
    questions: dict[str, SurveyQuestion],
    expected_question_ids: set[str],
) -> None:
    validation_errors: list[dict[str, str]] = []
    for question_id in sorted(set(answers) - expected_question_ids):
        validation_errors.append(
            {
                "question_id": question_id,
                "code": "wrong_phase" if question_id in questions else "unknown_question",
                "message": (
                    "Question belongs to a different survey phase."
                    if question_id in questions
                    else "Question does not belong to this survey."
                ),
            }
        )
    for question_id in sorted(expected_question_ids - set(answers)):
        validation_errors.append(
            {
                "question_id": question_id,
                "code": "required",
                "message": "This question is required.",
            }
        )
    if validation_errors:
        raise AppError(
            "Response answers are invalid.",
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            errors=validation_errors,
        )


def _validate_answer(question: SurveyQuestion, answer: object) -> None:
    options = _load_json(question.options, "options")
    config = _load_json(question.config, "config")
    validate_question_definition(question.question_type, options, config)
    question_type = question.question_type
    option_values = options if isinstance(options, list) else []

    if question_type == QuestionType.SINGLE_CHOICE:
        if not isinstance(answer, str):
            raise ValueError("must be a string")
        if answer not in option_values:
            raise ValueError("is not one of the configured options")
    elif question_type == QuestionType.BOOLEAN:
        if not isinstance(answer, bool):
            raise ValueError("must be a boolean")
    elif question_type == QuestionType.MULTIPLE_CHOICE:
        if not isinstance(answer, list) or not all(isinstance(item, str) for item in answer):
            raise ValueError("must be a list of strings")
        if len(answer) != len(set(answer)):
            raise ValueError("must not contain duplicate options")
        if any(item not in option_values for item in answer):
            raise ValueError("contains an option that is not configured")
    elif question_type in {QuestionType.NUMBER, QuestionType.SCALE}:
        if not isinstance(answer, (int, float)) or isinstance(answer, bool):
            raise ValueError("must be a number")
        if not math.isfinite(answer):
            raise ValueError("must be finite")
        if question_type == QuestionType.SCALE and not isinstance(answer, int):
            raise ValueError("must be an integer")
        normalized_config = config if isinstance(config, dict) else {}
        minimum: int | float | None
        maximum: int | float | None
        if question_type == QuestionType.SCALE:
            scale_options = options if isinstance(options, list) else None
            minimum, maximum = get_scale_bounds(scale_options, normalized_config)
        else:
            minimum = normalized_config.get("min")
            maximum = normalized_config.get("max")
            if normalized_config.get("integer") is True and not isinstance(answer, int):
                raise ValueError("must be an integer")
            step = normalized_config.get("step")
            if step is not None and minimum is not None:
                if not math.isclose((answer - minimum) / step % 1, 0.0, abs_tol=1e-9):
                    raise ValueError("does not match the configured step")
        if minimum is not None and answer < minimum:
            raise ValueError("is below the configured minimum")
        if maximum is not None and answer > maximum:
            raise ValueError("is above the configured maximum")
    elif question_type == QuestionType.RANKING:
        if not isinstance(answer, list) or not all(isinstance(item, str) for item in answer):
            raise ValueError("must be an ordered list of strings")
        if len(answer) != len(set(answer)) or set(answer) != set(option_values):
            raise ValueError("must contain each configured option exactly once")
    elif question_type == QuestionType.MATRIX:
        if not isinstance(answer, dict):
            raise ValueError("must be an object keyed by matrix row")
        if not isinstance(options, list) or set(answer) != set(option_values):
            raise ValueError("must contain an answer for every configured row")
        columns = get_matrix_columns(config if isinstance(config, dict) else None)
        if not all(
            isinstance(row, str) and isinstance(value, str) for row, value in answer.items()
        ):
            raise ValueError("must contain string answers for every matrix row")
        if any(value not in columns for value in answer.values()):
            raise ValueError("contains a matrix answer that is not configured")
    elif question_type in {
        QuestionType.TEXT,
        QuestionType.DATETIME,
        QuestionType.FILE,
    }:
        if not isinstance(answer, str):
            raise ValueError("must be a string")
        if question_type == QuestionType.TEXT:
            max_length = (config or {}).get("max_length") if isinstance(config, dict) else None
            if max_length is not None and len(answer) > max_length:
                raise ValueError("exceeds the configured maximum length")
        elif question_type == QuestionType.DATETIME:
            try:
                date.fromisoformat(answer)
            except ValueError as exc:
                raise ValueError("must be an ISO date") from exc


async def _validate_answers(
    session: AsyncSession,
    survey_id: UUID,
    answers: dict[str, object],
    *,
    questions: dict[str, SurveyQuestion] | None = None,
    expected_question_ids: set[str] | None = None,
) -> None:
    active_questions = questions or await _load_active_questions(session, survey_id)

    validation_errors: list[dict[str, str]] = []
    allowed_question_ids = expected_question_ids or set(active_questions)
    for question_id in sorted(set(answers) - allowed_question_ids):
        validation_errors.append(
            {
                "question_id": question_id,
                "code": "wrong_phase"
                if expected_question_ids is not None and question_id in active_questions
                else "unknown_question",
                "message": (
                    "Question belongs to a different survey phase."
                    if expected_question_ids is not None and question_id in active_questions
                    else "Question does not belong to this survey."
                ),
            }
        )

    for question_id, question in active_questions.items():
        if expected_question_ids is not None and question_id not in expected_question_ids:
            continue
        if question_id not in answers:
            if expected_question_ids is not None or question.is_required:
                validation_errors.append(
                    {
                        "question_id": question_id,
                        "code": "required",
                        "message": "This question is required.",
                    }
                )
            continue
        if question.is_required and _is_blank_answer(answers[question_id]):
            validation_errors.append(
                {
                    "question_id": question_id,
                    "code": "required",
                    "message": "This question is required.",
                }
            )
            continue
        try:
            if _is_blank_answer(answers[question_id]) and not question.is_required:
                continue
            _validate_answer(question, answers[question_id])
        except (TypeError, ValueError, json.JSONDecodeError) as exc:
            validation_errors.append(
                {
                    "question_id": question_id,
                    "code": "invalid_answer",
                    "message": str(exc),
                }
            )

    if validation_errors:
        raise AppError(
            "Response answers are invalid.",
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            errors=validation_errors,
        )


async def submit_response(
    session: AsyncSession,
    survey_id: str,
    answers: dict[str, object],
    actor_id: UUID,
    idempotency_key: UUID | None = None,
    ip_address: str | None = None,
    consent_version: str | None = None,
    withdrawal_code: str | None = None,
    respondent: GoogleSurveyRespondent | None = None,
) -> tuple[SurveyResponse, bool]:
    # Public HTTP callers must supply the current version.  A missing value is
    # defaulted only for existing internal service callers, preserving their
    # behavior while the public request schema remains strict.
    if consent_version is None:
        consent_version = survey_consent.get_public_consent_policy().version
    consent_policy = survey_consent.require_current_consent(consent_version)
    if withdrawal_code is None:
        # Internal callers predating the public withdrawal contract receive a
        # non-returned process-local secret. Public callers are required to
        # provide their own code by SurveyResponseSubmit.
        withdrawal_code = secrets.token_urlsafe(32)

    try:
        answers_json = json.dumps(answers, allow_nan=False)
    except (TypeError, ValueError) as exc:
        raise AppError(
            "Answers contain values that cannot be stored as JSON.",
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        ) from exc
    if len(answers_json) > 10000:
        raise AppError(
            "Answers payload exceeds the maximum allowed size.",
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        )

    # Resolve the survey directly
    survey = await resolve_survey(
        session,
        survey_id,
        for_update=True,
    )
    if survey.is_deleted or survey.status != "Active":
        raise AppError(
            "Survey not found or no longer active.", status_code=status.HTTP_404_NOT_FOUND
        )
    questions = await _load_active_questions(session, survey.id)
    if not questions:
        raise AppError("Survey is not properly configured.", status_code=status.HTTP_404_NOT_FOUND)
    question_phases = _get_question_phases(questions)
    if question_phases is not None:
        _validate_phase_answer_ids(
            answers,
            questions,
            {question_id for question_id, phase in question_phases.items() if phase == 1},
        )

    respondent_digest = (
        respondent_key_digest(survey.id, respondent.subject_digest)
        if respondent is not None
        else None
    )
    answers_hash = None
    candidates: list[SurveyResponse] = []
    if idempotency_key is not None:
        answers_hash = response_idempotency_hash(answers, consent_version, withdrawal_code)
        legacy_answers_hash = hashlib.sha256(
            json.dumps(answers, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()
        ).hexdigest()
        response_match_conditions = [
            (
                col(SurveyResponse.survey_id) == survey.id,
                col(SurveyResponse.idempotency_key) == idempotency_key,
            )
        ]
        if respondent_digest is not None:
            response_match_conditions.append(
                (
                    col(SurveyResponse.survey_id) == survey.id,
                    col(SurveyResponse.respondent_key_digest) == respondent_digest,
                )
            )
        existing_result = await session.exec(
            select(SurveyResponse)
            .where(or_(*(condition[0] & condition[1] for condition in response_match_conditions)))
            .order_by(col(SurveyResponse.id))
            .with_for_update()
        )
        candidates = list(existing_result.all())
        existing = next(
            (candidate for candidate in candidates if candidate.idempotency_key == idempotency_key),
            None,
        )
        if existing is not None:
            if respondent is not None and not _response_identity_matches(
                existing,
                respondent,
                respondent_key_digest(survey.id, respondent.subject_digest),
            ):
                raise AppError(
                    "Idempotency-Key was already used by a different respondent.",
                    status_code=status.HTTP_409_CONFLICT,
                    errors={"code": "idempotency_conflict"},
                )
            consent_fields = (
                existing.consent_version,
                existing.consented_at,
                existing.consent_notice_snapshot,
            )
            all_consent_fields_null = all(field is None for field in consent_fields)
            all_consent_fields_present = all(field is not None for field in consent_fields)
            if not all_consent_fields_null and not all_consent_fields_present:
                raise AppError(
                    "Existing response consent evidence is incomplete.",
                    status_code=status.HTTP_409_CONFLICT,
                    errors={"code": "invalid_consent_evidence"},
                )

            if all_consent_fields_present and (
                existing.consent_version != consent_version
                or existing.consent_notice_snapshot != consent_policy.model_dump(mode="json")
            ):
                raise AppError(
                    "Existing response consent evidence is inconsistent.",
                    status_code=status.HTTP_409_CONFLICT,
                    errors={"code": "invalid_consent_evidence"},
                )

            if existing.idempotency_hash == answers_hash:
                if not all_consent_fields_present:
                    raise AppError(
                        "Existing response consent evidence is incomplete.",
                        status_code=status.HTTP_409_CONFLICT,
                        errors={"code": "invalid_consent_evidence"},
                    )
                return existing, True

            if existing.idempotency_hash == legacy_answers_hash:
                if all_consent_fields_null:
                    existing.consent_version = consent_version
                    existing.consented_at = utc_now()
                    existing.consent_notice_snapshot = consent_policy.model_dump(mode="json")
                    session.add(existing)
                    await commit_with_audit(
                        session,
                        [
                            AuditEvent(
                                action="consent_recorded_on_legacy_replay",
                                resource_type="survey_response",
                                resource_id=str(existing.id),
                                performed_by=actor_id,
                                changes=None,
                                ip_address=None,
                            )
                        ],
                    )
                    await session.refresh(existing)
                return existing, True

            if existing.idempotency_hash != answers_hash:
                raise AppError(
                    "Idempotency-Key was already used with different answers or consent version.",
                    status_code=status.HTTP_409_CONFLICT,
                    errors={"code": "idempotency_conflict"},
                )



    if idempotency_key is None and respondent_digest is not None:
        duplicate_result = await session.exec(
            select(SurveyResponse)
            .where(
                col(SurveyResponse.survey_id) == survey.id,
                col(SurveyResponse.respondent_key_digest) == respondent_digest,
            )
            .order_by(col(SurveyResponse.id))
            .with_for_update()
        )
        candidates = list(duplicate_result.all())
    if respondent_digest is not None:
        duplicate = next(
            (
                candidate
                for candidate in candidates
                if candidate.respondent_key_digest == respondent_digest
            ),
            None,
        )
        if duplicate is not None:
            raise AppError(
                "This respondent has already submitted a response.",
                status_code=status.HTTP_409_CONFLICT,
                errors={"code": "already_submitted"},
            )

    await _validate_answers(
        session,
        survey.id,
        answers,
        questions=questions,
        expected_question_ids=(
            {question_id for question_id, phase in question_phases.items() if phase == 1}
            if question_phases is not None
            else None
        ),
    )

    accepted_at = utc_now()
    response = SurveyResponse(
        survey_id=survey.id,
        idempotency_key=idempotency_key,
        idempotency_hash=answers_hash,
        consent_version=consent_version,
        consented_at=accepted_at,
        consent_notice_snapshot=consent_policy.model_dump(mode="json"),
        retention_expires_at=(
            accepted_at + timedelta(days=survey.retention_days)
            if survey.retention_enabled
            else None
        ),
        withdrawal_credential_digest=hash_withdrawal_code(withdrawal_code),
        provider="google" if respondent is not None else None,
        auth_user_id=respondent.auth_user_id if respondent is not None else None,
        respondent_key_digest=respondent_digest,
        email=respondent.email if respondent is not None else None,
        display_name=respondent.display_name if respondent is not None else None,
        email_verified=respondent.email_verified if respondent is not None else None,
        identity_captured_at=accepted_at if respondent is not None else None,
        answers=answers,
        performed_by=actor_id,
    )
    session.add(response)
    await session.exec(
        update(Survey)
        .where(col(Survey.id) == survey.id)
        .values(
            responses_count=col(Survey.responses_count) + 1,
            performed_by=actor_id,
            updated_at=utc_now(),
        )
    )

    phase_one_event = (
        AuditEvent(
            action="phase1_submitted",
            resource_type="survey_response",
            resource_id=str(response.id),
            performed_by=actor_id,
            changes={"phase": 1},
            ip_address=None,
        )
        if question_phases is not None
        else AuditEvent(
            action="response_submitted",
            resource_type="survey",
            resource_id=survey.survey_id,
            performed_by=actor_id,
            changes={"response_id": str(response.id)},
            ip_address=None,
        )
    )
    try:
        await commit_with_audit(
            session,
            [
                AuditEvent(
                    action="create",
                    resource_type="survey_response",
                    resource_id=str(response.id),
                    performed_by=actor_id,
                    changes=None,
                    ip_address=None,
                ),
                phase_one_event,
            ],
        )
    except IntegrityError as exc:
        if _is_respondent_key_integrity_error(exc):
            raise AppError(
                "This respondent has already submitted a response.",
                status_code=status.HTTP_409_CONFLICT,
                errors={"code": "already_submitted"},
            ) from exc
        raise
    await session.refresh(response)
    return response, False


def _phase2_idempotency_hash(answers: dict[str, object]) -> str:
    return hashlib.sha256(
        json.dumps(
            {"phase": 2, "answers": answers},
            sort_keys=True,
            separators=(",", ":"),
            allow_nan=False,
        ).encode()
    ).hexdigest()


async def submit_phase2_response(
    session: AsyncSession,
    survey_id: str,
    answers: dict[str, object],
    actor_id: UUID,
    idempotency_key: UUID,
    respondent: GoogleSurveyRespondent,
    ip_address: str | None = None,
) -> tuple[SurveyResponse, bool]:
    survey = await resolve_survey(
        session,
        survey_id,
        for_update=True,
    )
    if survey.is_deleted or survey.status != "Active":
        raise AppError(
            "Survey not found or no longer active.", status_code=status.HTTP_404_NOT_FOUND
        )
    questions = await _load_active_questions(session, survey.id)
    question_phases = _get_question_phases(questions)
    if question_phases is None:
        raise AppError(
            "This survey does not have a follow-up phase.",
            status_code=status.HTTP_409_CONFLICT,
            errors={"code": "phase2_unavailable"},
        )
    phase2_ids = {question_id for question_id, phase in question_phases.items() if phase == 2}
    await _validate_answers(session, survey.id, answers, questions, phase2_ids)

    try:
        answers_json = json.dumps(answers, allow_nan=False)
    except (TypeError, ValueError) as exc:
        raise AppError(
            "Answers contain values that cannot be stored as JSON.",
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        ) from exc
    if len(answers_json) > 10000:
        raise AppError(
            "Answers payload exceeds the maximum allowed size.",
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        )
    answers_hash = _phase2_idempotency_hash(answers)
    respondent_digest = respondent_key_digest(survey.id, respondent.subject_digest)

    response_result = await session.exec(
        select(SurveyResponse)
        .where(
            col(SurveyResponse.survey_id) == survey.id,
            or_(
                col(SurveyResponse.respondent_key_digest) == respondent_digest,
                col(SurveyResponse.idempotency_key) == idempotency_key,
            ),
        )
        .order_by(col(SurveyResponse.id))
        .with_for_update()
    )
    candidates = list(response_result.all())
    matching_response = next(
        (
            response
            for response in candidates
            if response.respondent_key_digest == respondent_digest
        ),
        None,
    )
    idempotency_response = next(
        (response for response in candidates if response.idempotency_key == idempotency_key),
        None,
    )
    if matching_response is not None and matching_response.is_deleted:
        raise AppError(
            "This response has been withdrawn.",
            status_code=status.HTTP_409_CONFLICT,
            errors={"code": "withdrawn"},
        )
    if idempotency_response is not None:
        if idempotency_response is not matching_response:
            raise AppError(
                "Idempotency-Key was already used by a different response.",
                status_code=status.HTTP_409_CONFLICT,
                errors={"code": "idempotency_conflict"},
            )
        if idempotency_response.idempotency_hash == answers_hash:
            return idempotency_response, True
        raise AppError(
            "Idempotency-Key was already used with different answers.",
            status_code=status.HTTP_409_CONFLICT,
            errors={"code": "idempotency_conflict"},
        )

    if matching_response is None:
        raise AppError(
            "Phase 1 must be submitted before the follow-up phase.",
            status_code=status.HTTP_409_CONFLICT,
            errors={"code": "phase1_required"},
        )
    stored_answers = matching_response.answers
    phase1_ids = {question_id for question_id, phase in question_phases.items() if phase == 1}
    if not phase1_ids.issubset(stored_answers):
        raise AppError(
            "Phase 1 must be submitted before the follow-up phase.",
            status_code=status.HTTP_409_CONFLICT,
            errors={"code": "phase1_required"},
        )
    if phase2_ids.issubset(stored_answers):
        raise AppError(
            "The follow-up phase has already been submitted.",
            status_code=status.HTTP_409_CONFLICT,
            errors={"code": "already_completed"},
        )

    await _validate_answers(
        session,
        survey.id,
        answers,
        questions=questions,
        expected_question_ids=phase2_ids,
    )
    submitted_at = utc_now()
    matching_response.answers = {**stored_answers, **answers}
    matching_response.idempotency_key = idempotency_key
    matching_response.idempotency_hash = answers_hash
    matching_response.retention_expires_at = (
        submitted_at + timedelta(days=survey.retention_days)
        if survey.retention_enabled
        else None
    )
    matching_response.updated_at = submitted_at
    matching_response.performed_by = actor_id
    session.add(matching_response)
    await commit_with_audit(
        session,
        [
            AuditEvent(
                action="phase2_submitted",
                resource_type="survey_response",
                resource_id=str(matching_response.id),
                performed_by=actor_id,
                changes={"phase": 2},
                ip_address=ip_address,
            )
        ],
    )
    await session.refresh(matching_response)
    return matching_response, False


async def list_responses(
    session: AsyncSession,
    survey_id: UUID,
    params: SurveyResponseListQueryParams,
) -> tuple[list[SurveyResponse], int]:
    await resolve_survey(session, survey_id, include_deleted=True)
    now = utc_now()
    statement = _apply_response_listing_filters(select(SurveyResponse), survey_id, params, now)
    total_statement = _apply_response_listing_filters(
        select(func.count()).select_from(SurveyResponse), survey_id, params, now
    )
    total_result = await session.exec(total_statement)
    total = total_result.one()

    sort_columns = {"created_at": SurveyResponse.created_at}
    statement = stable_order_by(
        statement,
        sort_columns[params.sort_by],
        sort_order=params.sort_order,
        id_column=SurveyResponse.id,
    )
    statement = statement.offset(params.offset).limit(params.limit)
    result = await session.exec(statement)
    rows = list(result.all())
    return rows, total


def _as_utc_naive(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value
    return value.astimezone(UTC).replace(tzinfo=None)


def _apply_response_listing_filters(
    statement,
    survey_id: UUID,
    params: SurveyResponseListQueryParams,
    now: datetime,
):
    statement = statement.where(
        col(SurveyResponse.survey_id) == survey_id,
        col(SurveyResponse.is_deleted).is_(False),
        (
            col(SurveyResponse.retention_expires_at).is_(None)
            | (col(SurveyResponse.retention_expires_at) > now)
        ),
    )
    if params.submitted_from is not None:
        statement = statement.where(
            col(SurveyResponse.created_at) >= _as_utc_naive(params.submitted_from)
        )
    if params.submitted_before is not None:
        statement = statement.where(
            col(SurveyResponse.created_at) < _as_utc_naive(params.submitted_before)
        )
    if params.distribution_id is not None:
        statement = statement.where(
            col(SurveyResponse.distribution_id) == params.distribution_id
        )
    return statement


async def _reconcile_response_count(session: AsyncSession, survey: Survey) -> int:
    result = await session.exec(
        select(func.count())
        .select_from(SurveyResponse)
        .where(
            col(SurveyResponse.survey_id) == survey.id,
            col(SurveyResponse.is_deleted).is_(False),
        )
    )
    survey.responses_count = result.one()
    return survey.responses_count


async def tombstone_responses(
    session: AsyncSession,
    responses: list[SurveyResponse],
    actor_id: UUID,
    *,
    preserve_withdrawal_digest: bool = False,
    now: datetime | None = None,
) -> int:
    """Clear response data and mark rows deleted without committing the transaction."""
    deleted_at = now or utc_now()
    erased_count = 0
    for response in responses:
        if response.is_deleted:
            continue
        response.answers = {}
        response.distribution_id = None
        response.idempotency_key = None
        response.idempotency_hash = None
        response.consent_version = None
        response.consented_at = None
        response.consent_notice_snapshot = None
        response.provider = None
        response.auth_user_id = None
        response.email = None
        response.display_name = None
        response.email_verified = None
        response.identity_captured_at = None
        if not preserve_withdrawal_digest:
            response.withdrawal_credential_digest = None
            response.respondent_key_digest = None
        response.is_deleted = True
        response.deleted_at = deleted_at
        response.updated_at = deleted_at
        response.performed_by = actor_id
        session.add(response)
        erased_count += 1
    return erased_count


async def withdraw_response(
    session: AsyncSession,
    payload: SurveyResponseWithdrawalRequest,
    *,
    actor_id: UUID | None = None,
) -> SurveyResponseWithdrawalResult:
    """Withdraw a response using only its respondent-held code."""
    withdrawal_digest = hash_withdrawal_code(payload.withdrawal_code)
    candidates_result = await session.exec(
        select(SurveyResponse)
        .where(col(SurveyResponse.withdrawal_credential_digest) == withdrawal_digest)
        .order_by(col(SurveyResponse.id))
    )
    candidate = next(
        (
            response
            for response in candidates_result.all()
            if response.withdrawal_credential_digest is not None
            and hmac.compare_digest(response.withdrawal_credential_digest, withdrawal_digest)
        ),
        None,
    )
    if candidate is None:
        await session.rollback()
        raise AppError(GENERIC_WITHDRAWAL_ERROR, status_code=status.HTTP_404_NOT_FOUND)

    survey = await resolve_survey(
        session,
        candidate.survey_id,
        include_deleted=True,
        for_update=True,
    )
    response_result = await session.exec(
        select(SurveyResponse)
        .where(
            col(SurveyResponse.id) == candidate.id,
            col(SurveyResponse.survey_id) == survey.id,
        )
        .with_for_update()
    )
    response = response_result.first()
    if (
        response is None
        or response.withdrawal_credential_digest is None
        or not hmac.compare_digest(response.withdrawal_credential_digest, withdrawal_digest)
    ):
        await session.rollback()
        raise AppError(GENERIC_WITHDRAWAL_ERROR, status_code=status.HTTP_404_NOT_FOUND)

    if response.is_deleted:
        await session.rollback()
        return SurveyResponseWithdrawalResult(withdrawn=True)

    system_actor = actor_id or settings.SYSTEM_ACTOR_ID
    await tombstone_responses(
        session,
        [response],
        system_actor,
        preserve_withdrawal_digest=True,
    )
    await _reconcile_response_count(session, survey)
    survey.updated_at = utc_now()
    survey.performed_by = system_actor
    session.add(survey)
    await commit_with_audit(
        session,
        [
            AuditEvent(
                action="withdraw",
                resource_type="survey_response_withdrawal",
                resource_id=survey.survey_id,
                performed_by=system_actor,
                changes={"result": "withdrawn"},
                ip_address=None,
            )
        ],
    )
    return SurveyResponseWithdrawalResult(withdrawn=True)


def _erasure_request_hash(
    payload: EraseSelectedResponses | EraseAllResponses,
) -> str:
    data = payload.model_dump(mode="json")
    if isinstance(payload, EraseSelectedResponses):
        data["response_ids"] = sorted(data["response_ids"])
    return hashlib.sha256(
        json.dumps(data, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


async def erase_responses(
    session: AsyncSession,
    survey_id: UUID,
    payload: EraseSelectedResponses | EraseAllResponses,
    idempotency_key: UUID,
    actor_id: UUID,
    ip_address: str | None = None,
) -> ResponseErasureResult:
    survey = await resolve_survey(
        session, survey_id, include_deleted=True, for_update=True
    )
    request_hash = _erasure_request_hash(payload)
    receipt_result = await session.exec(
        select(ResponseErasureReceipt).where(
            col(ResponseErasureReceipt.survey_id) == survey_id,
            col(ResponseErasureReceipt.idempotency_key) == idempotency_key,
        )
    )
    receipt = receipt_result.first()
    if receipt is not None:
        if receipt.request_hash != request_hash:
            raise AppError(
                "Idempotency-Key was already used with a different erasure request.",
                status_code=status.HTTP_409_CONFLICT,
                errors={"code": "idempotency_conflict"},
            )
        return ResponseErasureResult.model_validate(
            {
                "scope": receipt.scope,
                "requested_count": receipt.requested_count,
                "erased_count": receipt.erased_count,
            }
        )

    if isinstance(payload, EraseAllResponses) and not survey.is_deleted:
        raise AppError(
            "All responses can only be erased after the survey is archived.",
            status_code=status.HTTP_409_CONFLICT,
        )

    response_statement = select(SurveyResponse).where(
        col(SurveyResponse.survey_id) == survey_id
    )
    if isinstance(payload, EraseSelectedResponses):
        response_statement = response_statement.where(
            col(SurveyResponse.id).in_(payload.response_ids)
        )
    response_statement = response_statement.order_by(col(SurveyResponse.id)).with_for_update()
    responses_result = await session.exec(response_statement)
    responses = list(responses_result.all())

    if isinstance(payload, EraseSelectedResponses):
        if len(responses) != len(payload.response_ids):
            raise AppError(
                "One or more selected responses do not belong to this survey.",
                status_code=status.HTTP_404_NOT_FOUND,
            )
        if any(response.is_deleted for response in responses):
            raise AppError(
                "One or more selected responses have already been erased.",
                status_code=status.HTTP_409_CONFLICT,
            )
        requested_count = len(payload.response_ids)
    else:
        requested_count = payload.expected_response_count
        live_count = sum(not response.is_deleted for response in responses)
        if requested_count != live_count or survey.responses_count != requested_count:
            raise AppError(
                "The expected response count does not match the archived survey.",
                status_code=status.HTTP_409_CONFLICT,
            )

    now = utc_now()
    erased_count = await tombstone_responses(
        session,
        responses,
        actor_id,
        now=now,
    )
    await _reconcile_response_count(session, survey)
    survey.updated_at = now
    survey.performed_by = actor_id
    session.add(survey)
    receipt = ResponseErasureReceipt(
        survey_id=survey_id,
        idempotency_key=idempotency_key,
        request_hash=request_hash,
        scope=payload.scope,
        requested_count=requested_count,
        erased_count=erased_count,
        performed_by=actor_id,
    )
    session.add(receipt)
    await commit_with_audit(
        session,
        [
            AuditEvent(
                action="erase",
                resource_type="survey_response_batch",
                resource_id=str(survey_id),
                performed_by=actor_id,
                changes={
                    "scope": payload.scope,
                    "requested_count": requested_count,
                    "erased_count": erased_count,
                },
                ip_address=ip_address,
            )
        ],
    )
    return ResponseErasureResult(
        scope=payload.scope,
        requested_count=requested_count,
        erased_count=erased_count,
    )
