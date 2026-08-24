import asyncio
import socket
import sys
import threading
from collections.abc import AsyncGenerator, AsyncIterator, Iterator
from pathlib import Path
from uuid import UUID, uuid5

import httpx
import pytest
import uvicorn
from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.ext.asyncio.session import AsyncSession

ROOT_DIR = Path(__file__).resolve().parents[1]
PROJECT_ROOT = ROOT_DIR.parent
sys.path.insert(0, str(ROOT_DIR))
load_dotenv(PROJECT_ROOT / ".env", override=True)

from core.database import get_async_session, get_session  # noqa: E402
from core.deps import Principal, get_current_principal  # noqa: E402
from main import app  # noqa: E402
from models.user import User  # noqa: E402
from services import user_service  # noqa: E402
from services.rbac_service import PERMISSIONS  # noqa: E402
from tests.integration.fixtures import (  # noqa: E402,F401
    PostgresTestDatabase,
    migrate_to,
    postgres_connection,
    postgres_database,
)


def pytest_addoption(parser: pytest.Parser) -> None:
    parser.addoption(
        "--require-postgres",
        action="store_true",
        default=False,
        help="fail instead of skip when TEST_DATABASE_URL is not configured",
    )


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture
async def client() -> AsyncIterator[httpx.AsyncClient]:
    # Sync engine for any direct sync DB access (if needed)
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)

    def override_get_session() -> Iterator[Session]:
        with Session(engine) as session:
            yield session

    # Async engine for app routes
    async_engine = create_async_engine(
        "sqlite+aiosqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with async_engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)

    async_session_factory = async_sessionmaker(
        async_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    async def override_get_async_session() -> AsyncGenerator[AsyncSession]:
        async with async_session_factory() as session:
            yield session

    app.dependency_overrides[get_session] = override_get_session
    app.dependency_overrides[get_async_session] = override_get_async_session

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


@pytest.fixture
def principal() -> Principal:
    user = User(
        id=UUID("00000000-0000-0000-0000-000000000001"),
        user_id="USER-TESTADMIN",
        auth_user_id=UUID("00000000-0000-0000-0000-000000000002"),
        email="admin@example.com",
        username="admin",
        first_name="Test",
        last_name="Admin",
    )
    return Principal(user=user, permissions=frozenset(PERMISSIONS), access_token="test")


@pytest.fixture(autouse=True)
def authenticated_principal(request: pytest.FixtureRequest, principal: Principal):
    if "client" not in request.fixturenames:
        yield
        return
    request.getfixturevalue("client")

    async def override_current_principal() -> Principal:
        return principal

    app.dependency_overrides[get_current_principal] = override_current_principal
    yield


@pytest.fixture(autouse=True)
def mock_supabase_user_provisioning(monkeypatch: pytest.MonkeyPatch):
    async def get_auth_user_by_email(email: str) -> dict[str, str] | None:
        return None

    async def invite_user(email: str, redirect_to: str) -> dict[str, dict[str, str]]:
        return {"user": {"id": str(uuid5(UUID("00000000-0000-0000-0000-000000000000"), email))}}

    monkeypatch.setattr(user_service, "get_auth_user_by_email", get_auth_user_by_email)
    monkeypatch.setattr(user_service, "invite_user", invite_user)
