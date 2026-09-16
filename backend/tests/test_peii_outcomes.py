from datetime import timedelta
from uuid import uuid4

import pytest

from core.database import get_analytics_async_session
from main import app
from models.survey import Survey
from models.survey_question import SurveyQuestion
from models.survey_response import SurveyResponse
from models.survey_section import SurveySection
from services import survey_analytics_service as analytics
from services.base_service import utc_now

pytestmark = pytest.mark.anyio


async def test_outcomes_use_post_mapping_valid_answers_and_filtered_stream(client):
    generator = app.dependency_overrides[get_analytics_async_session]()
    session = await anext(generator)
    try:
        survey = Survey(
            survey_id=f"SURV-{uuid4().hex[:8]}",
            title="GRADUATE TRACER STUDY SURVEY",
            status="Active",
        )
        session.add(survey)
        await session.flush()
        profile = SurveySection(survey_id=survey.id, title="RESPONDENT'S PROFILE")
        pre = SurveySection(
            survey_id=survey.id, title="II-A A. Employability and Economic Mobility", order_index=1
        )
        post = SurveySection(
            survey_id=survey.id, title="II-B A. Employability and Economic Mobility", order_index=2
        )
        session.add_all([profile, pre, post])
        await session.flush()
        question_index = 0

        def question(section, text, kind="scale"):
            nonlocal question_index
            question_index += 1
            return SurveyQuestion(
                survey_id=survey.id,
                section_id=section.id,
                question_text=text,
                question_type=kind,
                order_index=question_index,
                config={"min": 1, "max": 5},
            )

        year = question(profile, "Year Graduated", "text")
        degree = question(profile, "Degree Program", "text")
        before = question(pre, "I have a stable source of income or employment")
        after = question(post, "I have a stable source of income or employment")
        aligned = question(post, "My job is aligned with my college degree or skills")
        session.add_all([year, degree, before, after, aligned])
        await session.flush()
        answers = {
            str(year.id): "2024",
            str(degree.id): "Bachelor of Science in Computer Science",
            str(before.id): 1,
            str(after.id): 5,
            str(aligned.id): 4,
        }
        session.add(SurveyResponse(survey_id=survey.id, answers=answers))
        invalid_answers: list[object] = [None, True, "5", 9, [], {}]
        for invalid in invalid_answers:
            session.add(
                SurveyResponse(survey_id=survey.id, answers={**answers, str(after.id): invalid})
            )
        session.add_all(
            [
                SurveyResponse(survey_id=survey.id, answers=answers, is_deleted=True),
                SurveyResponse(
                    survey_id=survey.id,
                    answers=answers,
                    retention_expires_at=utc_now() - timedelta(days=1),
                ),
                SurveyResponse(survey_id=survey.id, answers={**answers, str(year.id): ""}),
                SurveyResponse(survey_id=survey.id, answers={**answers, str(year.id): "2023"}),
                SurveyResponse(survey_id=survey.id, answers={**answers, str(degree.id): "Other"}),
            ]
        )
        await session.commit()
        result = await analytics.compute_peii_scores(
            session,
            survey_ids=[survey.id],
            batch_year="2024",
            degree="Bachelor of Science in Computer Science",
        )
        outcome = result.outcome_distributions.employment_stability
        assert outcome is not None
        assert outcome.question_id == after.id
        assert outcome.total == 1
        assert sum(c.count for c in outcome.cells) == 1
        assert result.outcome_distributions.degree_alignment is not None
        assert result.outcome_distributions.degree_alignment.total == 7
        assert result.demographics is not None
        assert result.demographics.total_responses == 7
        for value in [None, "", "All Degrees"]:
            unfiltered = await analytics.compute_peii_scores(
                session, survey_ids=[survey.id], degree=value
            )
            assert unfiltered.demographics is not None
            assert unfiltered.demographics.total_responses == 9
        for filters, expected in [
            ({"department": "College of Computer Studies"}, 8),
            ({"department": "College of Nursing"}, 0),
            ({"batch_year": "2023"}, 1),
            ({"batch_year": "2099"}, 0),
        ]:
            filtered = await analytics.compute_peii_scores(
                session,
                survey_ids=[survey.id],
                batch_year=filters.get("batch_year"),
                department=filters.get("department"),
            )
            assert filtered.demographics is not None
            assert filtered.demographics.total_responses == expected
            assert filtered.outcome_distributions.degree_alignment is not None
            assert filtered.outcome_distributions.degree_alignment.total == expected
        second_survey = Survey(
            survey_id=f"SURV-{uuid4().hex[:8]}",
            title="GRADUATE TRACER STUDY SURVEY",
            status="Active",
        )
        session.add(second_survey)
        await session.commit()
        cross_survey = await analytics.compute_peii_scores(
            session, survey_ids=[survey.id, second_survey.id]
        )
        assert cross_survey.outcome_distributions.employment_stability is None
        assert cross_survey.outcome_distributions.degree_alignment is None
        # A missing selected POST question never falls back to the identically named PRE item.
        after.is_deleted = True
        session.add(after)
        await session.commit()
        missing = await analytics.compute_peii_scores(session, survey_ids=[survey.id])
        assert missing.outcome_distributions.employment_stability is None
        for field, state_value in [
            ("status", "Inactive"),
            ("status", "Closed"),
            ("title", "Different questionnaire"),
            ("is_deleted", True),
        ]:
            survey.status = "Active"
            survey.title = "GRADUATE TRACER STUDY SURVEY"
            survey.is_deleted = False
            setattr(survey, field, state_value)
            session.add(survey)
            await session.commit()
            excluded = await analytics.compute_peii_scores(session, survey_ids=[survey.id])
            assert excluded.outcome_distributions.employment_stability is None
            assert excluded.outcome_distributions.degree_alignment is None
            assert excluded.cohort_result.domains == []
    finally:
        await generator.aclose()


