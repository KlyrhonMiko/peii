import subprocess
from types import SimpleNamespace
from typing import cast

import pytest
from sqlalchemy.engine import make_url

from tests.integration import fixtures


def test_migrate_to_overrides_runtime_tls_mode_with_test_tls_mode(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, str] = {}

    def run(*args: object, **kwargs: object) -> subprocess.CompletedProcess[str]:
        environment = kwargs["env"]
        assert isinstance(environment, dict)
        captured.update(environment)
        return subprocess.CompletedProcess(args=[], returncode=0, stdout="", stderr="")

    monkeypatch.setenv("DATABASE_TLS_MODE", "require")
    monkeypatch.setenv("TEST_DATABASE_TLS_MODE", "disable")
    monkeypatch.setattr(fixtures.subprocess, "run", run)

    fixtures.migrate_to(
        make_url("postgresql+psycopg2://test@localhost:5432/peii_test"),
        "head",
        "test_schema",
    )

    assert captured["DATABASE_TLS_MODE"] == "disable"


@pytest.mark.parametrize("tls_mode", ["disable", "require", "verify-full"])
def test_test_database_tls_mode_accepts_documented_values(
    monkeypatch: pytest.MonkeyPatch,
    tls_mode: str,
) -> None:
    monkeypatch.setenv("TEST_DATABASE_TLS_MODE", tls_mode)

    assert fixtures.test_database_tls_mode() == tls_mode


def test_test_database_tls_mode_defaults_to_disable(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("TEST_DATABASE_TLS_MODE", raising=False)

    assert fixtures.test_database_tls_mode() == "disable"


def test_migrate_to_rejects_invalid_test_tls_mode_before_subprocess(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("TEST_DATABASE_TLS_MODE", "invalid")
    monkeypatch.setattr(
        fixtures.subprocess,
        "run",
        lambda *args, **kwargs: pytest.fail("Alembic subprocess must not run"),
    )

    with pytest.raises(RuntimeError, match="TEST_DATABASE_TLS_MODE"):
        fixtures.migrate_to(
            make_url("postgresql+psycopg2://test@localhost:5432/peii_test"),
            "head",
            "test_schema",
        )


def test_invalid_test_tls_mode_fails_before_creating_an_isolated_schema(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class Config:
        def getoption(self, name: str) -> bool:
            assert name == "--require-postgres"
            return False

    request = cast(pytest.FixtureRequest, SimpleNamespace(config=Config()))
    monkeypatch.setenv("TEST_DATABASE_URL", "postgresql+psycopg2://test@localhost:5432/peii_test")
    monkeypatch.setenv("TEST_DATABASE_TLS_MODE", "invalid")
    monkeypatch.setattr(
        fixtures,
        "create_engine",
        lambda *args, **kwargs: pytest.fail("Database mutation must not begin"),
    )

    with pytest.raises(pytest.fail.Exception, match="TEST_DATABASE_TLS_MODE"):
        with fixtures._isolated_postgres_database(request, "head"):
            pass
