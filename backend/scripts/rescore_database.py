import argparse
import asyncio
import logging
import sys
import time
from pathlib import Path
from typing import Protocol, cast

from sqlmodel import col, select
from sqlalchemy.orm.attributes import flag_modified

class _ReconfigurableTextStream(Protocol):
    def reconfigure(self, *, line_buffering: bool) -> None: ...

for stream in (sys.stdout, sys.stderr):
    if hasattr(stream, "reconfigure"):
        cast(_ReconfigurableTextStream, stream).reconfigure(line_buffering=True)

# Ensure Python can resolve backend packages
BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

import torch  # noqa: E402
from core.analytics_cache import ainvalidate_survey_analytics  # noqa: E402
from core.database import async_session_factory, engine  # noqa: E402
from models.survey import Survey  # noqa: E402
from models.survey_question import SurveyQuestion  # noqa: E402
from models.survey_response import SurveyResponse  # noqa: E402
from services.audit_service import AuditEvent, commit_with_audit  # noqa: E402
from services.ml_service import FeedbackAnalyzer  # noqa: E402
from core.config import settings  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("rescore_database")


def print_cuda_diagnostics():
    cuda_avail = torch.cuda.is_available()
    device_name = torch.cuda.get_device_name(0) if cuda_avail else "N/A"
    print("=" * 65)
    print(" PEII CUDA BATCH RESCORING ENGINE")
    print("=" * 65)
    print(f" CUDA Hardware Available : {cuda_avail}")
    if cuda_avail:
        print(f" Target GPU              : {device_name}")
        print(f" CUDA Version            : {torch.version.cuda}")
    print("=" * 65)


