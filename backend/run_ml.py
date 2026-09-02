import sys
import asyncio
import time
import logging
from pathlib import Path

# Force real-time printing
sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)

# Ensure Python can find the core and models folders
sys.path.insert(0, str(Path(__file__).resolve().parent))

from sqlmodel import select
from core.database import async_session_factory
from models.survey import Survey
from models.survey_response import SurveyResponse
from services.ml_service import analyze_response_background

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def backfill():
    async with async_session_factory() as session:
        print("Fetching active survey...")
        survey = (await session.exec(select(Survey).where(Survey.status == 'Active'))).first()
        if not survey:
            print("No active survey found.")
            return

        print("Fetching survey responses...")
        responses = (await session.exec(
            select(SurveyResponse)
            .where(SurveyResponse.survey_id == survey.id)
        )).all()
        
        # Only process responses that don't have ML sentiments yet
        responses_to_process = [r for r in responses if not r.ml_sentiments]
        
        print(f"Found {len(responses_to_process)} responses that need ML sentiment analysis.")
        
        for i, response in enumerate(responses_to_process):
            print(f"[{i+1}/{len(responses_to_process)}] Processing response {response.id}...")
            # Run the HuggingFace pipelines
            await analyze_response_background(str(response.id))
            
        print("Finished processing all responses!")

if __name__ == "__main__":
    asyncio.run(backfill())
