import ast
from pathlib import Path
from typing import cast
from uuid import UUID

import pytest
from pydantic import ValidationError
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
                        performed_by=user.id,
                    )
                ],
            )

        assert (await session.exec(select(User))).all() == []
        assert (await session.exec(select(AuditLog))).all() == []

    await engine.dispose()


def test_audit_event_requires_an_actor():
    with pytest.raises(TypeError):
        AuditEvent(  # type: ignore[call-arg]
            action="create", resource_type="user", resource_id="USER-1"
        )


async def test_audited_commit_rejects_a_missing_actor():
    engine = create_async_engine(
        "sqlite+aiosqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as connection:
        await connection.run_sync(SQLModel.metadata.create_all)

    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with session_factory() as session:
        event = AuditEvent("create", "user", "USER-1", cast(UUID, None))
        with pytest.raises(ValueError, match="requires an actor"):
            await commit_with_audit(session, [event])

    await engine.dispose()


def test_production_audit_events_always_pass_an_actor():
    backend_dir = Path(__file__).resolve().parents[1]
    paths = [
        *backend_dir.joinpath("services").glob("*.py"),
        *backend_dir.joinpath("routers").glob("*.py"),
        *backend_dir.joinpath("scripts").glob("*.py"),
    ]

    for path in paths:
        tree = ast.parse(path.read_text(), filename=str(path))
        for node in ast.walk(tree):
            if not (
                isinstance(node, ast.Call)
                and isinstance(node.func, ast.Name)
                and node.func.id == "AuditEvent"
            ):
                continue
            has_actor = len(node.args) >= 4 or any(
                keyword.arg == "performed_by" for keyword in node.keywords
            )
            assert has_actor, f"Actor missing from AuditEvent in {path}:{node.lineno}"


def test_section_and_question_write_schemas_do_not_accept_actor_fields():
    from schemas.survey import SurveyCreate
    from schemas.survey_question import SurveyQuestionCreate, SurveyQuestionUpdate
    from schemas.survey_section import SurveySectionCreate, SurveySectionDelete, SurveySectionUpdate

    schemas = (
        SurveySectionCreate,
        SurveySectionUpdate,
        SurveySectionDelete,
        SurveyQuestionCreate,
        SurveyQuestionUpdate,
    )
    assert all("performed_by" not in schema.model_fields for schema in schemas)

    with pytest.raises(ValidationError):
        SurveyCreate.model_validate({"title": "Survey", "performed_by": "actor"})
    with pytest.raises(ValidationError):
        SurveySectionCreate.model_validate({"title": "Section", "performed_by": "actor"})
    with pytest.raises(ValidationError):
        SurveyQuestionCreate.model_validate(
            {
                "question_text": "Question",
                "question_type": "text",
                "section_id": "018f4a1a-7b3b-7d0e-913a-c5f1c5c1c5c2",
                "performed_by": "actor",
            }
        )


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
