import asyncio
import os
import sys

# Add backend directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from sqlmodel import select

from core.config import settings
from core.database import async_session_factory
from models.survey import Survey
from services.audit_service import AuditEvent, commit_with_audit
from utils.identifiers import generate_business_id


async def migrate_survey_ids():
    async with async_session_factory() as session:
        result = await session.exec(select(Survey))
        surveys = result.all()
        events = []
        for survey in surveys:
            if len(survey.survey_id) <= 12: # Old format SURV-XXXXXX is 11 chars
                old_id = survey.survey_id
                new_id = generate_business_id("SURV", 12)
                print(f"Updating {old_id} -> {new_id}")
                survey.survey_id = new_id
                session.add(survey)
                events.append(
                    AuditEvent(
                        action="survey_id_migrated",
                        resource_type="survey",
                        resource_id=str(survey.id),
                        performed_by=settings.SYSTEM_ACTOR_ID,
                        changes={"survey_id": {"before": old_id, "after": new_id}},
                    )
                )
        if events:
            await commit_with_audit(session, events)
        print("Migration complete!")

if __name__ == "__main__":
    asyncio.run(migrate_survey_ids())
