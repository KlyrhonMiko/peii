import ast
from pathlib import Path

MIGRATION_PATH = (
    Path(__file__).resolve().parents[1]
    / "alembic/versions/a8055c9859f5_add_google_survey_respondent_identity.py"
)


def test_google_identity_downgrade_is_unconditionally_fail_closed():
    tree = ast.parse(MIGRATION_PATH.read_text(encoding="utf-8"))
    downgrade = next(
        node
        for node in tree.body
        if isinstance(node, ast.FunctionDef) and node.name == "downgrade"
    )

    assert len(downgrade.body) == 1
    statement = downgrade.body[0]
    assert isinstance(statement, ast.Raise)
    assert isinstance(statement.exc, ast.Call)
    assert isinstance(statement.exc.func, ast.Name)
    assert statement.exc.func.id == "RuntimeError"
    assert "fail-closed" in ast.unparse(statement)
