from __future__ import annotations

import os
import subprocess
import sys
from collections.abc import Generator
from dataclasses import dataclass
from uuid import uuid4

import pytest
from sqlalchemy import Connection, Engine, create_engine, text
from sqlalchemy.engine import URL, make_url
from sqlalchemy.pool import NullPool

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))


@dataclass
class PostgresTestDatabase:
    url: str
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
    return parsed


def _quote_identifier(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


def migrate_to(url: str, revision: str) -> None:
    environment = os.environ.copy()
    environment["DB_MODE"] = "local"
    environment["LOCAL_DATABASE_URL"] = url
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", revision],
        cwd=BACKEND_DIR,
        env=environment,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError("Alembic could not prepare the isolated PostgreSQL schema.")


@pytest.fixture
def postgres_database(
    request: pytest.FixtureRequest,
) -> Generator[PostgresTestDatabase]:
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
        test_url = parsed.update_query_dict(
            {"options": f"-csearch_path={schema}"}, append=True
        )
        migrate_to(str(test_url), "5b37d61c76ff")
        test_engine = create_engine(test_url, poolclass=NullPool)
        database = PostgresTestDatabase(str(test_url), test_engine, schema)
        yield database
    finally:
        if test_engine is not None:
            test_engine.dispose()
        if schema_created:
            with admin_engine.begin() as connection:
                connection.execute(text(f"DROP SCHEMA IF EXISTS {schema_identifier} CASCADE"))
        admin_engine.dispose()


@pytest.fixture
def postgres_connection(
    postgres_database: PostgresTestDatabase,
) -> Generator[Connection]:
    with postgres_database.engine.connect() as connection:
        yield connection
