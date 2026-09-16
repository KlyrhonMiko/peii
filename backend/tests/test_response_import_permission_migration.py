import importlib.util
from pathlib import Path
from uuid import UUID

import pytest

MIGRATION_PATH = (
    Path(__file__).resolve().parents[1]
    / "alembic/versions/c1d2e3f4a5b6_add_survey_response_import_permission.py"
)


def _load_migration_module():
    spec = importlib.util.spec_from_file_location(
        "response_import_permission_migration", MIGRATION_PATH
    )
    if spec is None or spec.loader is None:
        raise AssertionError("Could not load response import permission migration")
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    return migration


class _Result:
    def __init__(self, rows: list[UUID]) -> None:
        self.rows = rows

    def scalars(self) -> list[UUID]:
        return self.rows


class _Connection:
    def __init__(self, edge_ids: list[UUID]) -> None:
        self.edge_ids = edge_ids
        self.calls: list[tuple[str, dict[str, str] | None]] = []

    def execute(self, statement, params=None):
        self.calls.append((str(statement), params))
        if str(statement).startswith("SELECT id FROM role_permissions"):
            return _Result(self.edge_ids)
        return None


def test_downgrade_removes_all_seeded_edges_by_permission_id(monkeypatch) -> None:
    migration = _load_migration_module()
    connection = _Connection(
        [migration.IMPORT_ADMIN_EDGE_ID, migration.IMPORT_RESEARCHER_EDGE_ID]
    )
    monkeypatch.setattr(migration.op, "get_bind", lambda: connection)

    migration.downgrade()

    assert "DELETE FROM role_permissions WHERE permission_id" in connection.calls[1][0]
    assert connection.calls[1][1] == {
        "permission_id": str(migration.IMPORT_PERMISSION_ID)
    }
    assert "DELETE FROM permissions WHERE id = :permission_id" in connection.calls[2][0]


def test_downgrade_fails_closed_when_a_custom_role_grant_exists(monkeypatch) -> None:
    migration = _load_migration_module()
    custom_edge_id = UUID("00000000-0000-0000-0000-000000000399")
    connection = _Connection([migration.IMPORT_ADMIN_EDGE_ID, custom_edge_id])
    monkeypatch.setattr(migration.op, "get_bind", lambda: connection)

    with pytest.raises(RuntimeError, match="custom role grants"):
        migration.downgrade()

    assert len(connection.calls) == 1
