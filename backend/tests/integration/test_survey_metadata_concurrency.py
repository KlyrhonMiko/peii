import asyncio

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlmodel.ext.asyncio.session import AsyncSession

from models.survey import Survey
from schemas.survey import SurveyUpdate
from services.response_service import submit_response
from services.survey_service import get_survey, update_survey
from tests.integration.test_survey_lifecycle_concurrency import (
    ACTOR_ID,
    QUESTION_ID,
    SURVEY_BUSINESS_ID,
    SURVEY_ID,
    _assert_async_current_schema,
    _populate_active_survey,
)

pytestmark = [pytest.mark.integration, pytest.mark.anyio]


@pytest.mark.parametrize("response_first", [True, False])
async def test_first_response_and_metadata_edit_serialize(postgres_database, response_first):
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

    async def submit(session):
        return await submit_response(
            session, SURVEY_BUSINESS_ID, {str(QUESTION_ID): "yes"}, ACTOR_ID
        )

    async def edit(session):
        try:
            return await update_survey(
                session, SURVEY_BUSINESS_ID, SurveyUpdate(title="Edited title"), ACTOR_ID
            )
        except Exception as exc:
            return exc

    try:
        async with sessions() as first, sessions() as second:
            await _assert_async_current_schema(first, postgres_database.schema)
            await _assert_async_current_schema(second, postgres_database.schema)
            await get_survey(first, SURVEY_BUSINESS_ID, for_update=True)
            competing = asyncio.create_task(edit(second) if response_first else submit(second))
            with pytest.raises(TimeoutError):
                await asyncio.wait_for(asyncio.shield(competing), timeout=0.1)
            if response_first:
                await submit(first)
                outcomes = await asyncio.wait_for(
                    asyncio.gather(competing, return_exceptions=True), timeout=5
                )
                error = outcomes[0]
                assert getattr(error, "status_code", None) == 409
                assert getattr(error, "errors", None) == {"code": "survey_content_conflict"}
                await second.rollback()
            else:
                assert not isinstance(await edit(first), Exception)
                response, _ = await asyncio.wait_for(competing, timeout=5)
                assert response.survey_id == SURVEY_ID
            await first.rollback()
            survey = await first.get(Survey, SURVEY_ID, populate_existing=True)
            assert survey is not None
            assert survey.title == ("Concurrent survey" if response_first else "Edited title")
            assert survey.responses_count == 1
    finally:
        await engine.dispose()
