import asyncio
import csv
import io
import json
from collections.abc import AsyncIterator
from dataclasses import dataclass
from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from fastapi import status
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncResult
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from core.exceptions import AppError
from models.survey_question import SurveyQuestion
from models.survey_response import SurveyResponse
from models.survey_section import SurveySection
from services.audit_service import AuditEvent, commit_with_audit
from services.base_service import utc_now
from services.survey_service import resolve_survey

EXPORT_LIMIT = 10_000
EXPORT_PARTITION_SIZE = 256
EXPORT_CHUNK_SIZE = 64 * 1024
EXPORT_COLUMNS = (
    "response_id",
    "submitted_at",
    "question_id",
    "question_text",
    "question_type",
    "answer_json",
)


@dataclass(frozen=True)
class PreparedResponseExport:
    """A preflighted export whose stream starts only after its start audit commits."""

    export_id: UUID
    response_count: int
    content: AsyncIterator[bytes]


def _safe_csv_text(value: object) -> str:
    text = str(value).replace("\x00", "\ufffd")
    formula_candidate = text.lstrip()
    if formula_candidate.startswith(("=", "+", "-", "@")) or text.lstrip(" ").startswith(
        ("\t", "\r", "\n")
    ):
        return "'" + text
    return text


def _csv_row_bytes(values: list[object]) -> bytes:
    output = io.StringIO(newline="")
    csv.writer(output, lineterminator="\n").writerow(
        [_safe_csv_text(value) for value in values]
    )
    return output.getvalue().encode("utf-8")


def _export_response_filter(survey_id: UUID, now: datetime):
    return (
        col(SurveyResponse.survey_id) == survey_id,
        col(SurveyResponse.is_deleted).is_(False),
        (
            col(SurveyResponse.retention_expires_at).is_(None)
            | (col(SurveyResponse.retention_expires_at) > now)
        ),
    )


async def _count_exportable_responses(
    session: AsyncSession, survey_id: UUID, now: datetime
) -> int:
    result = await session.exec(
        select(func.count())
        .select_from(SurveyResponse)
        .where(*_export_response_filter(survey_id, now))
    )
    return result.one()


async def _load_export_questions(
    session: AsyncSession, survey_id: UUID
) -> list[SurveyQuestion]:
    result = await session.exec(
        select(SurveyQuestion)
        .join(SurveySection, col(SurveySection.id) == SurveyQuestion.section_id)
        .where(
            col(SurveyQuestion.survey_id) == survey_id,
            col(SurveySection.survey_id) == survey_id,
            col(SurveySection.is_deleted).is_(False),
            col(SurveyQuestion.is_deleted).is_(False),
        )
        .order_by(
            col(SurveySection.order_index),
            col(SurveySection.id),
            col(SurveyQuestion.order_index),
            col(SurveyQuestion.id),
        )
    )
    return list(result.all())


def _audit_changes(
    export_id: UUID,
    response_count: int,
    *,
    answer_row_count: int | None = None,
    reason: str | None = None,
) -> dict[str, Any]:
    changes: dict[str, Any] = {
        "export_id": str(export_id),
        "response_count": response_count,
    }
    if answer_row_count is not None:
        changes["answer_row_count"] = answer_row_count
    if reason is not None:
        changes["reason"] = reason
    return changes


async def _best_effort_aborted_audit(
    session: AsyncSession,
    survey_id: str,
    actor_id: UUID,
    ip_address: str | None,
    export_id: UUID,
    response_count: int,
    answer_row_count: int,
    reason: str,
) -> None:
    try:
        await commit_with_audit(
            session,
            [
                AuditEvent(
                    action="export_aborted",
                    resource_type="survey_response",
                    resource_id=survey_id,
                    performed_by=actor_id,
                    changes=_audit_changes(
                        export_id,
                        response_count,
                        answer_row_count=answer_row_count,
                        reason=reason,
                    ),
                    ip_address=ip_address,
                )
            ],
        )
    except BaseException:
        # The original stream failure is more useful to the caller.  Aborted
        # audit recording is deliberately best effort after headers are sent.
        return


