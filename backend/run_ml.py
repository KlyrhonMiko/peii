import argparse
import asyncio
import logging
import sys
from pathlib import Path
from typing import Protocol, cast

from sqlmodel import select


class _ReconfigurableTextStream(Protocol):
    def reconfigure(self, *, line_buffering: bool) -> None: ...

# Force real-time printing when the active streams support reconfiguration.
for stream in (sys.stdout, sys.stderr):
    if hasattr(stream, "reconfigure"):
        cast(_ReconfigurableTextStream, stream).reconfigure(line_buffering=True)

# Ensure Python can find the core and models folders
sys.path.insert(0, str(Path(__file__).resolve().parent))

from core.database import async_session_factory  # noqa: E402
from models.survey import Survey  # noqa: E402
from models.survey_response import SurveyResponse  # noqa: E402
from services.ml_service import analyze_response_background  # noqa: E402

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def backfill(force: bool = False):
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
        
        # Process responses that don't have ML sentiments yet, or all if force=True
        responses_to_process = responses if force else [r for r in responses if not r.ml_sentiments]
        
        print(f"Found {len(responses_to_process)} responses that need ML sentiment analysis.")
        
        for i, response in enumerate(responses_to_process):
            print(f"[{i+1}/{len(responses_to_process)}] Processing response {response.id}...")
            # Run the HuggingFace pipelines
            await analyze_response_background(str(response.id))
            
        print("Finished processing all responses!")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Batch ML Scoring")
    parser.add_argument("--force", action="store_true", help="Force re-score of all responses")
    args = parser.parse_args()
    
    asyncio.run(backfill(force=args.force))
