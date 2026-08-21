import ast
from pathlib import Path

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, select
from sqlmodel.ext.asyncio.session import AsyncSession

from models.audit_log import AuditLog
from models.user import User
from services.audit_service import AuditEvent, commit_with_audit

pytestmark = pytest.mark.anyio


async def test_commit_with_audit_rolls_back_when_audit_staging_fails(monkeypatch):
    engine = create_async_engine(
        "sqlite+aiosqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as connection:
        await connection.run_sync(SQLModel.metadata.create_all)

    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with session_factory() as session:
        user = User(
            user_id="USER-ROLLBACK",
            email="rollback@example.com",
            username="rollback-user",
            password="hashed-password",
            role="staff",
            first_name="Rollback",
            last_name="Test",
        )
        session.add(user)

        original_add_all = session.add_all

        def fail_audit_staging(objects):
            if any(isinstance(obj, AuditLog) for obj in objects):
                raise RuntimeError("audit staging failed")
            original_add_all(objects)

        monkeypatch.setattr(session, "add_all", fail_audit_staging)

        with pytest.raises(RuntimeError, match="audit staging failed"):
            await commit_with_audit(
                session,
                [
                    AuditEvent(
                        action="create",
                        resource_type="user",
                        resource_id=user.user_id,
                    )
                ],
            )

        assert (await session.exec(select(User))).all() == []
        assert (await session.exec(select(AuditLog))).all() == []

    await engine.dispose()


def test_mutation_modules_do_not_commit_outside_audit_service():
    backend_dir = Path(__file__).resolve().parents[1]
    paths = [
        *backend_dir.joinpath("services").glob("*.py"),
        *backend_dir.joinpath("scripts").glob("*.py"),
    ]

    for path in paths:
        if path.name == "audit_service.py":
            continue
        tree = ast.parse(path.read_text(), filename=str(path))
        writes = [
            node
            for node in ast.walk(tree)
            if isinstance(node, ast.Call)
            and isinstance(node.func, ast.Attribute)
            and node.func.attr in {"add", "add_all", "delete", "execute"}
        ]
        if writes:
            assert "commit_with_audit" in path.read_text(), (
                f"Database write without commit_with_audit in {path}"
            )
        commits = [
            node
            for node in ast.walk(tree)
            if isinstance(node, ast.Call)
            and isinstance(node.func, ast.Attribute)
            and node.func.attr == "commit"
        ]
        assert not commits, f"Direct commit found in {path}: {commits[0].lineno}"


def test_audited_commit_requires_events():
    tree = ast.parse(
        Path(__file__).resolve().parents[1].joinpath("services/audit_service.py").read_text()
    )
    commit_function = next(
        node
        for node in tree.body
        if isinstance(node, ast.AsyncFunctionDef) and node.name == "commit_with_audit"
    )
    assert any(
        isinstance(node, ast.Raise)
        and isinstance(node.exc, ast.Call)
        and isinstance(node.exc.func, ast.Name)
        and node.exc.func.id == "ValueError"
        for node in ast.walk(commit_function)
    )
