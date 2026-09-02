import asyncio
import hashlib
import os
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
from fastapi import Request
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.ext.asyncio.session import AsyncSession

ROOT_DIR = Path(__file__).resolve().parents[1]
PROJECT_ROOT = ROOT_DIR.parent
sys.path.insert(0, str(ROOT_DIR))
load_dotenv(PROJECT_ROOT / ".env", override=True)
# The normal test suite must never depend on or mutate an external rate-limit store.
# It therefore runs in explicit debug mode while production configuration validation is
# covered separately in test_public_rate_limits.py.
os.environ["DEBUG"] = "true"
os.environ["RATE_LIMIT_ENABLED"] = "false"
os.environ["UPSTASH_REDIS_REST_URL"] = ""
os.environ["UPSTASH_REDIS_REST_TOKEN"] = ""
# Public contract tests use a deterministic policy instead of developer-local copy.
os.environ["PUBLIC_SURVEY_CONSENT_VERSION"] = "2026-08-25"
os.environ["PUBLIC_SURVEY_PRIVACY_NOTICE"] = "See the PEII privacy notice before responding."
os.environ["PUBLIC_SURVEY_PURPOSE"] = "Program evaluation and research."
os.environ["PUBLIC_SURVEY_RETENTION"] = (
    "Responses are retained according to the approved policy."
)
os.environ["PUBLIC_SURVEY_CONTACT"] = "privacy@example.gov.ph"

from core.config import settings  # noqa: E402
from core.database import get_async_session, get_session  # noqa: E402
from core.deps import (  # noqa: E402
    GoogleSurveyRespondent,
    Principal,
    get_current_principal,
    get_google_survey_respondent,
)
from main import app  # noqa: E402
from models.user import User  # noqa: E402
from services import user_service  # noqa: E402
from services.rbac_service import PERMISSIONS  # noqa: E402
from tests.integration.fixtures import (  # noqa: E402,F401
    PostgresTestDatabase,
    migrate_to,
    postgres_connection,
    postgres_database,
    postgres_database_at_revision,
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
def csv_export_enabled(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "CSV_EXPORT_ENABLED", True)


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

    async def override_google_respondent(request: Request) -> GoogleSurveyRespondent:
        idempotency_key = request.headers.get("Idempotency-Key") or request.url.path
        auth_user_id = uuid5(
            UUID("00000000-0000-0000-0000-000000000000"),
            f"auth:{idempotency_key}",
        )
        return GoogleSurveyRespondent(
            auth_user_id=auth_user_id,
            session_id=uuid5(
                UUID("00000000-0000-0000-0000-000000000000"),
                f"session:{idempotency_key}",
            ),
            subject_digest=hashlib.sha256(idempotency_key.encode("utf-8")).hexdigest(),
            email=f"{auth_user_id}@example.com",
            display_name="Test Respondent",
            email_verified=True,
        )

    app.dependency_overrides[get_current_principal] = override_current_principal
    app.dependency_overrides[get_google_survey_respondent] = override_google_respondent
    yield


@pytest.fixture(autouse=True)
def mock_supabase_user_provisioning(monkeypatch: pytest.MonkeyPatch):
    async def get_auth_user_by_email(email: str) -> dict[str, str] | None:
        return None

    async def invite_user(email: str, redirect_to: str) -> dict[str, dict[str, str]]:
        return {"user": {"id": str(uuid5(UUID("00000000-0000-0000-0000-000000000000"), email))}}

    monkeypatch.setattr(user_service, "get_auth_user_by_email", get_auth_user_by_email)
    monkeypatch.setattr(user_service, "invite_user", invite_user)
