from __future__ import annotations

import os
import subprocess
import sys
from collections.abc import Callable, Generator, Iterator
from contextlib import AbstractContextManager, contextmanager
from dataclasses import dataclass
from uuid import uuid4

import pytest
from sqlalchemy import Connection, Engine, create_engine, text
from sqlalchemy.engine import URL, make_url
from sqlalchemy.pool import NullPool

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))


@dataclass
class PostgresTestDatabase:
    url: URL
    engine: Engine
    schema: str


def _postgres_url(raw_url: str) -> URL:
    parsed = make_url(raw_url)
    if parsed.get_backend_name() != "postgresql":
        raise RuntimeError("TEST_DATABASE_URL must point to PostgreSQL.")
    if parsed.drivername == "postgresql+asyncpg":
        parsed = parsed.set(drivername="postgresql+psycopg2")
    elif parsed.drivername not in {"postgresql", "postgresql+psycopg2"}:
        raise RuntimeError("TEST_DATABASE_URL must use psycopg2 or an unqualified PostgreSQL URL.")
    return parsed.difference_update_query(["options"])


def _quote_identifier(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


def _sanitize_diagnostics(diagnostics: str, database_url: URL) -> str:
    redacted_url = database_url.render_as_string(hide_password=True)
    unredacted_url = database_url.render_as_string(hide_password=False)
    sanitized = diagnostics.replace(unredacted_url, redacted_url)
    if database_url.password:
        sanitized = sanitized.replace(database_url.password, "***")
    return sanitized


def migrate_to(url: URL, revision: str, schema: str) -> None:
    environment = os.environ.copy()
    environment["DB_MODE"] = "local"
    environment["LOCAL_DATABASE_URL"] = url.render_as_string(hide_password=False)
    environment["PGOPTIONS"] = f"-c search_path={schema}"
    environment["ALEMBIC_EXPECTED_SCHEMA"] = schema
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", revision],
        cwd=BACKEND_DIR,
        env=environment,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        diagnostics = _sanitize_diagnostics(
            "\n".join(part for part in (result.stdout, result.stderr) if part), url
        ).strip()
        message = "Alembic could not prepare the isolated PostgreSQL schema."
        if diagnostics:
            message = f"{message}\n{diagnostics}"
        raise RuntimeError(message)


def assert_current_schema(connection: Connection, expected_schema: str) -> None:
    actual_schema = connection.execute(text("SELECT current_schema()")).scalar_one_or_none()
    assert actual_schema == expected_schema, (
        f"Expected isolated schema {expected_schema!r}, got {actual_schema!r}."
    )


@contextmanager
def _isolated_postgres_database(
    request: pytest.FixtureRequest,
    revision: str,
) -> Iterator[PostgresTestDatabase]:
    raw_url = os.environ.get("TEST_DATABASE_URL")
    if not raw_url:
        if request.config.getoption("--require-postgres"):
            pytest.fail("--require-postgres was supplied but TEST_DATABASE_URL is absent.")
        pytest.skip("TEST_DATABASE_URL is not configured; PostgreSQL integration test skipped.")

    try:
        parsed = _postgres_url(raw_url)
    except RuntimeError as exc:
        if request.config.getoption("--require-postgres"):
            pytest.fail(str(exc))
        pytest.skip(str(exc))

    schema = f"peii_test_{uuid4().hex}"
    admin_engine = create_engine(parsed, poolclass=NullPool)
    schema_identifier = _quote_identifier(schema)
    test_engine: Engine | None = None
    schema_created = False
    try:
        with admin_engine.begin() as connection:
            connection.execute(text(f"CREATE SCHEMA {schema_identifier}"))
        schema_created = True
        migrate_to(parsed, revision, schema)
        test_engine = create_engine(
            parsed,
            connect_args={"options": f"-c search_path={schema}"},
            poolclass=NullPool,
        )
        with test_engine.connect() as connection:
            assert_current_schema(connection, schema)
        database = PostgresTestDatabase(parsed, test_engine, schema)
        yield database
    finally:
        if test_engine is not None:
            test_engine.dispose()
        if schema_created:
            with admin_engine.begin() as connection:
                connection.execute(text(f"DROP SCHEMA IF EXISTS {schema_identifier} CASCADE"))
        admin_engine.dispose()


@pytest.fixture
def postgres_database(
    request: pytest.FixtureRequest,
) -> Generator[PostgresTestDatabase]:
    with _isolated_postgres_database(request, "head") as database:
        yield database


@pytest.fixture
def postgres_database_at_revision(
    request: pytest.FixtureRequest,
) -> Callable[[str], AbstractContextManager[PostgresTestDatabase]]:
    return lambda revision: _isolated_postgres_database(request, revision)


@pytest.fixture
def postgres_connection(
    postgres_database: PostgresTestDatabase,
) -> Generator[Connection]:
    with postgres_database.engine.connect() as connection:
        yield connection
