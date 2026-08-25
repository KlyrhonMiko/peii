import importlib
from collections.abc import AsyncIterator, Callable
from pathlib import Path
from uuid import UUID, uuid4

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, select
from sqlmodel.ext.asyncio.session import AsyncSession

from models.rbac import Permission, Role, RolePermission, UserRole
from models.user import User
from services.rbac_service import PERMISSIONS

bootstrap_admin = importlib.import_module("scripts.bootstrap_admin")

CANONICAL_ADMIN_ROLE_ID = UUID("00000000-0000-0000-0000-000000000101")
SYSTEM_ACTOR_ID = UUID("00000000-0000-0000-0000-000000000001")
SUBJECT_ID = UUID("00000000-0000-0000-0000-000000000901")
EMAIL = "admin@example.com"
USERNAME = "admin"


@pytest.fixture
async def session() -> AsyncIterator[AsyncSession]:
    engine = create_async_engine(
        "sqlite+aiosqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as connection:
        await connection.run_sync(SQLModel.metadata.create_all)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as db_session:
        yield db_session
    await engine.dispose()


async def seed_catalog(
    session: AsyncSession, *, drift: Callable[[Role], None] | None = None
) -> Role:
    role = Role(
        id=CANONICAL_ADMIN_ROLE_ID,
        name="admin",
        description="System admin role.",
        is_system=True,
        is_active=True,
    )
    if drift is not None:
        drift(role)
    session.add(role)
    for index, code in enumerate(PERMISSIONS):
        permission = Permission(
            id=UUID(f"00000000-0000-0000-0000-{index + 201:012d}"),
            code=code,
            description=PERMISSIONS[code],
        )
        session.add(permission)
        session.add(RolePermission(role_id=role.id, permission_id=permission.id))
    await session.commit()
    return role


async def invoke(session: AsyncSession, **overrides: object) -> User:
    options: dict[str, object] = {
        "email": EMAIL,
        "username": USERNAME,
        "first_name": "Initial",
        "last_name": "Admin",
        "app_origin": "https://portal.example.com",
        "system_actor_id": SYSTEM_ACTOR_ID,
    }
    options.update(overrides)
    return await bootstrap_admin.bootstrap_admin(session, **options)  # type: ignore[arg-type]


async def auth_response(*, subject: UUID = SUBJECT_ID, email: str = EMAIL) -> dict[str, object]:
    return {"id": str(subject), "email": email}


@pytest.mark.anyio
async def test_bootstrap_creates_user_and_admin_assignment(session: AsyncSession) -> None:
    await seed_catalog(session)
    calls: list[str] = []

    async def lookup(email: str) -> None:
        calls.append("lookup")
        return None

    async def invite(email: str, redirect: str) -> dict[str, object]:
        calls.append("invite")
        return {"user": await auth_response()}

    user = await invoke(
        session,
        get_auth_user_by_email_fn=lookup,
        invite_user_fn=invite,
    )

    assert user.auth_user_id == SUBJECT_ID
    assert user.is_active is True
    assignment = (
        await session.exec(select(UserRole).where(UserRole.user_id == user.id))
    ).one()
    assert assignment.role_id == CANONICAL_ADMIN_ROLE_ID
    assert assignment.performed_by == SYSTEM_ACTOR_ID
    assert calls == ["lookup", "invite"]


@pytest.mark.anyio
async def test_bootstrap_is_idempotent_without_overwriting_existing_identity(
    session: AsyncSession,
) -> None:
    await seed_catalog(session)
    user = User(
        user_id="USER-EXISTING",
        auth_user_id=SUBJECT_ID,
        email=EMAIL,
        username=USERNAME,
        first_name="Initial",
        last_name="Admin",
    )
    session.add(user)
    session.add(UserRole(user_id=user.id, role_id=CANONICAL_ADMIN_ROLE_ID))
    await session.commit()
    original_performed_by = user.performed_by

    async def lookup(email: str) -> dict[str, object]:
        return await auth_response()

    result = await invoke(session, get_auth_user_by_email_fn=lookup)

    assert result.id == user.id
    assert result.auth_user_id == SUBJECT_ID
    assert result.performed_by == original_performed_by
    assert len(list((await session.exec(select(UserRole))).all())) == 1


@pytest.mark.anyio
@pytest.mark.parametrize(
    "attribute,value",
    [
        ("name", "not-admin"),
        ("is_system", False),
        ("is_active", False),
        ("is_deleted", True),
    ],
)
async def test_bootstrap_rejects_admin_role_state_drift(
    session: AsyncSession, attribute: str, value: object
) -> None:
    await seed_catalog(session, drift=lambda role: setattr(role, attribute, value))

    async def lookup(email: str) -> None:
        raise AssertionError("Supabase must not be called")

    with pytest.raises(RuntimeError, match="canonical admin role"):
        await invoke(session, get_auth_user_by_email_fn=lookup)


@pytest.mark.anyio
async def test_bootstrap_rejects_admin_role_id_drift(session: AsyncSession) -> None:
    await seed_catalog(session, drift=lambda role: setattr(role, "id", uuid4()))

    async def lookup(email: str) -> None:
        raise AssertionError("Supabase must not be called")

    with pytest.raises(RuntimeError, match="canonical admin role"):
        await invoke(session, get_auth_user_by_email_fn=lookup)


@pytest.mark.anyio
@pytest.mark.parametrize("edge_state", ["deleted", "missing", "extra"])
async def test_bootstrap_rejects_admin_role_permission_edge_drift(
    session: AsyncSession, edge_state: str
) -> None:
    role = await seed_catalog(session)
    if edge_state == "deleted":
        edge = (await session.exec(select(RolePermission))).first()
        assert edge is not None
        edge.is_deleted = True
    elif edge_state == "missing":
        edge = (await session.exec(select(RolePermission))).first()
        assert edge is not None
        await session.delete(edge)
    else:
        permission = Permission(code="unexpected", description="Unexpected permission")
        session.add(permission)
        await session.flush()
        session.add(RolePermission(role_id=role.id, permission_id=permission.id))
    await session.commit()

    async def lookup(email: str) -> None:
        raise AssertionError("Supabase must not be called")

    with pytest.raises(RuntimeError, match="canonical admin role"):
        await invoke(session, get_auth_user_by_email_fn=lookup)


@pytest.mark.anyio
@pytest.mark.parametrize(
    "users",
    [
        [
            User(
                user_id="USER-EMAIL",
                email=EMAIL,
                username="different",
                first_name="A",
                last_name="B",
            )
        ],
        [
            User(
                user_id="USER-USERNAME",
                email="different@example.com",
                username=USERNAME,
                first_name="A",
                last_name="B",
            )
        ],
        [
            User(
                user_id="USER-ONE",
                email=EMAIL,
                username="different",
                first_name="A",
                last_name="B",
            ),
            User(
                user_id="USER-TWO",
                email="other@example.com",
                username=USERNAME,
                first_name="A",
                last_name="B",
            ),
        ],
    ],
)
async def test_bootstrap_rejects_split_or_multiple_local_matches(
    session: AsyncSession, users: list[User]
) -> None:
    await seed_catalog(session)
    session.add_all(users)
    await session.commit()
    calls: list[str] = []

    async def lookup(email: str) -> None:
        calls.append("lookup")
        return None

    with pytest.raises(RuntimeError, match="canonical local user"):
        await invoke(session, get_auth_user_by_email_fn=lookup)
    assert calls == []


@pytest.mark.anyio
@pytest.mark.parametrize("is_active,is_deleted", [(False, False), (True, True)])
async def test_bootstrap_rejects_inactive_or_deleted_existing_user(
    session: AsyncSession, is_active: bool, is_deleted: bool
) -> None:
    await seed_catalog(session)
    session.add(
        User(
            user_id="USER-EXISTING",
            email=EMAIL,
            username=USERNAME,
            first_name="A",
            last_name="B",
            is_active=is_active,
            is_deleted=is_deleted,
        )
    )
    await session.commit()

    async def lookup(email: str) -> None:
        raise AssertionError("Supabase must not be called")

    with pytest.raises(RuntimeError, match="canonical local user"):
        await invoke(session, get_auth_user_by_email_fn=lookup)


@pytest.mark.anyio
async def test_bootstrap_rejects_conflicting_subject_without_mutation(
    session: AsyncSession,
) -> None:
    await seed_catalog(session)
    target = User(
        user_id="USER-TARGET",
        email=EMAIL,
        username=USERNAME,
        first_name="A",
        last_name="B",
    )
    other = User(
        user_id="USER-OTHER",
        auth_user_id=SUBJECT_ID,
        email="other@example.com",
        username="other",
        first_name="A",
        last_name="B",
    )
    session.add_all([target, other])
    await session.commit()

    async def lookup(email: str) -> dict[str, object]:
        return await auth_response()

    with pytest.raises(RuntimeError, match="already linked"):
        await invoke(session, get_auth_user_by_email_fn=lookup)
    assert target.auth_user_id is None
    assert len(list((await session.exec(select(UserRole))).all())) == 0


@pytest.mark.anyio
async def test_bootstrap_rejects_soft_deleted_assignment(session: AsyncSession) -> None:
    role = await seed_catalog(session)
    user = User(
        user_id="USER-EXISTING",
        auth_user_id=SUBJECT_ID,
        email=EMAIL,
        username=USERNAME,
        first_name="A",
        last_name="B",
    )
    session.add(user)
    await session.flush()
    session.add(UserRole(user_id=user.id, role_id=role.id, is_deleted=True))
    await session.commit()

    async def lookup(email: str) -> dict[str, object]:
        return await auth_response()

    with pytest.raises(RuntimeError, match="soft-deleted"):
        await invoke(session, get_auth_user_by_email_fn=lookup)


@pytest.mark.anyio
@pytest.mark.parametrize(
    "response",
    [
        {"id": "not-a-uuid", "email": EMAIL},
        {"id": str(SUBJECT_ID), "email": "different@example.com"},
        {"user": {"id": str(SUBJECT_ID)}},
    ],
)
async def test_bootstrap_rejects_malformed_or_mismatched_supabase_response(
    session: AsyncSession, response: dict[str, object]
) -> None:
    await seed_catalog(session)

    async def lookup(email: str) -> dict[str, object] | None:
        return None

    async def invite(email: str, redirect: str) -> dict[str, object]:
        return response

    with pytest.raises(RuntimeError, match="Supabase identity"):
        await invoke(
            session,
            get_auth_user_by_email_fn=lookup,
            invite_user_fn=invite,
        )
    assert len(list((await session.exec(select(User))).all())) == 0


@pytest.mark.parametrize("filename", ["seed_survey.py", "seed_alumni_questionnaire.py"])
def test_seed_scripts_do_not_print_database_url(filename: str) -> None:
    source = (Path(__file__).parents[1] / "scripts" / filename).read_text()
    assert "settings.database_url" not in source
