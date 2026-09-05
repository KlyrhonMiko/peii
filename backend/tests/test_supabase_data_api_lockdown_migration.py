import ast
import importlib.util
from pathlib import Path

import pytest

MIGRATION_PATH = (
    Path(__file__).resolve().parents[1]
    / "alembic/versions/d5a4f7c91e2b_lock_down_supabase_data_api.py"
)

PROTECTED_TABLES = {
    "alembic_version",
    "audit_logs",
    "permissions",
    "response_erasure_receipts",
    "role_permissions",
    "roles",
    "survey_questions",
    "survey_responses",
    "survey_sections",
    "surveys",
    "user_roles",
    "users",
}


def test_lockdown_revision_is_the_forward_head_and_has_exact_scope():
    source = MIGRATION_PATH.read_text(encoding="utf-8")
    tree = ast.parse(source)
    assignments = {
        node.targets[0].id: node.value
        for node in tree.body
        if isinstance(node, ast.Assign)
        and len(node.targets) == 1
        and isinstance(node.targets[0], ast.Name)
        and node.targets[0].id in {"revision", "down_revision", "PROTECTED_TABLES"}
    }

    assert ast.literal_eval(assignments["revision"]) == "d5a4f7c91e2b"
    assert ast.literal_eval(assignments["down_revision"]) == "2bf09a6bc738"
    # The lockdown revision predates the survey_distributions drop (f88b9c1d0000),
    # so its catalog still covers that historical table in addition to the current set.
    assert PROTECTED_TABLES <= set(ast.literal_eval(assignments["PROTECTED_TABLES"]))


def test_lockdown_revision_is_fail_closed_and_contains_transactional_guards():
    source = MIGRATION_PATH.read_text(encoding="utf-8")

    assert "current_schema()" in source
    assert r'''replace('"', '""')''' in source
    assert "information_schema" not in source or "current_schema" in source
    assert "ENABLE ROW LEVEL SECURITY" in source
    assert "FORCE ROW LEVEL SECURITY" not in source
    assert "CREATE POLICY" not in source
    assert "REVOKE ALL PRIVILEGES ON TABLE" in source
    assert "REVOKE CREATE ON SCHEMA" in source
    assert "ALTER DEFAULT PRIVILEGES" in source
    assert "has_table_privilege" in source
    assert "has_column_privilege" in source
    assert "relrowsecurity" in source
    assert "relforcerowsecurity" in source
    assert "pg_policy" in source
    assert "raise RuntimeError" in source


def test_lockdown_revision_uses_dimensioned_column_acl_defaults():
    source = MIGRATION_PATH.read_text(encoding="utf-8")

    assert "COALESCE(a.attacl, CAST('{}' AS aclitem[]))" not in source
    assert "COALESCE(a.attacl, acldefault('c', c.relowner))" in source
    assert "COALESCE(c.relacl, acldefault('r', c.relowner))" in source
    assert "COALESCE(n.nspacl, acldefault('n', n.nspowner))" in source


def test_lockdown_revision_requires_migration_role_to_own_protected_tables():
    source = MIGRATION_PATH.read_text(encoding="utf-8")

    assert "def _assert_protected_table_ownership" in source
    assert "pg_get_userbyid(c.relowner)" in source
    assert "privilege or RLS changes" in source
    assert source.index("_assert_protected_table_ownership(connection, schema)") < source.index(
        "REVOKE ALL PRIVILEGES ON TABLE"
    )


def test_lockdown_revision_rejects_non_owned_tables_before_mutation(monkeypatch):
    spec = importlib.util.spec_from_file_location("lockdown_migration", MIGRATION_PATH)
    assert spec is not None and spec.loader is not None
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)

    class Result:
        def scalar_one_or_none(self):
            return "public"

    class Connection:
        def __init__(self):
            self.statements: list[str] = []

        def execute(self, statement, params=None):
            del params
            self.statements.append(str(statement))
            return Result()

    connection = Connection()
    monkeypatch.setattr(migration.op, "get_bind", lambda: connection)
    monkeypatch.setattr(migration, "_assert_targets_exist", lambda *_: None)

    def reject_non_owner(*_):
        raise RuntimeError("ownership contract failed")

    monkeypatch.setattr(migration, "_assert_protected_table_ownership", reject_non_owner)

    with pytest.raises(RuntimeError, match="ownership contract failed"):
        migration.upgrade()

    assert all("REVOKE" not in statement for statement in connection.statements)
    assert all("ALTER TABLE" not in statement for statement in connection.statements)


def test_lockdown_ownership_guard_reports_non_owned_protected_table():
    spec = importlib.util.spec_from_file_location("lockdown_migration_guard", MIGRATION_PATH)
    assert spec is not None and spec.loader is not None
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)

    class Result:
        def all(self):
            return [("users", "table_owner", "migration_role", False)]

    class Connection:
        def execute(self, statement, params=None):
            del statement, params
            return Result()

    with pytest.raises(RuntimeError, match="migration_role.*users"):
        migration._assert_protected_table_ownership(Connection(), "public")


def test_lockdown_downgrade_is_unconditionally_irreversible():
    tree = ast.parse(MIGRATION_PATH.read_text(encoding="utf-8"))
    downgrade = next(
        node
        for node in tree.body
        if isinstance(node, ast.FunctionDef) and node.name == "downgrade"
    )

    assert any(
        isinstance(node, ast.Raise)
        and isinstance(node.exc, ast.Call)
        and isinstance(node.exc.func, ast.Name)
        and node.exc.func.id == "RuntimeError"
        for node in ast.walk(downgrade)
    )
