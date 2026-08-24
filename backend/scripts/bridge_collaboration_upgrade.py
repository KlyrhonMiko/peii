"""Safely bridge the legacy survey collaboration schema to the RBAC schema.

The bridge is intentionally a small operational tool rather than an application
service.  It must be run with the application stopped (or otherwise quiesced),
and it never contacts Supabase.  A report is emitted as JSON so an operator can
archive it without scraping human-oriented logs.

The default mode is a read-only preflight.  Use ``--apply`` to perform the
upgrade.  PostgreSQL is required because the bridge relies on transactional DDL
and a session-level advisory lock.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Mapping, Sequence
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4, uuid5

import sqlalchemy as sa
from alembic.config import Config
from alembic.operations import Operations
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import Connection, Engine, create_engine, text
from sqlalchemy.engine import URL, make_url

START_REVISION = "5b37d61c76ff"
HEAD_REVISION = "20260825_0001"
LOCK_KEY = (20260825, 1)
SYSTEM_ACTOR_ID = UUID("00000000-0000-0000-0000-000000000001")
BRIDGE_AUDIT_NAMESPACE = UUID("00000000-0000-0000-0000-000000000100")
BRIDGE_AUDIT_ID = uuid5(BRIDGE_AUDIT_NAMESPACE, "legacy-collaboration-upgrade/v1")
BRIDGE_REQUEST_ID = "legacy-collaboration-upgrade/v1"

BUILTIN_ROLES = frozenset({"admin", "researcher", "staff"})
ADMIN_BASE_CAPABILITIES = frozenset(
    {
        "portal.access",
        "users.read",
        "users.invite",
        "users.update",
        "users.assign_roles",
        "users.change_status",
        "users.revoke_sessions",
        "users.delete",
        "users.restore",
        "roles.read",
        "roles.manage",
        "audit_logs.read",
        "ml.models.read",
        "ml.sentiment.run",
    }
)
SHARED_SURVEY_CAPABILITIES = frozenset(
    {
        "surveys.read",
        "surveys.manage",
        "survey_distributions.manage",
        "survey_responses.read_aggregates",
        "survey_responses.read_raw",
        "survey_responses.export",
        "survey_responses.erase",
    }
)
UPGRADE_PATH = (
    "de31b342df3f",
    "6f8d7931d7ad",
    "f310c5287dc0",
    "505590bf8f96",
    "81568591615f",
    "20260825_0002",
    "20260825_0001",
)
ROLE_CAPABILITIES: dict[str, frozenset[str]] = {
    "admin": ADMIN_BASE_CAPABILITIES | SHARED_SURVEY_CAPABILITIES,
    "researcher": frozenset(
        {
            "portal.access",
            "ml.models.read",
            "ml.sentiment.run",
            "surveys.read",
            "surveys.manage",
            "survey_distributions.manage",
            "survey_responses.read_aggregates",
            "survey_responses.read_raw",
            "survey_responses.export",
        }
    ),
    "staff": frozenset(
        {
            "portal.access",
            "ml.models.read",
            "surveys.read",
            "survey_responses.read_aggregates",
        }
    ),
}

BACKEND_DIR = Path(__file__).resolve().parents[1]


class BridgeError(RuntimeError):
    """An expected operator-actionable bridge failure."""


def _normalise_role(value: object) -> str:
    if not isinstance(value, str):
        return ""
    return value.strip().casefold()


def load_role_mapping(path: Path | None) -> dict[str, str]:
    """Load and validate the optional legacy-role mapping JSON file."""

    if path is None:
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise BridgeError(f"Unable to read role mapping JSON: {type(exc).__name__}.") from exc
    if not isinstance(payload, dict):
        raise BridgeError("Role mapping JSON must be an object of legacy role to canonical role.")

    mapping: dict[str, str] = {}
    for legacy_role, canonical_role in payload.items():
        legacy = _normalise_role(legacy_role)
        canonical = _normalise_role(canonical_role)
        if not legacy or canonical not in BUILTIN_ROLES:
            raise BridgeError(
                "Role mapping keys must be non-empty and values must be "
                "admin, researcher, or staff."
            )
        mapping[legacy] = canonical
    return mapping


def _database_url(database_url: str | None) -> URL:
    if database_url is None:
        # Import settings lazily.  This keeps pure report/mapping helpers usable
        # without requiring every application setting to be present.
        from core.config import settings

        database_url = settings.database_url

    try:
        parsed = make_url(database_url)
    except Exception as exc:  # SQLAlchemy's URL parser has several exception types.
        raise BridgeError("The configured database URL is invalid.") from exc
    if parsed.get_backend_name() != "postgresql":
        raise BridgeError("The collaboration bridge supports PostgreSQL only.")
    if parsed.drivername == "postgresql+asyncpg":
        parsed = parsed.set(drivername="postgresql+psycopg2")
    elif parsed.drivername not in {"postgresql", "postgresql+psycopg2"}:
        raise BridgeError("The collaboration bridge requires the psycopg2 PostgreSQL driver.")
    return parsed


def _script_directory() -> ScriptDirectory:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    return ScriptDirectory.from_config(config)


def _validate_upgrade_path(script: ScriptDirectory) -> None:
    previous = START_REVISION
    for revision in UPGRADE_PATH:
        revision_script = script.get_revision(revision)
        if revision_script is None or revision_script.down_revision != previous:
            raise BridgeError(
                f"Repository migration chain is not the expected {previous} -> {revision} path."
            )
        previous = revision


def _current_revision(connection: Connection) -> str:
    try:
        rows = connection.execute(
            text("SELECT version_num FROM alembic_version ORDER BY version_num")
        ).scalars().all()
    except sa.exc.SQLAlchemyError as exc:
        raise BridgeError("Unable to read the Alembic revision from this database.") from exc
    if len(rows) != 1:
        raise BridgeError("The database must have exactly one Alembic revision before bridging.")
    return str(rows[0])


def _acquire_lock(connection: Connection) -> None:
    locked = connection.execute(
        text("SELECT pg_try_advisory_lock(:key_a, :key_b)"),
        {"key_a": LOCK_KEY[0], "key_b": LOCK_KEY[1]},
    ).scalar_one()
    if not locked:
        raise BridgeError("Another collaboration bridge is already running; retry later.")


def _legacy_users(connection: Connection) -> list[dict[str, Any]]:
    rows = connection.execute(
        text(
            "SELECT id::text AS id, role, is_active AS active, is_deleted AS deleted "
            "FROM users ORDER BY id"
        )
    ).mappings()
    return [
        {
            "id": str(row["id"]),
            "role": row["role"],
            "active": bool(row["active"]),
            "deleted": bool(row["deleted"]),
        }
        for row in rows
    ]


def _map_legacy_users(
    users: Sequence[Mapping[str, Any]], role_mapping: Mapping[str, str]
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    captured: list[dict[str, Any]] = []
    unknown: list[dict[str, Any]] = []
    for user in users:
        raw_role = user["role"]
        normalised = _normalise_role(raw_role)
        mapped_role = normalised if normalised in BUILTIN_ROLES else role_mapping.get(normalised)
        captured_user = dict(user)
        captured_user["mapped_role"] = mapped_role
        captured.append(captured_user)
        if mapped_role is None:
            unknown.append({"id": user["id"], "role": raw_role})
    return captured, unknown


def _survey_owner_plan(
    connection: Connection,
    users: Sequence[Mapping[str, Any]],
) -> tuple[list[dict[str, str]], list[dict[str, str]]]:
    active_users = {
        str(user["id"]): user
        for user in users
        if bool(user["active"]) and not bool(user["deleted"])
    }
    admins = sorted(
        str(user["id"])
        for user in users
        if user.get("mapped_role") == "admin"
        and bool(user["active"])
        and not bool(user["deleted"])
    )
    fallback_admin = admins[0] if admins else None
    plan: list[dict[str, str]] = []
    failures: list[dict[str, str]] = []
    surveys = connection.execute(
        text("SELECT id::text AS id, performed_by::text AS performed_by FROM surveys ORDER BY id")
    ).mappings()
    for survey in surveys:
        performed_by = survey["performed_by"]
        # A performed_by value is valid only when it identifies a live legacy
        # user.  Temporary ownership is deliberately never used for role grants.
        if performed_by is not None and str(performed_by) in active_users:
            owner_id = str(performed_by)
            source = "performed_by"
        elif fallback_admin is not None:
            owner_id = fallback_admin
            source = "mapped_admin_fallback"
        else:
            failures.append(
                {
                    "survey_id": str(survey["id"]),
                    "reason": "no valid performed_by and no active mapped admin",
                }
            )
            continue
        plan.append({"survey_id": str(survey["id"]), "owner_id": owner_id, "source": source})
    return plan, failures


def _apply_revision(connection: Connection, revision: str, script: ScriptDirectory) -> None:
    revision_script = script.get_revision(revision)
    if revision_script is None or revision_script.module is None:
        raise BridgeError(f"Migration revision {revision} is unavailable from the repository.")
    migration_context = MigrationContext.configure(connection)
    with Operations.context(migration_context):
        revision_script.module.upgrade()


def _backfill_temporary_owners(
    connection: Connection, plan: Sequence[Mapping[str, str]]
) -> int:
    updated = 0
    for item in plan:
        updated += int(
            connection.execute(
                text(
                    "UPDATE surveys SET owner_id = CAST(:owner_id AS uuid) "
                    "WHERE id = CAST(:survey_id AS uuid) AND owner_id IS NULL"
                ),
                item,
            ).rowcount
            or 0
        )
    remaining = connection.execute(
        text("SELECT count(*) FROM surveys WHERE owner_id IS NULL")
    ).scalar_one()
    if remaining:
        raise BridgeError(
            "Owner backfill is incomplete; restore from backup or apply a forward-fix."
        )
    return updated


def _canonical_role_ids(connection: Connection) -> dict[str, str]:
    rows = connection.execute(
        text(
            "SELECT name, id::text AS id FROM roles "
            "WHERE name IN ('admin', 'researcher', 'staff') "
            "AND is_system = true AND is_active = true AND is_deleted = false"
        )
    ).mappings()
    role_ids = {str(row["name"]): str(row["id"]) for row in rows}
    missing = sorted(BUILTIN_ROLES - role_ids.keys())
    if missing:
        raise BridgeError("Canonical roles are incomplete; run the capability forward-fix first.")
    return role_ids


def _insert_missing_user_roles(
    connection: Connection,
    users: Sequence[Mapping[str, Any]],
    role_ids: Mapping[str, str],
) -> dict[str, int]:
    counts = {"inserted": 0, "reactivated": 0, "already_active": 0}
    timestamp = datetime.now(UTC).replace(tzinfo=None)
    for user in users:
        if not bool(user["active"]) or bool(user["deleted"]):
            continue
        mapped_role = str(user["mapped_role"])
        role_id = role_ids[mapped_role]
        row = connection.execute(
            text(
                "SELECT id::text AS id, is_deleted FROM user_roles "
                "WHERE user_id = CAST(:user_id AS uuid) AND role_id = CAST(:role_id AS uuid)"
            ),
            {"user_id": user["id"], "role_id": role_id},
        ).mappings().first()
        if row is None:
            connection.execute(
                text(
                    "INSERT INTO user_roles "
                    "(id, created_at, updated_at, is_deleted, deleted_at, performed_by, "
                    "user_id, role_id) "
                    "VALUES (CAST(:id AS uuid), :created_at, :updated_at, false, NULL, "
                    "CAST(:performed_by AS uuid), CAST(:user_id AS uuid), CAST(:role_id AS uuid))"
                ),
                {
                    "id": str(uuid4()),
                    "created_at": timestamp,
                    "updated_at": timestamp,
                    "performed_by": str(SYSTEM_ACTOR_ID),
                    "user_id": user["id"],
                    "role_id": role_id,
                },
            )
            counts["inserted"] += 1
        elif bool(row["is_deleted"]):
            connection.execute(
                text(
                    "UPDATE user_roles SET is_deleted = false, deleted_at = NULL, "
                    "updated_at = :updated_at, performed_by = CAST(:performed_by AS uuid) "
                    "WHERE id = CAST(:id AS uuid)"
                ),
                {
                    "id": row["id"],
                    "updated_at": timestamp,
                    "performed_by": str(SYSTEM_ACTOR_ID),
                },
            )
            counts["reactivated"] += 1
        else:
            counts["already_active"] += 1
    return counts


def _insert_bridge_audit_log(
    connection: Connection,
    role_counts: Mapping[str, int],
    active_user_count: int,
) -> None:
    """Record one non-sensitive, transaction-scoped bridge batch event."""

    timestamp = datetime.now(UTC).replace(tzinfo=None)
    connection.execute(
        text(
            "INSERT INTO audit_logs "
            "(id, action, resource_type, resource_id, performed_by, request_id, changes, "
            "ip_address, created_at) "
            "VALUES (CAST(:id AS uuid), :action, :resource_type, :resource_id, "
            "CAST(:performed_by AS uuid), :request_id, CAST(:changes AS json), NULL, :created_at) "
            "ON CONFLICT (id) DO NOTHING"
        ),
        {
            "id": str(BRIDGE_AUDIT_ID),
            "action": "bridge",
            "resource_type": "migration",
            "resource_id": "legacy-collaboration-upgrade",
            "performed_by": str(SYSTEM_ACTOR_ID),
            "request_id": BRIDGE_REQUEST_ID,
            "changes": json.dumps(
                {
                    "bridge_version": 1,
                    "from_revision": START_REVISION,
                    "to_revision": HEAD_REVISION,
                    "active_user_count": active_user_count,
                    "inserted_user_roles": role_counts["inserted"],
                    "reactivated_user_roles": role_counts["reactivated"],
                    "already_active_user_roles": role_counts["already_active"],
                },
                sort_keys=True,
            ),
            "created_at": timestamp,
        },
    )
    persisted = connection.execute(
        text("SELECT 1 FROM audit_logs WHERE id = CAST(:id AS uuid)"),
        {"id": str(BRIDGE_AUDIT_ID)},
    ).first()
    if persisted is None:
        raise BridgeError("The bridge audit event could not be persisted.")


def _verify_final(
    connection: Connection,
    users: Sequence[Mapping[str, Any]],
    role_mapping: Mapping[str, str],
) -> tuple[dict[str, Any], list[str]]:
    errors: list[str] = []
    revision = _current_revision(connection)
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
    if revision != HEAD_REVISION:
        errors.append(f"Expected Alembic head {HEAD_REVISION}, found {revision}.")
    if owner_column:
        errors.append("surveys.owner_id still exists after the bridge.")
    if memberships:
        errors.append("survey_memberships still exists after the bridge.")

    role_ids = _canonical_role_ids(connection)
    permission_rows = connection.execute(
        text(
            "SELECT code FROM permissions WHERE is_deleted = false "
            "AND code IN ('surveys.read', 'surveys.manage', 'survey_distributions.manage', "
            "'survey_responses.read_aggregates', 'survey_responses.read_raw', "
            "'survey_responses.export', 'survey_responses.erase')"
        )
    ).scalars()
    permission_codes = {str(code) for code in permission_rows}
    expected_permissions = set().union(*ROLE_CAPABILITIES.values())
    missing_permissions = sorted(expected_permissions - permission_codes)
    if missing_permissions:
        errors.append("Canonical capabilities are incomplete.")

    capability_rows = connection.execute(
        text(
            "SELECT r.name, p.code FROM roles r "
            "JOIN role_permissions rp ON rp.role_id = r.id AND rp.is_deleted = false "
            "JOIN permissions p ON p.id = rp.permission_id AND p.is_deleted = false "
            "WHERE r.name IN ('admin', 'researcher', 'staff')"
        )
    ).mappings()
    actual_capabilities = {(str(row["name"]), str(row["code"])) for row in capability_rows}
    missing_capabilities = sorted(
        (role, code)
        for role, codes in ROLE_CAPABILITIES.items()
        for code in codes
        if (role, code) not in actual_capabilities
    )
    if missing_capabilities:
        errors.append("Canonical role capabilities are incomplete.")

    expected_user_roles: dict[str, str | None] = {}
    if users:
        for user in users:
            if bool(user["active"]) and not bool(user["deleted"]):
                expected_user_roles[str(user["id"])] = str(user["mapped_role"])
    else:
        active_ids = connection.execute(
            text("SELECT id::text FROM users WHERE is_active = true AND is_deleted = false")
        ).scalars()
        expected_user_roles = {str(user_id): None for user_id in active_ids}
    mapped_rows = connection.execute(
        text(
            "SELECT ur.user_id::text AS user_id, r.name FROM user_roles ur "
            "JOIN roles r ON r.id = ur.role_id "
            "WHERE ur.is_deleted = false AND ur.user_id IN "
            "(SELECT id FROM users WHERE is_active = true AND is_deleted = false)"
        )
    ).mappings()
    actual_user_roles = {(str(row["user_id"]), str(row["name"])) for row in mapped_rows}
    missing_user_roles = sorted(
        user_id
        for user_id, role in expected_user_roles.items()
        if not any(
            actual_user_id == user_id and (role is None or actual_role == role)
            for actual_user_id, actual_role in actual_user_roles
        )
    )
    if missing_user_roles:
        errors.append("One or more active legacy users have no canonical global role.")
    active_admins = sorted(
        user_id
        for user_id, role in actual_user_roles
        if role == "admin" and user_id in expected_user_roles
    )
    if not active_admins:
        errors.append("At least one active admin is required after the bridge.")

    auth_user_id_nulls = [
        str(user_id)
        for (user_id,) in connection.execute(
            text("SELECT id::text FROM users WHERE auth_user_id IS NULL ORDER BY id")
        ).all()
    ]
    verification = {
        "final_revision": revision,
        "owner_column_absent": not bool(owner_column),
        "survey_memberships_absent": not bool(memberships),
        "canonical_roles": sorted(role_ids),
        "canonical_capabilities_complete": not missing_permissions and not missing_capabilities,
        "active_legacy_users_mapped": not missing_user_roles,
        "active_admin_ids": active_admins,
        "missing_active_user_ids": missing_user_roles,
        "auth_user_id_nulls": auth_user_id_nulls,
        "role_mapping_keys_used": sorted(
            {
                _normalise_role(user["role"])
                for user in users
                if _normalise_role(user["role"]) not in BUILTIN_ROLES
                and _normalise_role(user["role"]) in role_mapping
            }
        ),
    }
    return verification, errors


def _base_report(mode: str) -> dict[str, Any]:
    return {
        "schema": "peii.collaboration-upgrade/v1",
        "mode": mode,
        "status": "failed",
        "revision_before": None,
        "revision_after": None,
        "legacy_users": [],
        "owner_backfill": {"planned": 0, "updated": 0},
        "user_role_mapping": {"inserted": 0, "reactivated": 0, "already_active": 0},
        "auth_user_id_nulls": [],
        "audit_event_id": None,
        "verification": {},
        "errors": [],
        "warnings": [],
    }


def run_bridge(
    *,
    apply: bool = False,
    database_url: str | None = None,
    role_mapping: Mapping[str, str] | None = None,
    engine: Engine | None = None,
    confirm_backup: bool = False,
) -> dict[str, Any]:
    """Run a preflight or apply the bridge and return a JSON-compatible report."""

    report = _base_report("apply" if apply else "dry-run")
    if apply and not confirm_backup:
        report["status"] = "backup_confirmation_required"
        report["errors"] = [
            "Apply mode requires --confirm-backup after a verified backup or PITR point."
        ]
        return report

    active_engine: Engine | None = None
    owns_engine = False
    try:
        parsed_url = _database_url(database_url)
        mapping = {
            _normalise_role(key): _normalise_role(value)
            for key, value in (role_mapping or {}).items()
        }
        if any(not key or value not in BUILTIN_ROLES for key, value in mapping.items()):
            raise BridgeError("Role mapping values must be admin, researcher, or staff.")
        active_engine = engine or create_engine(parsed_url, pool_pre_ping=True)
        owns_engine = engine is None
        with active_engine.connect() as connection:
            _acquire_lock(connection)
            connection.commit()
            revision = _current_revision(connection)
            report["revision_before"] = revision

            if revision == HEAD_REVISION:
                verification, errors = _verify_final(connection, [], mapping)
                report["verification"] = verification
                report["auth_user_id_nulls"] = verification.get("auth_user_id_nulls", [])
                report["revision_after"] = revision
                if errors:
                    report["errors"] = errors
                else:
                    report["status"] = "no-op"
                return report

            if revision != START_REVISION:
                raise BridgeError(
                    f"Unsupported intermediate revision {revision}. Restore a backup at "
                    f"{START_REVISION} or complete a reviewed forward-fix; do not downgrade "
                    "or manually recreate collaboration tables."
                )

            users = _legacy_users(connection)
            captured_users, unknown_roles = _map_legacy_users(users, mapping)
            report["legacy_users"] = captured_users
            if unknown_roles:
                report["errors"] = [
                    "Unknown legacy roles require an explicit JSON mapping before destructive work:"
                ] + [
                    f"user {item['id']} has legacy role {item['role']!r}"
                    for item in unknown_roles
                ]
                report["status"] = "preflight_aborted"
                return report

            owner_plan, owner_failures = _survey_owner_plan(connection, captured_users)
            report["owner_backfill"]["planned"] = len(owner_plan)
            if owner_failures:
                report["errors"] = [
                    "Every survey needs a deterministic temporary owner before the owner "
                    "constraint "
                    "is enforced."
                ] + [
                    f"survey {item['survey_id']}: {item['reason']}" for item in owner_failures
                ]
                report["status"] = "preflight_aborted"
                return report

            if not any(
                user.get("mapped_role") == "admin"
                and bool(user["active"])
                and not bool(user["deleted"])
                for user in captured_users
            ):
                raise BridgeError("At least one active legacy admin is required before bridging.")

            if not apply:
                report["status"] = "dry_run"
                report["revision_after"] = revision
                return report

            script = _script_directory()
            _validate_upgrade_path(script)
            with connection.begin():
                _apply_revision(connection, UPGRADE_PATH[0], script)
                report["owner_backfill"]["updated"] = _backfill_temporary_owners(
                    connection, owner_plan
                )
                for next_revision in UPGRADE_PATH[1:]:
                    _apply_revision(connection, next_revision, script)
                connection.execute(
                    text("UPDATE alembic_version SET version_num = :revision"),
                    {"revision": HEAD_REVISION},
                )
                role_ids = _canonical_role_ids(connection)
                report["user_role_mapping"] = _insert_missing_user_roles(
                    connection, captured_users, role_ids
                )
                active_user_count = sum(
                    bool(user["active"]) and not bool(user["deleted"])
                    for user in captured_users
                )
                _insert_bridge_audit_log(
                    connection,
                    report["user_role_mapping"],
                    active_user_count,
                )
                report["audit_event_id"] = str(BRIDGE_AUDIT_ID)
                verification, errors = _verify_final(connection, captured_users, mapping)
                report["verification"] = verification
                report["auth_user_id_nulls"] = verification.get("auth_user_id_nulls", [])
                if errors:
                    raise BridgeError("Final verification failed: " + " ".join(errors))
                report["revision_after"] = verification["final_revision"]
            report["status"] = "applied"
            return report
    except BridgeError as exc:
        report["errors"] = [str(exc)]
    except Exception as exc:  # Do not expose driver messages, URLs, or credentials in reports.
        report["errors"] = [
            f"Unexpected bridge failure ({type(exc).__name__}); inspect database logs."
        ]
    finally:
        if owns_engine and active_engine is not None:
            active_engine.dispose()
    return report


def _parse_args(argv: Sequence[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="apply the bridge; without this flag the command is read-only",
    )
    parser.add_argument(
        "--confirm-backup",
        action="store_true",
        help="confirm a verified backup or PITR recovery point before apply mode",
    )
    parser.add_argument(
        "--role-map",
        "--role-mapping",
        dest="role_mapping",
        type=Path,
        help="JSON file mapping unknown legacy roles to admin, researcher, or staff",
    )
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = _parse_args(argv)
    try:
        mapping = load_role_mapping(args.role_mapping)
        report = run_bridge(
            apply=args.apply,
            role_mapping=mapping,
            confirm_backup=args.confirm_backup,
        )
    except BridgeError as exc:
        report = _base_report("apply" if args.apply else "dry-run")
        report["errors"] = [str(exc)]
    print(json.dumps(report, sort_keys=True, separators=(",", ":")))
    return 0 if report["status"] in {"dry_run", "applied", "no-op"} else 2


if __name__ == "__main__":  # pragma: no cover - exercised by the operational CLI.
    sys.exit(main())
