import ast
from pathlib import Path

MIGRATION_PATH = (
    Path(__file__).resolve().parents[1]
    / "alembic/versions/f77a807cf2f9_expand_distribution_security.py"
)


def test_distribution_security_expand_revision_and_compatibility_gate():
    source = MIGRATION_PATH.read_text(encoding="utf-8")
    tree = ast.parse(source)
    assignments = {
        node.targets[0].id: node.value
        for node in tree.body
        if isinstance(node, ast.Assign)
        and len(node.targets) == 1
        and isinstance(node.targets[0], ast.Name)
        and node.targets[0].id in {"revision", "down_revision"}
    }

    assert ast.literal_eval(assignments["revision"]) == "f77a807cf2f9"
    assert ast.literal_eval(assignments["down_revision"]) == "20260825_v1"
    assert "sha256" in source
    assert ".hexdigest()" in source
    assert 'token[:8]' in source
    assert 'sa.column("token"' in source
    assert 'op.drop_column("survey_distributions", "token")' not in source
    assert "Rolling deployment gate" in source
