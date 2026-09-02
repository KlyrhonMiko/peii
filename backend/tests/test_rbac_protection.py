from contextlib import asynccontextmanager

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, select
from sqlmodel.ext.asyncio.session import AsyncSession

from core.database import get_async_session
from core.deps import Principal, get_current_principal
from core.exceptions import AppError
from main import app
from models.audit_log import AuditLog
from models.rbac import Permission, Role, RolePermission, UserRole
from models.user import User
from schemas.rbac import RoleCreate, RoleUpdate
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


async def create_role(
    session: AsyncSession, name: str, permission_codes: list[str]
) -> Role:
    role = Role(name=name)
    session.add(role)
    await session.flush()
    for code in permission_codes:
        permission = (await session.exec(select(Permission).where(Permission.code == code))).first()
        if permission is None:
            permission = Permission(code=code, description=code)
            session.add(permission)
            await session.flush()
        session.add(RolePermission(role_id=role.id, permission_id=permission.id))
    await session.flush()
    return role


async def assign_role(session: AsyncSession, user: User, role: Role) -> None:
    session.add(UserRole(user_id=user.id, role_id=role.id))
    await session.flush()


async def audit_count(session: AsyncSession) -> int:
    return len((await session.exec(select(AuditLog))).all())


@asynccontextmanager
async def api_rbac_session():
    generator = app.dependency_overrides[get_async_session]()
    session = await anext(generator)
    try:
        yield session
    finally:
        await generator.aclose()


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


async def test_non_admin_cannot_assign_system_admin_even_with_matching_permissions():
    async with rbac_session() as session:
        actor, _, target, admin_role, _, _ = await create_rbac_state(session)
        assigner_role = await create_role(
            session, "assigner", ["users.read", "users.assign_roles"]
        )
        await assign_role(session, actor, assigner_role)
        await session.commit()
        initial_audits = await audit_count(session)

        with pytest.raises(AppError, match="Only active administrators") as error:
            await rbac_service.set_user_roles(
                session,
                target,
                [admin_role.id],
                actor.id,
                None,
            )

        assert error.value.status_code == 403
        assignments = await session.exec(select(UserRole).where(UserRole.user_id == target.id))
        assert assignments.all() == []
        assert await audit_count(session) == initial_audits


async def test_actor_cannot_assign_custom_role_with_superior_permissions():
    async with rbac_session() as session:
        actor, _, target, _, staff_role, _ = await create_rbac_state(session)
        actor_role = await create_role(session, "assigner", ["users.assign_roles"])
        superior_role = await create_role(
            session, "superior", ["users.assign_roles", "users.read"]
        )
        await assign_role(session, actor, actor_role)
        await assign_role(session, target, staff_role)
        await session.commit()
        initial_audits = await audit_count(session)

        with pytest.raises(AppError, match="exceeding your own") as error:
            await rbac_service.set_user_roles(
                session,
                target,
                [superior_role.id],
                actor.id,
                None,
            )

        assert error.value.status_code == 403
        assignments = await session.exec(select(UserRole).where(UserRole.user_id == target.id))
        assert [assignment.role_id for assignment in assignments.all()] == [staff_role.id]
        assert await audit_count(session) == initial_audits


async def test_actor_cannot_escalate_themselves_with_superior_role():
    async with rbac_session() as session:
        actor, _, _, _, _, _ = await create_rbac_state(session)
        actor_role = await create_role(session, "assigner", ["users.assign_roles"])
        superior_role = await create_role(
            session, "superior", ["users.assign_roles", "users.read"]
        )
        await assign_role(session, actor, actor_role)
        await session.commit()
        initial_audits = await audit_count(session)

        with pytest.raises(AppError, match="exceeding your own"):
            await rbac_service.set_user_roles(
                session,
                actor,
                [superior_role.id],
                actor.id,
                None,
            )

        assignments = await session.exec(select(UserRole).where(UserRole.user_id == actor.id))
        assert [assignment.role_id for assignment in assignments.all()] == [actor_role.id]
        assert await audit_count(session) == initial_audits


