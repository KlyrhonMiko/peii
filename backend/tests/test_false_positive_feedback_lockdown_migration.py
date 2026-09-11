import ast
import importlib.util
from pathlib import Path

MIGRATION_PATH = (
    Path(__file__).resolve().parents[1]
    / "alembic/versions/bf21a63040a2_lock_down_false_positive_feedback_data_.py"
)


def test_false_positive_feedback_lockdown_follows_jsonb_head_and_is_fail_closed():
    source = MIGRATION_PATH.read_text(encoding="utf-8")
    tree = ast.parse(source)
    assignments = {
        node.targets[0].id: node.value
        for node in tree.body
        if isinstance(node, ast.Assign)
        and len(node.targets) == 1
        and isinstance(node.targets[0], ast.Name)
        and node.targets[0].id in {"revision", "down_revision", "TABLE_NAME", "TARGET_ROLES"}
    }

    assert ast.literal_eval(assignments["revision"]) == "bf21a63040a2"
    assert ast.literal_eval(assignments["down_revision"]) == "b43d56b55144"
    assert ast.literal_eval(assignments["TABLE_NAME"]) == "false_positive_feedbacks"
    assert ast.literal_eval(assignments["TARGET_ROLES"]) == (
        "anon",
        "authenticated",
        "service_role",
    )
    assert "REVOKE ALL PRIVILEGES ON TABLE" in source
    assert "ENABLE ROW LEVEL SECURITY" in source
    assert "FORCE ROW LEVEL SECURITY" not in source
    assert "CREATE POLICY" not in source
    assert "_assert_table_is_owned" in source
    assert "_assert_postconditions" in source
    assert "has_table_privilege" in source
    assert "has_column_privilege" in source
    assert "raise RuntimeError" in source


def _load_migration_module():
    spec = importlib.util.spec_from_file_location(
        "false_positive_feedback_lockdown", MIGRATION_PATH
    )
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class _VersionResult:
    def __init__(self, version: int) -> None:
        self.version = version

    def scalar_one(self) -> str:
        return str(self.version)


class _VersionConnection:
    def __init__(self, version: int) -> None:
        self.version = version

    def execute(self, _statement: object) -> _VersionResult:
        return _VersionResult(self.version)


def test_false_positive_feedback_lockdown_checks_maintain_only_on_postgres_17_or_newer():
    migration = _load_migration_module()

    assert "MAINTAIN" not in migration._table_privileges(_VersionConnection(160000))
    assert "MAINTAIN" in migration._table_privileges(_VersionConnection(170000))
