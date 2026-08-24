"""add shared survey capabilities

Revision ID: 20260825_0002
Revises: 81568591615f
Create Date: 2026-08-25

This is a data-only, forward migration.  It restores canonical capability rows
and assignments when they were soft-deleted, while leaving custom rows and
assignments untouched.
"""

from datetime import datetime
from uuid import UUID

import sqlalchemy as sa

from alembic import op

revision = "20260825_0002"
down_revision = "81568591615f"
branch_labels = None
depends_on = None

SYSTEM_ACTOR_ID = UUID("00000000-0000-0000-0000-000000000001")
MIGRATION_TIMESTAMP = datetime(2026, 8, 25, 0, 2)

BASE_PERMISSIONS = (
    ("portal.access", "Access the PEII portal."),
    ("users.read", "View users."),
    ("users.invite", "Invite users."),
    ("users.update", "Update user profiles."),
    ("users.assign_roles", "Assign user roles."),
    ("users.change_status", "Activate or deactivate users."),
    ("users.revoke_sessions", "Revoke user sessions."),
    ("users.delete", "Delete user records."),
    ("users.restore", "Restore user records."),
    ("roles.read", "View roles and permissions."),
    ("roles.manage", "Manage roles and permissions."),
    ("audit_logs.read", "View audit logs."),
    ("ml.models.read", "View ML models."),
    ("ml.sentiment.run", "Run sentiment analysis."),
)

SHARED_SURVEY_PERMISSIONS = (
    ("surveys.read", "View surveys.", UUID("00000000-0000-0000-0000-000000001001")),
    (
        "surveys.manage",
        "Create, update, structure, archive, and restore surveys.",
        UUID("00000000-0000-0000-0000-000000001002"),
    ),
    (
        "survey_distributions.manage",
        "Create, list, rotate, and revoke survey distributions.",
        UUID("00000000-0000-0000-0000-000000001003"),
    ),
    (
        "survey_responses.read_aggregates",
        "View aggregated survey responses.",
        UUID("00000000-0000-0000-0000-000000001004"),
    ),
    (
        "survey_responses.read_raw",
        "View raw survey responses.",
        UUID("00000000-0000-0000-0000-000000001005"),
    ),
    (
        "survey_responses.export",
        "Export survey responses.",
        UUID("00000000-0000-0000-0000-000000001006"),
    ),
    (
        "survey_responses.erase",
        "Erase survey responses.",
        UUID("00000000-0000-0000-0000-000000001007"),
    ),
)

PERMISSIONS = tuple(
    (code, description, UUID(f"00000000-0000-0000-0000-000000000{index:03d}"))
    for index, (code, description) in enumerate(BASE_PERMISSIONS, start=1)
) + SHARED_SURVEY_PERMISSIONS

ROLES = (
    ("admin", "System admin role.", UUID("00000000-0000-0000-0000-000000002001")),
    (
        "researcher",
        "System researcher role.",
        UUID("00000000-0000-0000-0000-000000002002"),
    ),
    ("staff", "System staff role.", UUID("00000000-0000-0000-0000-000000002003")),
)

ROLE_CAPABILITIES = {
    "admin": {permission[0] for permission in PERMISSIONS},
    "researcher": {
        "portal.access",
        "ml.models.read",
        "ml.sentiment.run",
        *(permission[0] for permission in SHARED_SURVEY_PERMISSIONS[:-1]),
    },
    "staff": {
        "portal.access",
        "ml.models.read",
        "surveys.read",
        "survey_responses.read_aggregates",
    },
}


def _tables() -> tuple[sa.TableClause, sa.TableClause, sa.TableClause]:
    permissions = sa.table(
        "permissions",
        sa.column("id", sa.Uuid()),
        sa.column("created_at", sa.DateTime()),
        sa.column("updated_at", sa.DateTime()),
        sa.column("is_deleted", sa.Boolean()),
        sa.column("deleted_at", sa.DateTime()),
        sa.column("performed_by", sa.Uuid()),
        sa.column("code", sa.String()),
        sa.column("description", sa.String()),
    )
    roles = sa.table(
        "roles",
        sa.column("id", sa.Uuid()),
        sa.column("created_at", sa.DateTime()),
        sa.column("updated_at", sa.DateTime()),
        sa.column("is_deleted", sa.Boolean()),
        sa.column("deleted_at", sa.DateTime()),
        sa.column("performed_by", sa.Uuid()),
        sa.column("name", sa.String()),
        sa.column("description", sa.String()),
        sa.column("is_system", sa.Boolean()),
        sa.column("is_active", sa.Boolean()),
    )
    role_permissions = sa.table(
        "role_permissions",
        sa.column("id", sa.Uuid()),
        sa.column("created_at", sa.DateTime()),
        sa.column("updated_at", sa.DateTime()),
        sa.column("is_deleted", sa.Boolean()),
        sa.column("deleted_at", sa.DateTime()),
        sa.column("performed_by", sa.Uuid()),
        sa.column("role_id", sa.Uuid()),
        sa.column("permission_id", sa.Uuid()),
    )
    return permissions, roles, role_permissions