async def test_actor_cannot_escalate_their_own_role_with_role_permissions():
    async with rbac_session() as session:
        actor, _, _, _, _, _ = await create_rbac_state(session)
        actor_role = await create_role(session, "self-manager", ["roles.manage"])
        await assign_role(session, actor, actor_role)
        await session.commit()

        before_edges = list(
            (
                await session.exec(
                    select(RolePermission).where(RolePermission.role_id == actor_role.id)
                )
            ).all()
        )
        before_permissions = await rbac_service.effective_permissions(session, actor.id)
        initial_audits = await audit_count(session)
        users_read = (
            await session.exec(select(Permission).where(Permission.code == "users.read"))
        ).one()

        with pytest.raises(AppError, match="exceeding your own") as error:
            await rbac_service.update_role(
                session,
                actor_role,
                RoleUpdate(permission_ids=[users_read.id]),
                actor.id,
                None,
            )

        assert error.value.status_code == 403
        after_edges = list(
            (
                await session.exec(
                    select(RolePermission).where(RolePermission.role_id == actor_role.id)
                )
            ).all()
        )
        assert {(edge.role_id, edge.permission_id) for edge in after_edges} == {
            (edge.role_id, edge.permission_id) for edge in before_edges
        }
        assert await rbac_service.effective_permissions(session, actor.id) == before_permissions
        assert await audit_count(session) == initial_audits


async def test_actor_cannot_escalate_an_assigned_role_with_role_permissions():
    async with rbac_session() as session:
        actor, _, _, _, _, _ = await create_rbac_state(session)
        actor_role = await create_role(session, "role-manager", ["roles.manage"])
        target_role = await create_role(session, "assigned-role", ["roles.manage"])
        await assign_role(session, actor, actor_role)
        await assign_role(session, actor, target_role)
        await session.commit()

        before_edges = list(
            (
                await session.exec(
                    select(RolePermission).where(RolePermission.role_id == target_role.id)
                )
            ).all()
        )
        before_permissions = await rbac_service.effective_permissions(session, actor.id)
        initial_audits = await audit_count(session)
        users_read = (
            await session.exec(select(Permission).where(Permission.code == "users.read"))
        ).one()

        with pytest.raises(AppError, match="exceeding your own") as error:
            await rbac_service.update_role(
                session,
                target_role,
                RoleUpdate(permission_ids=[users_read.id]),
                actor.id,
                None,
            )

        assert error.value.status_code == 403
        after_edges = list(
            (
                await session.exec(
                    select(RolePermission).where(RolePermission.role_id == target_role.id)
                )
            ).all()
        )
        assert {(edge.role_id, edge.permission_id) for edge in after_edges} == {
            (edge.role_id, edge.permission_id) for edge in before_edges
        }
        assert await rbac_service.effective_permissions(session, actor.id) == before_permissions
        assert await audit_count(session) == initial_audits


async def test_actor_cannot_overgrant_a_non_admin_system_role():
    async with rbac_session() as session:
        actor, _, _, _, _, users_read = await create_rbac_state(session)
        actor_role = await create_role(session, "system-role-manager", ["roles.manage"])
        system_role = await create_role(session, "researcher", ["roles.manage"])
        system_role.is_system = True
        session.add(system_role)
        await assign_role(session, actor, actor_role)
        await session.commit()

        before_edges = {
            (edge.role_id, edge.permission_id)
            for edge in (
                await session.exec(
                    select(RolePermission).where(RolePermission.role_id == system_role.id)
                )
            ).all()
        }
        before_permissions = await rbac_service.effective_permissions(session, actor.id)
        initial_audits = await audit_count(session)

        with pytest.raises(AppError, match="exceeding your own") as error:
            await rbac_service.update_role(
                session,
                system_role,
                RoleUpdate(permission_ids=[users_read.id]),
                actor.id,
                None,
            )

        assert error.value.status_code == 403
        after_edges = {
            (edge.role_id, edge.permission_id)
            for edge in (
                await session.exec(
                    select(RolePermission).where(RolePermission.role_id == system_role.id)
                )
            ).all()
        }
        assert after_edges == before_edges
        assert await rbac_service.effective_permissions(session, actor.id) == before_permissions
        assert await audit_count(session) == initial_audits


