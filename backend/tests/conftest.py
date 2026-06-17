import asyncio
import socket
import sys
import threading
from collections.abc import AsyncIterator, Iterator
from pathlib import Path

import httpx
import pytest
import uvicorn
from dotenv import load_dotenv
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

ROOT_DIR = Path(__file__).resolve().parents[1]
PROJECT_ROOT = ROOT_DIR.parent
sys.path.insert(0, str(ROOT_DIR))
load_dotenv(PROJECT_ROOT / ".env", override=True)

from core.database import get_session  # noqa: E402
from main import app  # noqa: E402


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture
async def client() -> AsyncIterator[httpx.AsyncClient]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)

    def override_get_session() -> Iterator[Session]:
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = override_get_session

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        host, port = sock.getsockname()

    server = uvicorn.Server(
        uvicorn.Config(
            app,
            host=host,
            port=port,
            log_level="warning",
        )
    )
    server_thread = threading.Thread(target=server.run, daemon=True)
    server_thread.start()

    async with httpx.AsyncClient(
        base_url=f"http://{host}:{port}",
        timeout=5.0,
    ) as test_client:
        for _ in range(50):
            try:
                response = await test_client.get("/api/v1/health")
                if response.status_code == 200:
                    break
            except httpx.HTTPError:
                pass
            await asyncio.sleep(0.1)
        else:
            raise RuntimeError("Test server did not start.")

        yield test_client

    server.should_exit = True
    server_thread.join(timeout=5)
    app.dependency_overrides.clear()
