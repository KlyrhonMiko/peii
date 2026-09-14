"""Remove the known obsolete privacy paragraph from canonical deployed surveys.

Dry-run is the default. Pass ``--confirm`` to apply the exact-match update and
record it in the audit log under the system actor.
"""

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from core.config import settings
from models.survey import Survey
from services.audit_service import AuditEvent, commit_with_audit

CANONICAL_SURVEY_TITLE = "GRADUATE TRACER STUDY SURVEY"
LEGACY_DATA_PRIVACY_BLOCK = (
    "Data Privacy Notice: In accordance with the Data Privacy Act of 2012 "
    "(Republic Act No. 10173), all personal information collected will be treated with strict "
    "confidentiality. The data will be used solely for academic and research purposes. "
    "Participation in this survey is voluntary, and you may choose to withdraw at any time "
    "without any penalty. All information will be securely stored and protected. You may also "
    "visit https://privacy.gov.ph/data-privacy-act/ to learn more about your rights."
)


def remove_legacy_privacy_notice(description: str | None) -> str | None:
    if description is None:
        return None
    paragraphs = description.split("\n\n")
    if LEGACY_DATA_PRIVACY_BLOCK not in paragraphs:
        return description
    return "\n\n".join(
        paragraph for paragraph in paragraphs if paragraph != LEGACY_DATA_PRIVACY_BLOCK
    )


async def update_canonical_survey_notices(
    session: AsyncSession,
    *,
    confirm: bool,
) -> int:
    statement = select(Survey).where(
        col(Survey.title) == CANONICAL_SURVEY_TITLE,
        col(Survey.is_deleted).is_(False),
    )
    if confirm:
        statement = statement.with_for_update()
    surveys = list((await session.exec(statement)).all())
    updates = [
        (survey, updated)
        for survey in surveys
        if (updated := remove_legacy_privacy_notice(survey.description))
        != survey.description
    ]
    if not confirm or not updates:
        return len(updates)

    events: list[AuditEvent] = []
    for survey, updated in updates:
        survey.description = updated
        survey.performed_by = settings.SYSTEM_ACTOR_ID
        session.add(survey)
        events.append(
            AuditEvent(
                action="privacy_notice_corrected",
                resource_type="survey",
                resource_id=survey.survey_id,
                performed_by=settings.SYSTEM_ACTOR_ID,
                changes={"legacy_privacy_notice_removed": True},
            )
        )
    await commit_with_audit(session, events)
    return len(updates)


async def _run(confirm: bool) -> int:
    from core.database import async_session_factory

    async with async_session_factory() as session:
        count = await update_canonical_survey_notices(session, confirm=confirm)
    mode = "updated" if confirm else "would update"
    print(f"{mode}: {count} canonical survey(s)")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--confirm",
        action="store_true",
        help="Apply the exact-match correction; omission performs a dry run.",
    )
    args = parser.parse_args()
    return asyncio.run(_run(args.confirm))


if __name__ == "__main__":
    raise SystemExit(main())