async def test_actor_cannot_create_a_role_with_role_permissions():
    async with rbac_session() as session:
        actor, _, _, _, _, _ = await create_rbac_state(session)
        actor_role = await create_role(session, "creator", ["roles.manage"])
        await assign_role(session, actor, actor_role)
        await session.commit()

        before_permissions = await rbac_service.effective_permissions(session, actor.id)
        initial_audits = await audit_count(session)
        users_read = (
            await session.exec(select(Permission).where(Permission.code == "users.read"))
        ).one()

        with pytest.raises(AppError, match="exceeding your own") as error:
            await rbac_service.create_role(
                session,
                RoleCreate(name="escalated", permission_ids=[users_read.id]),
                actor.id,
                None,
            )

        assert error.value.status_code == 403
        assert (
            await session.exec(select(Role).where(Role.name == "escalated"))
        ).first() is None
        assert await rbac_service.effective_permissions(session, actor.id) == before_permissions
        assert await audit_count(session) == initial_audits


@pytest.mark.parametrize("target_kind", ["self", "another", "new"])
async def test_role_permission_escalation_is_rejected_at_the_api(client, target_kind):
    async with api_rbac_session() as session:
        actor, _, _, _, _, users_read = await create_rbac_state(session)
        manager_role = await create_role(
            session, f"api-{target_kind}-manager", ["roles.manage"]
        )
        await assign_role(session, actor, manager_role)

        target_role = None
        if target_kind == "self":
            target_role = manager_role
        elif target_kind == "another":
            target_role = await create_role(session, "api-another-target", ["roles.manage"])
            await assign_role(session, actor, target_role)
        await session.commit()

        actor_permissions = await rbac_service.effective_permissions(session, actor.id)
        initial_audits = await audit_count(session)
        before_edges = (
            {
                (edge.role_id, edge.permission_id)
                for edge in (
                    await session.exec(
                        select(RolePermission).where(RolePermission.role_id == target_role.id)
                    )
                ).all()
            }
            if target_role is not None
            else set()
        )

    async def override_current_principal() -> Principal:
        return Principal(
            user=actor,
            permissions=frozenset({"roles.manage"}),
            access_token="test",
        )

    app.dependency_overrides[get_current_principal] = override_current_principal
    permission_id = str(users_read.id)
    if target_role is None:
        response = await client.post(
            "/api/v1/rbac/roles",
            json={"name": "api-escalated", "permission_ids": [permission_id]},
        )
    else:
        response = await client.patch(
            f"/api/v1/rbac/roles/{target_role.id}",
            json={"permission_ids": [permission_id]},
        )

    assert response.status_code == 403

    async with api_rbac_session() as session:
        assert await rbac_service.effective_permissions(session, actor.id) == actor_permissions
        assert await audit_count(session) == initial_audits
        if target_role is None:
            assert (
                await session.exec(select(Role).where(Role.name == "api-escalated"))
            ).first() is None
        else:
            after_edges = {
                (edge.role_id, edge.permission_id)
                for edge in (
                    await session.exec(
                        select(RolePermission).where(RolePermission.role_id == target_role.id)
                    )
                ).all()
            }
            assert after_edges == before_edges


async def test_active_admin_can_assign_system_admin_role():
    async with rbac_session() as session:
        _, admin_user, target, admin_role, _, _ = await create_rbac_state(session)

        await rbac_service.set_user_roles(session, target, [admin_role.id], admin_user.id, None)

        assignments = await session.exec(select(UserRole).where(UserRole.user_id == target.id))
        assert [assignment.role_id for assignment in assignments.all()] == [admin_role.id]


async def test_duplicate_role_ids_create_one_assignment_and_one_audit_event():
    async with rbac_session() as session:
        _, admin_user, target, _, staff_role, _ = await create_rbac_state(session)
        initial_audits = await audit_count(session)

        await rbac_service.set_user_roles(
            session,
            target,
            [staff_role.id, staff_role.id],
            admin_user.id,
            None,
        )

        assignments = await session.exec(select(UserRole).where(UserRole.user_id == target.id))
        assert [assignment.role_id for assignment in assignments.all()] == [staff_role.id]
        assert await audit_count(session) == initial_audits + 1


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
