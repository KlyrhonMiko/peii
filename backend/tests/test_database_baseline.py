from __future__ import annotations

import ast
from pathlib import Path

import pytest
from sqlalchemy import text
from sqlmodel import SQLModel

from models import (  # noqa: F401
    AuditLog,
    GoogleSurveyAuthProof,
    Permission,
    ResponseErasureReceipt,
    Role,
    RolePermission,
    Survey,
    SurveyDistribution,
    SurveyQuestion,
    SurveyResponse,
    SurveySection,
    User,
    UserRole,
)
from services.rbac_service import DEFAULT_ROLES, PERMISSIONS

BASELINE_PATH = (
    Path(__file__).resolve().parents[1]
    / "alembic/versions/20260825_v1_initial_canonical_baseline.py"
)
BASELINE_REVISION = "20260825_v1"
CANONICAL_TABLES = {
    "users",
    "audit_logs",
    "permissions",
    "roles",
    "role_permissions",
    "user_roles",
    "surveys",
    "survey_sections",
    "survey_questions",
    "survey_distributions",
    "survey_responses",
    "response_erasure_receipts",
}
LIVE_METADATA_TABLES = CANONICAL_TABLES | {"google_survey_auth_proofs"}
EXPECTED_ROLE_IDS = {
    "admin": "00000000-0000-0000-0000-000000000101",
    "researcher": "00000000-0000-0000-0000-000000000102",
    "staff": "00000000-0000-0000-0000-000000000103",
}


def test_metadata_contains_canonical_tables_and_current_forward_tables():
    assert set(SQLModel.metadata.tables) == LIVE_METADATA_TABLES


def test_baseline_is_single_root_revision_and_self_contained():
    source = BASELINE_PATH.read_text(encoding="utf-8")
    tree = ast.parse(source)
    assignments = {
        node.targets[0].id: node.value
        for node in tree.body
        if isinstance(node, ast.Assign)
        and len(node.targets) == 1
        and isinstance(node.targets[0], ast.Name)
        and node.targets[0].id in {"revision", "down_revision"}
    }
    assert ast.literal_eval(assignments["revision"]) == BASELINE_REVISION
    assert ast.literal_eval(assignments["down_revision"]) is None
    assert "services.rbac_service" not in source
    assert "ensure_permission_catalog" not in source
    assert set(EXPECTED_ROLE_IDS.values()) <= set(source.split('"'))


@pytest.mark.integration
def test_baseline_catalog_matches_runtime_catalog(postgres_connection):
    permission_rows = postgres_connection.execute(
        text("SELECT code, description FROM permissions WHERE is_deleted = false ORDER BY code")
    ).all()
    assert dict(permission_rows) == PERMISSIONS

    role_rows = postgres_connection.execute(
        text(
            "SELECT name, id::text FROM roles "
            "WHERE is_system = true AND is_deleted = false ORDER BY name"
        )
    ).all()
    assert dict(role_rows) == EXPECTED_ROLE_IDS

    edge_rows = postgres_connection.execute(
        text(
            "SELECT r.name, p.code FROM role_permissions rp "
            "JOIN roles r ON r.id = rp.role_id "
            "JOIN permissions p ON p.id = rp.permission_id "
            "WHERE rp.is_deleted = false AND r.is_deleted = false AND p.is_deleted = false"
        )
    ).all()
    actual: dict[str, set[str]] = {name: set() for name in DEFAULT_ROLES}
    for role_name, code in edge_rows:
        if role_name in actual:
            actual[role_name].add(code)
    assert actual == DEFAULT_ROLES
