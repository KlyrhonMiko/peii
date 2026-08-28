from __future__ import annotations

import os
import sys
from logging.config import fileConfig
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import Connection, engine_from_config, pool, text
from sqlmodel import SQLModel

from alembic import context

ROOT_DIR = Path(__file__).resolve().parents[2]
BACKEND_DIR = Path(__file__).resolve().parents[1]

sys.path.insert(0, str(BACKEND_DIR))
load_dotenv(ROOT_DIR / ".env", override=False)

from core.config import settings  # noqa: E402
from models import (  # noqa: F401,E402
    AuditLog,
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

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = SQLModel.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=settings.database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        compare_server_default=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    # ConfigParser interpolation treats percent signs as placeholders. Escape them
    # only for the online engine configuration; the offline URL is passed directly
    # to Alembic and must remain unchanged.
    config.set_main_option("sqlalchemy.url", settings.database_url.replace("%", "%%"))
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
        connect_args=settings.database_sync_tls_args,
    )

    with connectable.connect() as connection:
        _assert_expected_schema(connection)
        _assert_rls_migration_version_access(connection)
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            compare_server_default=True,
        )

        with context.begin_transaction():
            context.run_migrations()


def _assert_rls_migration_version_access(connection: Connection) -> None:
    """Guard future migrations from losing access to an RLS-protected version table."""

    if connection.dialect.name != "postgresql":
        return

    try:
        row = connection.execute(
            text(
                "SELECT c.relrowsecurity, "
                "pg_get_userbyid(c.relowner) = current_user, "
                "migration_role.rolbypassrls, "
                "has_table_privilege(current_user, "
                "format('%I.%I', n.nspname, c.relname), 'SELECT'), "
                "has_table_privilege(current_user, "
                "format('%I.%I', n.nspname, c.relname), 'INSERT'), "
                "has_table_privilege(current_user, "
                "format('%I.%I', n.nspname, c.relname), 'UPDATE'), "
                "has_table_privilege(current_user, "
                "format('%I.%I', n.nspname, c.relname), 'DELETE'), "
                "current_user "
                "FROM pg_class AS c "
                "JOIN pg_namespace AS n ON n.oid = c.relnamespace "
                "JOIN pg_roles AS migration_role "
                "ON migration_role.rolname = current_user "
                "WHERE n.nspname = current_schema() "
                "AND c.relname = 'alembic_version' "
                "AND c.relkind IN ('r', 'p')"
            )
        ).one_or_none()
        connection.commit()
    except BaseException:
        connection.rollback()
        raise

    # Fresh databases do not have alembic_version until Alembic creates it.
    if row is None or not row[0]:
        return

    required_privileges = ("SELECT", "INSERT", "UPDATE", "DELETE")
    missing_privileges = tuple(
        privilege
        for privilege, granted in zip(required_privileges, row[3:7], strict=True)
        if not granted
    )
    if (not row[1] and not row[2]) or missing_privileges:
        access_basis = (
            "owner or BYPASSRLS role" if not (row[1] or row[2]) else "effective privileges"
        )
        missing = ", ".join(missing_privileges) or "none"
        raise RuntimeError(
            "Alembic migration preflight failed: RLS-enabled alembic_version "
            f"requires the current migration identity {row[7]!r} to have "
            f"{access_basis} and effective SELECT/INSERT/UPDATE/DELETE access "
            f"(missing: {missing})."
        )


def _assert_expected_schema(connection: Connection) -> None:
    expected_schema = os.environ.get("ALEMBIC_EXPECTED_SCHEMA")
    if expected_schema is None:
        return
    expected_schema = expected_schema.strip()
    if not expected_schema:
        raise RuntimeError("ALEMBIC_EXPECTED_SCHEMA must not be empty when provided.")

    try:
        actual_schema = connection.execute(text("SELECT current_schema()")).scalar_one_or_none()
        # The schema check starts an implicit read-only transaction. End it before
        # Alembic establishes its migration transaction.
        connection.commit()
    except BaseException:
        connection.rollback()
        raise

    if actual_schema != expected_schema:
        raise RuntimeError(
            "Alembic schema guard failed: "
            f"expected {expected_schema!r}, got {actual_schema!r}."
        )


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