def _assert_id_is_free(bind: sa.Connection, table: sa.TableClause, row_id: UUID) -> None:
    if bind.execute(sa.select(table.c.id).where(table.c.id == row_id)).first() is not None:
        raise RuntimeError(f"Cannot seed RBAC row {row_id}: its explicit ID is already in use.")


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        bind.execute(sa.text("SELECT pg_advisory_xact_lock(202608250002)"))
    permissions, roles, role_permissions = _tables()
    permission_ids: dict[str, UUID] = {}
    role_ids: dict[str, UUID] = {}

    for code, description, explicit_id in PERMISSIONS:
        row = bind.execute(
            sa.select(permissions).where(permissions.c.code == code)
        ).mappings().first()
        if row is None:
            _assert_id_is_free(bind, permissions, explicit_id)
            bind.execute(
                permissions.insert().values(
                    id=explicit_id,
                    created_at=MIGRATION_TIMESTAMP,
                    updated_at=MIGRATION_TIMESTAMP,
                    is_deleted=False,
                    deleted_at=None,
                    performed_by=SYSTEM_ACTOR_ID,
                    code=code,
                    description=description,
                )
            )
            permission_ids[code] = explicit_id
        else:
            permission_ids[code] = row["id"]
            if row["is_deleted"]:
                bind.execute(
                    permissions.update()
                    .where(permissions.c.id == row["id"])
                    .values(
                        is_deleted=False,
                        deleted_at=None,
                        updated_at=MIGRATION_TIMESTAMP,
                        performed_by=SYSTEM_ACTOR_ID,
                    )
                )

    for name, description, explicit_id in ROLES:
        row = bind.execute(sa.select(roles).where(roles.c.name == name)).mappings().first()
        if row is None:
            _assert_id_is_free(bind, roles, explicit_id)
            bind.execute(
                roles.insert().values(
                    id=explicit_id,
                    created_at=MIGRATION_TIMESTAMP,
                    updated_at=MIGRATION_TIMESTAMP,
                    is_deleted=False,
                    deleted_at=None,
                    performed_by=SYSTEM_ACTOR_ID,
                    name=name,
                    description=description,
                    is_system=True,
                    is_active=True,
                )
            )
            role_ids[name] = explicit_id
        else:
            if not row["is_system"] or not row["is_active"] or row["is_deleted"]:
                raise RuntimeError(f"Cannot seed incompatible canonical role {name!r}.")
            role_ids[name] = row["id"]

    edge_number = 1
    for role_name, codes in ROLE_CAPABILITIES.items():
        for code, permission_id in permission_ids.items():
            if code not in codes:
                continue
            role_id = role_ids[role_name]
            explicit_id = UUID(f"00000000-0000-0000-0000-000000003{edge_number:03d}")
            edge_number += 1
            row = bind.execute(
                sa.select(role_permissions).where(
                    role_permissions.c.role_id == role_id,
                    role_permissions.c.permission_id == permission_id,
                )
            ).mappings().first()
            if row is not None:
                if row["is_deleted"]:
                    bind.execute(
                        role_permissions.update()
                        .where(role_permissions.c.id == row["id"])
                        .values(
                            is_deleted=False,
                            deleted_at=None,
                            updated_at=MIGRATION_TIMESTAMP,
                            performed_by=SYSTEM_ACTOR_ID,
                        )
                )
                continue

            _assert_id_is_free(bind, role_permissions, explicit_id)
            bind.execute(
                role_permissions.insert().values(
                    id=explicit_id,
                    created_at=MIGRATION_TIMESTAMP,
                    updated_at=MIGRATION_TIMESTAMP,
                    is_deleted=False,
                    deleted_at=None,
                    performed_by=SYSTEM_ACTOR_ID,
                    role_id=role_id,
                    permission_id=permission_id,
                )
            )


def downgrade() -> None:
    # This data migration is intentionally forward-only. Removing rows could
    # delete custom grants or undo a repaired canonical assignment.
    pass
