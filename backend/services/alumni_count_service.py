from collections.abc import Sequence
from uuid import UUID

from fastapi import status
from sqlalchemy import text
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from core.exceptions import AppError
from models.alumni_count import AlumniCount
from models.base_model import utc_now
from schemas.alumni_count import AlumniCountReplace, AlumniTotalRead
from services.audit_service import AuditEvent, commit_with_audit
from services.survey_analytics_service import (
    DEPARTMENT_MAPPING,
    college_for_degree,
    normalize_peii_filters,
)

# Counts are keyed by the same degree answers the PEII department filter accepts.
KNOWN_DEGREE_PROGRAMS = frozenset(
    degree for degrees in DEPARTMENT_MAPPING.values() for degree in degrees
)


async def list_alumni_counts(session: AsyncSession) -> Sequence[AlumniCount]:
    result = await session.exec(
        select(AlumniCount)
        .where(col(AlumniCount.is_deleted).is_(False))
        .order_by(col(AlumniCount.batch_year), col(AlumniCount.degree_program))
    )
    return result.all()


def _validate_entries(payload: AlumniCountReplace) -> None:
    seen: set[tuple[str, str]] = set()
    errors: list[dict[str, str]] = []
    for index, entry in enumerate(payload.counts):
        key = (entry.batch_year, entry.degree_program)
        if entry.degree_program not in KNOWN_DEGREE_PROGRAMS:
            errors.append(
                {"field": f"counts.{index}.degree_program", "message": "Unknown degree program."}
            )
        if key in seen:
            errors.append(
                {"field": f"counts.{index}", "message": "Duplicate batch and degree program."}
            )
        seen.add(key)
    if errors:
        raise AppError(
            "Alumni counts contain invalid rows.",
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            errors=errors,
        )


async def replace_alumni_counts(
    session: AsyncSession,
    payload: AlumniCountReplace,
    actor_id: UUID,
    ip_address: str | None,
) -> Sequence[AlumniCount]:
    """Make the stored totals equal the payload, reviving soft-deleted keys."""
    _validate_entries(payload)
    # Serialize the whole replacement before taking its read snapshot, including an empty
    # table or keys not yet inserted. Row locks alone do not protect those cases.
    if session.get_bind().dialect.name == "postgresql":
        await session.execute(text("LOCK TABLE alumni_counts IN SHARE ROW EXCLUSIVE MODE"))
    existing = {
        (row.batch_year, row.degree_program): row
        for row in (await session.exec(select(AlumniCount).with_for_update())).all()
    }
    wanted = {(entry.batch_year, entry.degree_program): entry.total for entry in payload.counts}
    before = {
        f"{key[0]}|{key[1]}": row.total for key, row in existing.items() if not row.is_deleted
    }
    now = utc_now()

    for key, total in wanted.items():
        row = existing.get(key)
        if row is None:
            session.add(
                AlumniCount(
                    batch_year=key[0], degree_program=key[1], total=total, performed_by=actor_id
                )
            )
            continue
        if row.is_deleted or row.total != total:
            row.total = total
            row.is_deleted = False
            row.deleted_at = None
            row.performed_by = actor_id
            session.add(row)

    for key, row in existing.items():
        if key not in wanted and not row.is_deleted:
            row.is_deleted = True
            row.deleted_at = now
            row.performed_by = actor_id
            session.add(row)

    after = {f"{key[0]}|{key[1]}": total for key, total in wanted.items()}
    await commit_with_audit(
        session,
        [
            AuditEvent(
                "replace",
                "alumni_counts",
                "all",
                actor_id,
                changes={"before": before, "after": after},
                ip_address=ip_address,
            )
        ],
    )
    return await list_alumni_counts(session)


async def alumni_total(
    session: AsyncSession,
    *,
    batch: str | None,
    department: str | None,
    degree: str | None,
) -> AlumniTotalRead:
    """Sum stored totals with the same filter meaning as PEII analytics.

    The cohort and college breakdowns use the same filters, so they line up with the
    dashboard's response counts for the same view.
    """
    batch, department, degree = normalize_peii_filters(batch, department, degree)
    statement = select(
        AlumniCount.batch_year, AlumniCount.degree_program, AlumniCount.total
    ).where(col(AlumniCount.is_deleted).is_(False))
    if batch is not None:
        statement = statement.where(col(AlumniCount.batch_year) == batch)
    if department is not None:
        statement = statement.where(
            col(AlumniCount.degree_program).in_(DEPARTMENT_MAPPING.get(department, []))
        )
    if degree is not None:
        statement = statement.where(col(AlumniCount.degree_program) == degree)
    rows = (await session.exec(statement)).all()

    by_batch: dict[str, int] = {}
    by_batch_college: dict[str, dict[str, int]] = {}
    by_batch_degree: dict[str, dict[str, int]] = {}
    for batch_year, degree_program, total in rows:
        by_batch[batch_year] = by_batch.get(batch_year, 0) + total
        colleges = by_batch_college.setdefault(batch_year, {})
        college = college_for_degree(degree_program)
        colleges[college] = colleges.get(college, 0) + total
        by_batch_degree.setdefault(batch_year, {})[degree_program] = total
    return AlumniTotalRead(
        alumni_total=sum(by_batch.values()) if rows else None,
        by_batch=by_batch,
        by_batch_college=by_batch_college,
        by_batch_degree=by_batch_degree,
        batch=batch,
        department=department,
        degree=degree,
    )
