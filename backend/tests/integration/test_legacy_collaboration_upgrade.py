from __future__ import annotations

import json
from pathlib import Path
from uuid import UUID

import pytest
from sqlalchemy import text

from scripts.bridge_collaboration_upgrade import load_role_mapping, run_bridge
from tests.integration.fixtures import PostgresTestDatabase

pytestmark = pytest.mark.integration

ADMIN_ID = UUID("10000000-0000-0000-0000-000000000001")
RESEARCHER_ID = UUID("10000000-0000-0000-0000-000000000002")
SURVEY_ID = UUID("20000000-0000-0000-0000-000000000001")


def _populate_legacy_database(database: PostgresTestDatabase) -> None:
    timestamp = "2026-08-25 00:00:00"
    with database.engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO users "
                "(id, created_at, updated_at, is_deleted, deleted_at, performed_by, email, role, "
                "first_name, last_name, middle_name, contact, is_active, username, password, "
                "user_id) "
                "VALUES "
                "(:admin_id, :ts, :ts, false, NULL, NULL, 'admin@example.test', 'admin', "
                "'Legacy', 'Admin', NULL, NULL, true, 'legacy-admin', 'unused', 'USER-ADMIN'), "
                "(:researcher_id, :ts, :ts, false, NULL, NULL, 'researcher@example.test', "
                "'legacy-researcher', "
                "'Legacy', 'Researcher', NULL, NULL, true, 'legacy-researcher', 'unused', "
                "'USER-RESEARCH')"
            ),
            {"admin_id": str(ADMIN_ID), "researcher_id": str(RESEARCHER_ID), "ts": timestamp},
        )
        # performed_by is intentionally NULL.  The bridge must use the stable
        # lowest-id active mapped admin before 6f8 makes owner_id required.
        connection.execute(
            text(
                "INSERT INTO surveys "
                "(id, created_at, updated_at, is_deleted, deleted_at, performed_by, survey_id, "
                "title, "
                "description, status, target_cohort, responses_count) "
                "VALUES (:id, :ts, :ts, false, NULL, NULL, 'SURV-LEGACY', 'Legacy survey', NULL, "
                "'Inactive', NULL, 0)"
            ),
            {"id": str(SURVEY_ID), "ts": timestamp},
        )


def test_legacy_collaboration_upgrade_is_safe_and_idempotent(
    postgres_database: PostgresTestDatabase, tmp_path: Path
) -> None:
    _populate_legacy_database(postgres_database)

    unconfirmed = run_bridge(database_url=postgres_database.url, apply=True)
    assert unconfirmed["status"] == "backup_confirmation_required"
    assert unconfirmed["revision_before"] is None

    with postgres_database.engine.connect() as connection:
        assert connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one() == (
            "5b37d61c76ff"
        )
        assert connection.execute(
            text("SELECT title FROM surveys WHERE id = CAST(:id AS uuid)"),
            {"id": str(SURVEY_ID)},
        ).scalar_one() == "Legacy survey"

    aborted = run_bridge(
        database_url=postgres_database.url,
        apply=True,
        confirm_backup=True,
    )
    assert aborted["status"] == "preflight_aborted"
    assert aborted["revision_before"] == "5b37d61c76ff"
    assert any("Unknown legacy roles" in error for error in aborted["errors"])

    mapping_path = tmp_path / "legacy-role-map.json"
    mapping_path.write_text(
        json.dumps({"legacy-researcher": "researcher"}), encoding="utf-8"
    )
    role_mapping = load_role_mapping(mapping_path)

    dry_run = run_bridge(database_url=postgres_database.url, role_mapping=role_mapping)
    assert dry_run["status"] == "dry_run"
    assert dry_run["owner_backfill"]["planned"] == 1

    applied = run_bridge(
        database_url=postgres_database.url,
        apply=True,
        role_mapping=role_mapping,
        confirm_backup=True,
    )
    assert applied["status"] == "applied"
    assert applied["revision_after"] == "20260825_0001"
    assert applied["owner_backfill"]["updated"] == 1
    assert applied["user_role_mapping"]["inserted"] == 2
    assert applied["verification"]["owner_column_absent"] is True
    assert applied["verification"]["survey_memberships_absent"] is True
    assert set(applied["auth_user_id_nulls"]) == {str(ADMIN_ID), str(RESEARCHER_ID)}
    assert applied["audit_event_id"]

    with postgres_database.engine.connect() as connection:
        revision = connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
        assignments = connection.execute(
            text(
                "SELECT u.id::text, r.name FROM user_roles ur "
                "JOIN users u ON u.id = ur.user_id JOIN roles r ON r.id = ur.role_id "
                "WHERE ur.is_deleted = false ORDER BY u.id"
            )
        ).all()
        owner_column = connection.execute(
            text(
                "SELECT EXISTS (SELECT 1 FROM information_schema.columns "
                "WHERE table_schema = current_schema() AND table_name = 'surveys' "
                "AND column_name = 'owner_id')"
            )
        ).scalar_one()
        memberships = connection.execute(
            text(
                "SELECT EXISTS (SELECT 1 FROM information_schema.tables "
                "WHERE table_schema = current_schema() AND table_name = 'survey_memberships')"
            )
        ).scalar_one()
        survey = connection.execute(
            text(
                "SELECT title, responses_count FROM surveys "
                "WHERE id = CAST(:id AS uuid)"
            ),
            {"id": str(SURVEY_ID)},
        ).one()
        audit = connection.execute(
            text(
                "SELECT action, resource_type, resource_id, request_id, changes "
                "FROM audit_logs WHERE id = CAST(:id AS uuid)"
            ),
            {"id": applied["audit_event_id"]},
        ).one()

    assert revision == "20260825_0001"
    assert assignments == [(str(ADMIN_ID), "admin"), (str(RESEARCHER_ID), "researcher")]
    assert owner_column is False
    assert memberships is False
    assert survey == ("Legacy survey", 0)
    assert audit.action == "bridge"
    assert audit.resource_type == "migration"
    assert audit.resource_id == "legacy-collaboration-upgrade"
    assert audit.request_id == "legacy-collaboration-upgrade/v1"
    assert "legacy-researcher" not in json.dumps(audit.changes)

    rerun = run_bridge(
        database_url=postgres_database.url,
        apply=True,
        confirm_backup=True,
    )
    assert rerun["status"] == "no-op"
    assert rerun["revision_before"] == "20260825_0001"
