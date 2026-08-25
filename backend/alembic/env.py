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
    )

    with connectable.connect() as connection:
        _assert_expected_schema(connection)
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            compare_server_default=True,
        )

        with context.begin_transaction():
            context.run_migrations()


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
