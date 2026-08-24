from contextlib import asynccontextmanager

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, select
from sqlmodel.ext.asyncio.session import AsyncSession

from core.exceptions import AppError
from models.rbac import Permission, Role, RolePermission, UserRole
from models.user import User
from schemas.rbac import RoleUpdate
from schemas.user import UserDelete, UserUpdate
from services import rbac_service, user_service

pytestmark = pytest.mark.anyio


@asynccontextmanager
async def rbac_session():
    engine = create_async_engine(
        "sqlite+aiosqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as connection:
        await connection.run_sync(SQLModel.metadata.create_all)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with session_factory() as session:
        yield session
    await engine.dispose()


async def create_rbac_state(
    session: AsyncSession,
) -> tuple[User, User, User, Role, Role, Permission]:
    actor = User(
        user_id="USER-ACTOR",
        email="actor@example.com",
        username="actor",
        first_name="Actor",
        last_name="Admin",
    )
    admin_user = User(
        user_id="USER-ADMIN",
        email="admin@example.com",
        username="admin",
        first_name="System",
        last_name="Admin",
    )
    second_admin = User(
        user_id="USER-SECOND",
        email="second@example.com",
        username="second",
        first_name="Second",
        last_name="Admin",
    )
    admin_role = Role(name="admin", is_system=True)
    staff_role = Role(name="staff")
    permission = Permission(code="users.read", description="View users.")
    session.add_all([actor, admin_user, second_admin, admin_role, staff_role, permission])
    await session.flush()
    session.add_all(
        [
            RolePermission(role_id=admin_role.id, permission_id=permission.id),
            UserRole(user_id=admin_user.id, role_id=admin_role.id),
        ]
    )
    await session.commit()
    return actor, admin_user, second_admin, admin_role, staff_role, permission


async def test_system_admin_permissions_cannot_be_replaced():
    async with rbac_session() as session:
        actor, _, _, admin_role, _, permission = await create_rbac_state(session)

        with pytest.raises(AppError, match="permissions cannot be changed") as error:
            await rbac_service.update_role(
                session,
                admin_role,
                RoleUpdate(permission_ids=[]),
                actor.id,
                None,
            )

        assert error.value.status_code == 409
        assignments = await session.exec(
            select(RolePermission).where(RolePermission.role_id == admin_role.id)
        )
        assert [assignment.permission_id for assignment in assignments.all()] == [permission.id]


async def test_administrator_cannot_remove_own_admin_role():
    async with rbac_session() as session:
        _, admin_user, _, _, staff_role, _ = await create_rbac_state(session)

        with pytest.raises(AppError, match="cannot remove their own Admin role") as error:
            await rbac_service.set_user_roles(
                session,
                admin_user,
                [staff_role.id],
                admin_user.id,
                None,
            )

        assert error.value.status_code == 409


async def test_final_administrator_cannot_be_removed_by_another_user():
    async with rbac_session() as session:
        actor, admin_user, _, _, staff_role, _ = await create_rbac_state(session)

        with pytest.raises(AppError, match="At least one active administrator") as error:
            await rbac_service.set_user_roles(
                session,
                admin_user,
                [staff_role.id],
                actor.id,
                None,
            )

        assert error.value.status_code == 409


async def test_administrator_cannot_deactivate_or_delete_themselves():
    async with rbac_session() as session:
        _, admin_user, _, _, _, _ = await create_rbac_state(session)

        with pytest.raises(AppError, match="cannot deactivate themselves"):
            await user_service.update_user(
                session,
                admin_user.user_id,
                UserUpdate(is_active=False),
                admin_user.id,
            )
        with pytest.raises(AppError, match="cannot delete themselves"):
            await user_service.soft_delete_user(
                session,
                admin_user.user_id,
                UserDelete(),
                admin_user.id,
            )

        await session.refresh(admin_user)
        assert admin_user.is_active is True
        assert admin_user.is_deleted is False


async def test_final_administrator_cannot_be_deactivated_or_deleted_by_another_user():
    async with rbac_session() as session:
        actor, admin_user, _, _, _, _ = await create_rbac_state(session)

        with pytest.raises(AppError, match="At least one active administrator"):
            await user_service.update_user(
                session,
                admin_user.user_id,
                UserUpdate(is_active=False),
                actor.id,
            )
        with pytest.raises(AppError, match="At least one active administrator"):
            await user_service.soft_delete_user(
                session,
                admin_user.user_id,
                UserDelete(),
                actor.id,
            )

        await session.refresh(admin_user)
        assert admin_user.is_active is True
        assert admin_user.is_deleted is False
