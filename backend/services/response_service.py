import json
from uuid import UUID

from sqlalchemy import func
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from models.survey import Survey
from models.survey_response import SurveyResponse
from schemas.survey_response import SurveyResponseListQueryParams
from services.audit_service import record_audit
from services.distribution_service import get_distribution_by_token
from utils.sorting import stable_order_by


async def submit_response(
    session: AsyncSession,
    token: str,
    answers: dict,
    ip_address: str | None = None,
) -> SurveyResponse:
    distribution = await get_distribution_by_token(session, token)

    answers_json = json.dumps(answers)
    response = SurveyResponse(
        survey_id=distribution.survey_id,
        distribution_id=distribution.id,
        alumni_token=token,
        answers=answers_json,
    )
    session.add(response)

    survey_result = await session.exec(
        select(Survey).where(col(Survey.id) == distribution.survey_id)
    )
    survey = survey_result.first()
    if survey:
        survey.responses_count = (survey.responses_count or 0) + 1
        session.add(survey)

    await session.commit()
    await session.refresh(response)
    await record_audit(
        session,
        action="create",
        resource_type="survey_response",
        resource_id=str(response.id),
        ip_address=ip_address,
    )
    return response


async def list_responses(
    session: AsyncSession,
    survey_id: UUID,
    params: SurveyResponseListQueryParams,
) -> tuple[list[SurveyResponse], int]:
    statement = select(SurveyResponse).where(col(SurveyResponse.survey_id) == survey_id)

    total_statement = (
        select(func.count())
        .select_from(SurveyResponse)
        .where(col(SurveyResponse.survey_id) == survey_id)
    )
    total_result = await session.exec(total_statement)
    total = total_result.one()

    sort_columns = {
        "created_at": SurveyResponse.created_at,
    }
    sort_column = sort_columns.get(params.sort_by, SurveyResponse.created_at)
    statement = stable_order_by(
        statement,
        sort_column,
        sort_order=params.sort_order,
        id_column=SurveyResponse.id,
    )
    statement = statement.offset(params.offset).limit(params.limit)
    result = await session.exec(statement)
    rows = list(result.all())
    return rows, total
