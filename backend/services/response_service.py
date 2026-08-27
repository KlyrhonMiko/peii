import hashlib
import hmac
import json
import math
import secrets
from datetime import UTC, date, datetime, timedelta
from uuid import UUID

from fastapi import status
from sqlalchemy import func, update
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from core.config import settings
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
from services.distribution_service import get_distribution_and_survey_by_token
from services.question_validation import (
    get_matrix_columns,
    get_scale_bounds,
    validate_question_definition,
)
from services.survey_service import resolve_survey
from utils.sorting import stable_order_by

_LOCAL_WITHDRAWAL_HMAC_SECRET = secrets.token_bytes(32)
GENERIC_WITHDRAWAL_ERROR = "Response not found or already withdrawn."


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
) -> None:
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
    questions = {str(question.id): question for question in questions_result.all()}

    validation_errors: list[dict[str, str]] = []
    unknown_keys = sorted(set(answers) - set(questions))
    validation_errors.extend(
        {
            "question_id": question_id,
            "code": "unknown_question",
            "message": "Question does not belong to this survey.",
        }
        for question_id in unknown_keys
    )

    for question_id, question in questions.items():
        if question.is_required and (
            question_id not in answers or _is_blank_answer(answers[question_id])
        ):
            validation_errors.append(
                {
                    "question_id": question_id,
                    "code": "required",
                    "message": "This question is required.",
                }
            )
            continue
        if question_id not in answers:
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
    token: str,
    answers: dict[str, object],
    actor_id: UUID,
    idempotency_key: UUID | None = None,
    ip_address: str | None = None,
    consent_version: str | None = None,
    withdrawal_code: str | None = None,
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

    # Resolve the token reference without a lock, then acquire the survey's
    # exclusive lock before locking and revalidating its distribution.
    distribution, survey = await get_distribution_and_survey_by_token(
        session,
        token,
        for_update=True,
        shared_lock=False,
    )

    answers_hash = None
    if idempotency_key is not None:
        answers_hash = response_idempotency_hash(answers, consent_version, withdrawal_code)
        legacy_answers_hash = hashlib.sha256(
            json.dumps(answers, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()
        ).hexdigest()
        existing_result = await session.exec(
            select(SurveyResponse).where(
                col(SurveyResponse.distribution_id) == distribution.id,
                col(SurveyResponse.idempotency_key) == idempotency_key,
            ).with_for_update()
        )
        existing = existing_result.first()
        if existing is not None:
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

    if survey.is_deleted or survey.status != "Active":
        raise AppError(
            "Survey not found or no longer active.", status_code=status.HTTP_404_NOT_FOUND
        )

    await _validate_answers(session, distribution.survey_id, answers)

    accepted_at = utc_now()
    response = SurveyResponse(
        survey_id=distribution.survey_id,
        distribution_id=distribution.id,
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

    await commit_with_audit(
        session,
        [
            AuditEvent(
                action="create",
                resource_type="survey_response",
                resource_id=str(response.id),
                performed_by=actor_id,
                changes={"distribution_id": str(distribution.id)},
                ip_address=None,
            ),
            AuditEvent(
                action="response_submitted",
                resource_type="survey",
                resource_id=survey.survey_id,
                performed_by=actor_id,
                changes={"response_id": str(response.id)},
                ip_address=None,
            ),
        ],
    )
    await session.refresh(response)
    return response, False


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
        if not preserve_withdrawal_digest:
            response.withdrawal_credential_digest = None
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