async def _stream_export_rows(
    session: AsyncSession,
    survey_id: UUID,
    survey_business_id: str,
    actor_id: UUID,
    ip_address: str | None,
    export_id: UUID,
    response_count: int,
    questions: list[SurveyQuestion],
    now: datetime,
) -> AsyncIterator[bytes]:
    statement = (
        select(SurveyResponse.id, SurveyResponse.created_at, SurveyResponse.answers)
        .where(*_export_response_filter(survey_id, now))
        .order_by(col(SurveyResponse.id))
        .limit(response_count)
    )
    stream_result: AsyncResult[Any] | None = None
    error: BaseException | None = None
    response_iterated_count = 0
    answer_row_count = 0
    buffered = bytearray()

    try:
        buffered.extend(_csv_row_bytes(list(EXPORT_COLUMNS)))
        if len(buffered) >= EXPORT_CHUNK_SIZE:
            yield bytes(buffered[:EXPORT_CHUNK_SIZE])
            del buffered[:EXPORT_CHUNK_SIZE]

        stream_result = await session.stream(statement)
        async for partition in stream_result.partitions(EXPORT_PARTITION_SIZE):
            for record in partition:
                if response_iterated_count >= response_count:
                    break
                response_id, created_at, answers = record
                response_iterated_count += 1
                if not isinstance(answers, dict):
                    continue
                for question in questions:
                    question_id = str(question.id)
                    if question_id not in answers:
                        continue
                    answer_row_count += 1
                    answer_json = json.dumps(
                        answers[question_id],
                        sort_keys=True,
                        separators=(",", ":"),
                        ensure_ascii=False,
                        allow_nan=False,
                    )
                    row = bytearray(
                        _csv_row_bytes(
                            [
                                response_id,
                                created_at.isoformat(),
                                question.id,
                                question.question_text,
                                question.question_type,
                                answer_json,
                            ]
                        )
                    )
                    while row:
                        available = EXPORT_CHUNK_SIZE - len(buffered)
                        take = min(available, len(row))
                        buffered.extend(row[:take])
                        del row[:take]
                        if len(buffered) == EXPORT_CHUNK_SIZE:
                            yield bytes(buffered)
                            buffered.clear()
            if response_iterated_count >= response_count:
                break
        if buffered:
            yield bytes(buffered)
    except BaseException as exc:
        error = exc
    finally:
        if stream_result is not None:
            try:
                await stream_result.close()
            except BaseException as close_error:
                if error is None:
                    error = close_error
        if error is not None:
            await _best_effort_aborted_audit(
                session,
                survey_business_id,
                actor_id,
                ip_address,
                export_id,
                response_iterated_count,
                answer_row_count,
                "cancelled" if isinstance(error, asyncio.CancelledError) else "generation_failed",
            )

    if error is not None:
        raise error

    try:
        await commit_with_audit(
            session,
            [
                AuditEvent(
                    action="export",
                    resource_type="survey_response",
                    resource_id=survey_business_id,
                    performed_by=actor_id,
                    changes=_audit_changes(
                        export_id,
                        response_iterated_count,
                        answer_row_count=answer_row_count,
                    ),
                    ip_address=ip_address,
                )
            ],
        )
    except BaseException:
        await _best_effort_aborted_audit(
            session,
            survey_business_id,
            actor_id,
            ip_address,
            export_id,
            response_iterated_count,
            answer_row_count,
            "generation_failed",
        )
        raise


async def prepare_response_export(
    session: AsyncSession,
    survey_id: UUID,
    actor_id: UUID,
    ip_address: str | None = None,
) -> PreparedResponseExport:
    """Preflight and audit an export before returning its deferred CSV stream."""
    survey = await resolve_survey(session, survey_id, include_deleted=True)
    now = utc_now()
    response_count = await _count_exportable_responses(session, survey_id, now)
    if response_count > EXPORT_LIMIT:
        raise AppError(
            "Response export is limited to 10,000 responses.",
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
        )
    questions = await _load_export_questions(session, survey_id)
    export_id = uuid4()
    await commit_with_audit(
        session,
        [
            AuditEvent(
                action="export_started",
                resource_type="survey_response",
                resource_id=survey.survey_id,
                performed_by=actor_id,
                changes=_audit_changes(export_id, response_count),
                ip_address=ip_address,
            )
        ],
    )
    return PreparedResponseExport(
        export_id=export_id,
        response_count=response_count,
        content=_stream_export_rows(
            session,
            survey_id,
            survey.survey_id,
            actor_id,
            ip_address,
            export_id,
            response_count,
            questions,
            now,
        ),
    )
