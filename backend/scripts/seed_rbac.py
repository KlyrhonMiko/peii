import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.database import async_session_factory
from services.rbac_service import ensure_permission_catalog


async def main() -> None:
    async with async_session_factory() as session:
        await ensure_permission_catalog(session)


if __name__ == "__main__":
    asyncio.run(main())
