import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, select
from sqlmodel.ext.asyncio.session import AsyncSession

from models.audit_log import AuditLog
from models.survey import Survey
from scripts.update_canonical_survey_notice import (
    CANONICAL_SURVEY_TITLE,
    LEGACY_DATA_PRIVACY_BLOCK,
    remove_legacy_privacy_notice,
    update_canonical_survey_notices,
)

pytestmark = pytest.mark.anyio


def test_notice_removal_requires_the_exact_legacy_paragraph() -> None:
    description = f"Purpose\n\n{LEGACY_DATA_PRIVACY_BLOCK}\n\nRequired fields"
    assert remove_legacy_privacy_notice(description) == "Purpose\n\nRequired fields"
    assert remove_legacy_privacy_notice("A different notice") == "A different notice"


async def test_notice_update_is_dry_run_first_idempotent_and_audited() -> None:
    engine = create_async_engine(
        "sqlite+aiosqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as connection:
        await connection.run_sync(SQLModel.metadata.create_all)
    sessions = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    legacy_description = f"Purpose\n\n{LEGACY_DATA_PRIVACY_BLOCK}\n\nRequired fields"
    async with sessions() as session:
        survey = Survey(
            survey_id="SURV-NOTICE",
            title=CANONICAL_SURVEY_TITLE,
            description=legacy_description,
        )
        session.add(survey)
        await session.commit()

        assert await update_canonical_survey_notices(session, confirm=False) == 1
        assert survey.description == legacy_description
        assert (await session.exec(select(AuditLog))).all() == []

        assert await update_canonical_survey_notices(session, confirm=True) == 1
        assert survey.description == "Purpose\n\nRequired fields"
        audits = list((await session.exec(select(AuditLog))).all())
        assert len(audits) == 1
        assert audits[0].action == "privacy_notice_corrected"

        assert await update_canonical_survey_notices(session, confirm=True) == 0
        assert len((await session.exec(select(AuditLog))).all()) == 1

    await engine.dispose()
