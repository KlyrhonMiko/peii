import asyncio
from uuid import uuid4

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlmodel.ext.asyncio.session import AsyncSession

from schemas.alumni_count import AlumniCountReplace
from services import alumni_count_service as alumni
from services.audit_service import commit_with_audit
from tests.integration.fixtures import assert_current_schema
from tests.integration.test_survey_lifecycle_concurrency import ACTOR_ID, _populate_active_survey

pytestmark = [pytest.mark.integration, pytest.mark.anyio]

BSIT = "Bachelor of Science in Information Technology"
BSCS = "Bachelor of Science in Computer Science"
BSN = "Bachelor of Science in Nursing"


def _payload(degree, total):
    return AlumniCountReplace.model_validate(
        {"counts": [{"batch_year": "2025", "degree_program": degree, "total": total}]}
    )


@pytest.mark.parametrize("initial_degree,second_degree", [(None, BSCS), (None, BSIT), (BSN, BSCS)])
async def test_overlapping_replacements_preserve_one_full_set_and_exact_audit_chain(
    postgres_database, monkeypatch, initial_degree, second_degree
):
    _populate_active_survey(postgres_database)
    engine = create_async_engine(
        postgres_database.url.set(drivername="postgresql+asyncpg"),
        connect_args={
            "server_settings": {"search_path": postgres_database.schema},
            "statement_cache_size": 0,
            "prepared_statement_cache_size": 0,
        },
    )
    sessions = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    first_ready = asyncio.Event()
    release_first = asyncio.Event()
    first_session = None

    async def paused_commit(session, events):
        # Coordinate real service transactions at their commit boundary; retain all SQL,
        # PostgreSQL locks, and the actual domain/audit commit.
        if session is first_session:
            first_ready.set()
            await release_first.wait()
        await commit_with_audit(session, events)

    try:
        if initial_degree is not None:
            async with sessions() as setup:
                await alumni.replace_alumni_counts(
                    setup, _payload(initial_degree, 70), ACTOR_ID, None
                )
        monkeypatch.setattr(alumni, "commit_with_audit", paused_commit)
        async with sessions() as first, sessions() as second:
            first_session = first
            second_pid = (await second.execute(text("SELECT pg_backend_pid()"))).scalar_one()
            first_task = asyncio.create_task(
                alumni.replace_alumni_counts(first, _payload(BSIT, 100), ACTOR_ID, None)
            )
            await asyncio.wait_for(first_ready.wait(), timeout=5)
            second_task = asyncio.create_task(
                alumni.replace_alumni_counts(second, _payload(second_degree, 80), ACTOR_ID, None)
            )

            async def reach_competing_boundary():
                while not second_task.done():
                    with postgres_database.engine.connect() as observer:
                        waiting = observer.execute(
                            text("SELECT wait_event_type FROM pg_stat_activity WHERE pid = :pid"),
                            {"pid": second_pid},
                        ).scalar_one_or_none()
                    if waiting == "Lock":
                        return
                    await asyncio.sleep(0.01)

            try:
                await asyncio.wait_for(reach_competing_boundary(), timeout=5)
            finally:
                release_first.set()
            results = await asyncio.wait_for(
                asyncio.gather(first_task, second_task, return_exceptions=True), timeout=10
            )
            assert not any(isinstance(result, Exception) for result in results), results
    finally:
        release_first.set()
        await engine.dispose()

    with postgres_database.engine.connect() as connection:
        assert_current_schema(connection, postgres_database.schema)
        active = connection.execute(
            text("SELECT degree_program, total FROM alumni_counts WHERE is_deleted = false")
        ).all()
        audits = connection.execute(
            text(
                "SELECT changes FROM audit_logs WHERE resource_type = 'alumni_counts' "
                "ORDER BY created_at, id"
            )
        ).scalars().all()
    assert active == [(second_degree, 80)]
    first_state = {f"2025|{BSIT}": 100}
    second_state = {f"2025|{second_degree}": 80}
    initial_state = {f"2025|{initial_degree}": 70} if initial_degree is not None else {}
    assert audits[-2:] == [
        {"before": initial_state, "after": first_state},
        {"before": first_state, "after": second_state},
    ]


async def test_failed_audit_rolls_back_replacement_and_releases_its_lock(postgres_database):
    _populate_active_survey(postgres_database)
    engine = create_async_engine(
        postgres_database.url.set(drivername="postgresql+asyncpg"),
        connect_args={"server_settings": {"search_path": postgres_database.schema}},
    )
    sessions = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    function = f"reject_audit_{uuid4().hex}"
    try:
        async with sessions() as session:
            await alumni.replace_alumni_counts(session, _payload(BSIT, 100), ACTOR_ID, None)
        with postgres_database.engine.begin() as connection:
            connection.execute(text(
                f"CREATE FUNCTION {function}() RETURNS trigger LANGUAGE plpgsql AS $$ "
                "BEGIN RAISE EXCEPTION 'test audit failure'; END; $$"
            ))
            connection.execute(text(
                f"CREATE TRIGGER reject_alumni_audit BEFORE INSERT ON audit_logs "
                f"FOR EACH ROW EXECUTE FUNCTION {function}()"
            ))
        async with sessions() as session:
            with pytest.raises(Exception, match="test audit failure"):
                await alumni.replace_alumni_counts(session, _payload(BSCS, 80), ACTOR_ID, None)
        with postgres_database.engine.begin() as connection:
            assert connection.execute(text(
                "SELECT degree_program, total FROM alumni_counts WHERE is_deleted = false"
            )).all() == [(BSIT, 100)]
            assert connection.execute(text(
                "SELECT count(*) FROM audit_logs WHERE resource_type = 'alumni_counts'"
            )).scalar_one() == 1
            connection.execute(text("DROP TRIGGER reject_alumni_audit ON audit_logs"))
        async with sessions() as session:
            await asyncio.wait_for(
                alumni.replace_alumni_counts(session, _payload(BSCS, 80), ACTOR_ID, None),
                timeout=5,
            )
    finally:
        await engine.dispose()
