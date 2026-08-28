import ast
from pathlib import Path

import pytest
from sqlalchemy import text

ENV_PATH = Path(__file__).resolve().parents[1] / "alembic/env.py"


def _load_preflight():
    tree = ast.parse(ENV_PATH.read_text(encoding="utf-8"))
    function = next(
        node
        for node in tree.body
        if isinstance(node, ast.FunctionDef)
        and node.name == "_assert_rls_migration_version_access"
    )
    namespace = {"Connection": object, "text": text}
    exec(compile(ast.Module([function], []), str(ENV_PATH), "exec"), namespace)
    return namespace[function.name]


class _Result:
    def __init__(self, row):
        self.row = row

    def one_or_none(self):
        return self.row


class _Connection:
    class _Dialect:
        name = "postgresql"

    dialect = _Dialect()

    def __init__(self, row):
        self.result = _Result(row)
        self.commits = 0
        self.rollbacks = 0

    def execute(self, statement):
        assert "alembic_version" in str(statement)
        return self.result

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1


def test_rls_migration_version_preflight_noops_before_table_exists():
    connection = _Connection(None)

    _load_preflight()(connection)

    assert connection.commits == 1
    assert connection.rollbacks == 0


def test_rls_migration_version_preflight_rejects_missing_owner_or_privileges():
    connection = _Connection(
        (True, False, False, True, True, True, True, "migration_role")
    )

    with pytest.raises(RuntimeError, match="owner or BYPASSRLS role"):
        _load_preflight()(connection)

    assert connection.commits == 1
    assert connection.rollbacks == 0


def test_rls_migration_version_preflight_rejects_missing_effective_privilege():
    connection = _Connection(
        (True, True, False, True, False, True, True, "migration_role")
    )

    with pytest.raises(RuntimeError, match="missing: INSERT"):
        _load_preflight()(connection)
