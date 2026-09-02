import asyncio
import sys
import os

# Add backend directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from core.database import async_session_factory
from models.survey import Survey
from utils.identifiers import generate_business_id
from sqlmodel import select

async def migrate_survey_ids():
    async with async_session_factory() as session:
        result = await session.exec(select(Survey))
        surveys = result.all()
        for survey in surveys:
            if len(survey.survey_id) <= 12: # Old format SURV-XXXXXX is 11 chars
                old_id = survey.survey_id
                new_id = generate_business_id("SURV", 12)
                print(f"Updating {old_id} -> {new_id}")
                survey.survey_id = new_id
                session.add(survey)
        await session.commit()
        print("Migration complete!")

if __name__ == "__main__":
    asyncio.run(migrate_survey_ids())