async def rescore(
    response_id_filter: str | None = None,
    survey_id_filter: str | None = None,
    limit: int | None = None,
    batch_commit_size: int = 25,
    dry_run: bool = False,
):
    print_cuda_diagnostics()

    try:
        # 1. Warm up analyzer
        print("\n[1/4] Initializing CUDA-accelerated FeedbackAnalyzer...")
        t_init_start = time.time()
        analyzer = FeedbackAnalyzer.get_instance()
        t_init_end = time.time()
        print(f"      Analyzer initialized in {t_init_end - t_init_start:.2f}s.")

        # 2. Fetch surveys and questions into memory
        print("\n[2/4] Pre-loading active surveys and questions from Supabase...")
        async with async_session_factory() as session:
            survey_query = select(Survey)
            if survey_id_filter:
                survey_query = survey_query.where(Survey.id == survey_id_filter)
            else:
                survey_query = survey_query.where(Survey.status == "Active")

            surveys = (await session.exec(survey_query)).all()
            if not surveys:
                print("No matching active surveys found.")
                return

            survey_ids = [s.id for s in surveys]
            print(f"      Found {len(surveys)} survey(s): {[s.title for s in surveys]}")

            # Fetch questions
            questions_query = select(SurveyQuestion).where(
                col(SurveyQuestion.survey_id).in_(survey_ids),
                col(SurveyQuestion.is_deleted).is_(False),
            )
            questions_list = (await session.exec(questions_query)).all()
            questions_by_id = {str(q.id): q for q in questions_list}
            print(f"      Loaded {len(questions_by_id)} questions into memory cache.")

        # 3. Fetch responses
        print("\n[3/4] Fetching survey responses to rescore...")
        async with async_session_factory() as session:
            resp_query = select(SurveyResponse).where(
                col(SurveyResponse.is_deleted).is_(False),
            )
            if response_id_filter:
                resp_query = resp_query.where(SurveyResponse.id == response_id_filter)
            elif survey_id_filter:
                resp_query = resp_query.where(col(SurveyResponse.survey_id) == survey_id_filter)
            else:
                resp_query = resp_query.where(col(SurveyResponse.survey_id).in_(survey_ids))

            resp_query = resp_query.order_by(SurveyResponse.created_at.desc())

            if limit:
                resp_query = resp_query.limit(limit)

            responses = (await session.exec(resp_query)).all()
            total_responses = len(responses)
            print(f"      Total responses to process: {total_responses}")
            if total_responses == 0:
                print("No responses found to rescore.")
                return

        # 4. Process responses
        print(f"\n[4/4] Starting inference (Dry Run: {dry_run}, Batch Commit Size: {batch_commit_size})...\n")
        start_time = time.time()
        processed_count = 0
        updated_count = 0
        modified_surveys: set = set()

        for i, resp in enumerate(responses):
            resp_t0 = time.time()
            answers = resp.answers or {}
            new_sentiments = {}

            for qid, ans in answers.items():
                if isinstance(ans, str) and ans.strip():
                    q = questions_by_id.get(qid)
                    if q and q.question_type == "text":
                        q_text_lower = q.question_text.lower()
                        if any(kw in q_text_lower for kw in ["email", "name", "number"]):
                            continue

                        prompt = f"Question: {q.question_text} Answer: {ans}"
                        res = analyzer.analyze_feedback(prompt, ans)
                        if res:
                            new_sentiments[qid] = res

            resp_elapsed = time.time() - resp_t0
            processed_count += 1

            if new_sentiments:
                updated_count += 1
                modified_surveys.add(resp.survey_id)

            status_str = f"Rescored {len(new_sentiments)} sentiment targets" if new_sentiments else "No dimensions matched"
            print(
                f"[{processed_count}/{total_responses}] Response {resp.id} ({resp_elapsed:.2f}s) -> {status_str}"
            )
            if new_sentiments and (dry_run or total_responses <= 5):
                for qk, sval in new_sentiments.items():
                    q_text = questions_by_id[qk].question_text if qk in questions_by_id else qk
                    print(f"      * Q: '{q_text[:35]}...' -> {sval}")

            if not dry_run and new_sentiments:
                async with async_session_factory() as update_session:
                    db_resp = await update_session.get(SurveyResponse, resp.id)
                    if db_resp:
                        db_resp.ml_sentiments = new_sentiments
                        flag_modified(db_resp, "ml_sentiments")
                        update_session.add(db_resp)
                        await commit_with_audit(
                            update_session,
                            [
                                AuditEvent(
                                    action="ml_sentiments_rescored",
                                    resource_type="survey_response",
                                    resource_id=str(resp.id),
                                    performed_by=settings.SYSTEM_ACTOR_ID,
                                )
                            ],
                        )

        total_time = time.time() - start_time
        avg_speed = total_time / max(processed_count, 1)

        print("\n" + "=" * 65)
        print(" RESCORING COMPLETE SUMMARY")
        print("=" * 65)
        print(f" Total Responses Processed : {processed_count}")
        print(f" Successfully Rescored     : {updated_count}")
        print(f" Total Elapsed Time        : {total_time:.2f}s")
        print(f" Average Speed             : {avg_speed:.2f}s per response")
        print(f" Throughput                : {processed_count / max(total_time, 0.001):.2f} resp/sec")
        print("=" * 65)

        if not dry_run and modified_surveys:
            print("\nInvalidating analytics cache for updated surveys...")
            for sid in modified_surveys:
                await ainvalidate_survey_analytics(sid)
                print(f"   -> Invalidated cache for survey {sid}")
            print("Analytics caches refreshed successfully.")

    finally:
        from core.database import async_engine
        await async_engine.dispose()


def main():
    parser = argparse.ArgumentParser(description="CUDA-Accelerated Survey Response Rescoring")
    parser.add_argument("--response-id", type=str, default=None, help="Target specific response UUID")
    parser.add_argument("--survey-id", type=str, default=None, help="Target specific survey UUID")
    parser.add_argument("--limit", type=int, default=None, help="Limit number of responses to rescore")
    parser.add_argument("--batch-commit", type=int, default=25, help="Batch commit size")
    parser.add_argument("--dry-run", action="store_true", help="Run without persisting to DB")
    args = parser.parse_args()

    asyncio.run(
        rescore(
            response_id_filter=args.response_id,
            survey_id_filter=args.survey_id,
            limit=args.limit,
            batch_commit_size=args.batch_commit,
            dry_run=args.dry_run,
        )
    )


if __name__ == "__main__":
    main()
