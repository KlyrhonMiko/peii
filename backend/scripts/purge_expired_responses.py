"""Run the bounded response-retention purge from an operational scheduler."""

import argparse
import asyncio
import sys
from datetime import datetime
from pathlib import Path

# Match the other operational scripts when invoked as
# ``python scripts/purge_expired_responses.py`` from backend/.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from core.database import async_session_factory
from services.response_retention_service import (
    DEFAULT_RETENTION_BATCH_SIZE,
    purge_expired_responses,
)


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--batch-size", type=int, default=DEFAULT_RETENTION_BATCH_SIZE)
    parser.add_argument(
        "--cutoff",
        type=datetime.fromisoformat,
        default=None,
        help="Optional ISO-8601 cutoff; defaults to the current UTC time.",
    )
    return parser.parse_args()


async def _run(args: argparse.Namespace) -> None:
    async with async_session_factory() as session:
        result = await purge_expired_responses(
            session,
            cutoff=args.cutoff,
            batch_size=args.batch_size,
            dry_run=args.dry_run,
        )
    print(
        f"retention purge: purged={result.purged_count} "
        f"surveys={result.survey_count} batches={result.batch_count} "
        f"dry_run={result.dry_run} cutoff={result.cutoff.isoformat()}"
    )


def main() -> None:
    asyncio.run(_run(_parse_args()))


if __name__ == "__main__":
    main()