async def test_peii_sentinel_filters_share_versioned_cache_and_invalidate(client, monkeypatch):
    from core.analytics_cache import invalidate_survey_analytics
    from core.cache import build_cache_key
    from core.config import settings
    from routers import survey_analytics as router
    from schemas.peii import PEIIAnalyticsResponse, PEIICohortResult

    monkeypatch.setattr(settings, "ANALYTICS_CACHE_TTL_SECONDS", 60)
    survey_id = uuid4()
    calls = []
    keys = []

    async def compute(session, **kwargs):
        calls.append(kwargs)
        return PEIIAnalyticsResponse(
            cohort_result=PEIICohortResult(batch_year="All Batches", domains=[], peii_score=0),
            qualitative_feedback_total=0,
            qualitative_feedback_truncated=False,
        )

    async def get(namespace, key):
        keys.append((namespace, key))
        return None

    async def put(*args):
        pass

    monkeypatch.setattr(analytics, "compute_peii_scores", compute)
    monkeypatch.setattr(router, "cache_get", get)
    monkeypatch.setattr(router, "cache_set", put)
    url = f"/api/v1/surveys/{survey_id}/responses/peii"
    for params in [
        {},
        {"batch": "", "department": "", "degree": ""},
        {"batch": "All Batches", "department": "All Departments", "degree": "All Degrees"},
    ]:
        response = await client.get(url, params=params)
        assert response.status_code == 200
        assert response.json()["data"]["outcome_distributions"] == {
            "employment_stability": None,
            "degree_alignment": None,
            "monthly_income": None,
            "time_to_first_job": None,
            "job_search_channel": None,
            "employment_status": None,
            "employment_type": None,
            "job_level": None,
            "job_search_difficulty": None,
            "work_location": None,
            "top_industries": None,
        }
    assert len(calls) == 1
    assert calls[0]["batch_year"] is None
    assert calls[0]["department"] is None
    assert calls[0]["degree"] is None
    assert keys == [("peii", build_cache_key(survey_id, "outcomes-v1", "", "", ""))]
    invalidate_survey_analytics(survey_id)
    assert (await client.get(url)).status_code == 200
    assert len(calls) == 2
