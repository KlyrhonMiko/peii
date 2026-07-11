"""
Seed the "Alumni Survey Questionnaire" — a structured survey with 4 thematic
sections covering employment outcomes, degree-to-career alignment, socioeconomic
impact, and personal growth.

Usage:
    cd backend
    ./.venv/bin/python scripts/seed_alumni_questionnaire.py
"""

import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlmodel import SQLModel, col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from core.config import settings
from core.database import async_session_factory
from core.database import engine as sync_engine
from models.question_type import QuestionType
from models.survey import Survey as SurveyModel
from models.survey_question import SurveyQuestion as SurveyQuestionModel
from models.survey_section import SurveySection as SurveySectionModel
from services.audit_service import record_audit
from utils.identifiers import generate_business_id

SECTIONS: list[dict] = [
    {
        "title": "Employment Outcomes",
        "description": "Tell us about your current employment and career"
        " situation since graduating.",
        "questions": [
            {
                "type": QuestionType.SINGLE_CHOICE,
                "text": "What is your current employment status?",
                "options": [
                    "Full-time",
                    "Part-time",
                    "Self-employed",
                    "Freelance / Contract",
                    "Pursuing further studies",
                    "Unemployed",
                ],
            },
            {
                "type": QuestionType.SINGLE_CHOICE,
                "text": "How long did it take you to obtain your first job"
                " after graduation?",
                "options": [
                    "Before graduation",
                    "Less than 3 months",
                    "3\u20136 months",
                    "6\u201312 months",
                    "More than 1 year",
                ],
            },
            {
                "type": QuestionType.SINGLE_CHOICE,
                "text": "What is your current monthly income range?",
                "options": [
                    "No current income",
                    "Less than \u20b120,000",
                    "\u20b120,000\u2013\u20b139,999",
                    "\u20b140,000\u2013\u20b159,999",
                    "\u20b160,000\u2013\u20b179,999",
                    "\u20b180,000 or above",
                    "Prefer not to answer",
                ],
            },
            {
                "type": QuestionType.SINGLE_CHOICE,
                "text": "Which industry or sector do you currently work in?",
                "options": [
                    "Information and Communications Technology (ICT)",
                    "Education",
                    "Government / Public Administration",
                    "Healthcare and Social Services",
                    "Banking, Finance, and Insurance",
                    "Professional and Business Services",
                    "Manufacturing",
                    "Retail and Wholesale Trade",
                    "Hospitality, Tourism, and Food Services",
                    "Construction and Engineering",
                    "Transportation and Logistics",
                    "Agriculture, Forestry, and Fisheries",
                    "Media, Arts, and Entertainment",
                    "Other",
                    "Not currently employed",
                ],
            },
            {
                "type": QuestionType.TEXT,
                "text": "Optional: Please briefly describe any challenges or"
                " experiences encountered while seeking employment after"
                " graduation.",
                "options": None,
            },
        ],
    },
    {
        "title": "Degree-to-Career Alignment & Institutional Factors",
        "description": "Help us understand how well your degree aligns with"
        " your career path.",
        "questions": [
            {
                "type": QuestionType.SCALE,
                "text": "How related is your current employment to your degree"
                " program?",
                "options": [
                    "Not applicable",
                    "Not related",
                    "Slightly related",
                    "Moderately related",
                    "Highly related",
                ],
                "config": {
                    "min": 1,
                    "max": 5,
                    "min_label": "Not applicable",
                    "max_label": "Highly related",
                },
            },
            {
                "type": QuestionType.SCALE,
                "text": "To what extent did your internship/OJT prepare you for"
                " employment?",
                "options": [
                    "Not helpful",
                    "Slightly helpful",
                    "Helpful",
                    "Very helpful",
                ],
                "config": {
                    "min": 1,
                    "max": 4,
                    "min_label": "Not helpful",
                    "max_label": "Very helpful",
                },
            },
            {
                "type": QuestionType.MULTIPLE_CHOICE,
                "text": "Which skills acquired during your university studies"
                " do you regularly utilize in your current work? (Select all"
                " that apply)",
                "options": [
                    "Technical Skills",
                    "Communication",
                    "Critical Thinking",
                    "Teamwork",
                    "Leadership",
                    "Problem Solving",
                    "Research",
                    "Digital Literacy",
                    "Other",
                ],
            },
            {
                "type": QuestionType.TEXT,
                "text": "Optional: Please note any specific subjects, skills,"
                " or experiences that have proven particularly beneficial or"
                " ineffective in your career.",
                "options": None,
            },
        ],
    },
    {
        "title": "Socioeconomic Impact",
        "description": "Share how your education has affected your financial and daily life.",
        "questions": [
            {
                "type": QuestionType.SINGLE_CHOICE,
                "text": "How would you describe your financial stability"
                " progression since graduation?",
                "options": [
                    "Significant positive progression",
                    "Steady, gradual progression",
                    "Stabilizing / No major changes yet",
                    "Experiencing financial setbacks",
                ],
            },
            {
                "type": QuestionType.SINGLE_CHOICE,
                "text": "Which of the following best describes your current financial stage?",
                "options": [
                    "Primary financial provider for my family / household",
                    "Covering my own expenses and actively contributing to family expenses",
                    "Covering my own living expenses",
                    "Currently working toward personal financial independence",
                    "Prefer not to answer",
                ],
            },
            {
                "type": QuestionType.SINGLE_CHOICE,
                "text": "How would you characterize your current income"
                " capacity regarding daily expenses?",
                "options": [
                    "Covers basic needs with room for savings or investments",
                    "Covers basic needs with limited disposable income",
                    "Strictly covers essential needs",
                    "Currently insufficient to cover all basic needs",
                    "Prefer not to answer",
                ],
            },
            {
                "type": QuestionType.SINGLE_CHOICE,
                "text": "What is your primary mode of transportation for work"
                " or daily activities?",
                "options": [
                    "Personal vehicle (car)",
                    "Personal motorcycle",
                    "Public transportation (e.g., jeepney, bus, MRT/LRT, UV Express)",
                    "Ride-hailing services (e.g., Grab, Angkas)",
                    "I walk or cycle",
                    "Not applicable (Work from home or remote)",
                ],
            },
            {
                "type": QuestionType.TEXT,
                "text": "Optional: If your lifestyle has changed since"
                " graduation, please briefly describe the most significant"
                " shift.",
                "options": None,
            },
        ],
    },
    {
        "title": "Personal Growth & Educational Effectiveness",
        "description": "Reflect on how the university experience shaped your"
        " personal and professional life.",
        "questions": [
            {
                "type": QuestionType.SCALE,
                "text": "How has your overall quality of life changed since graduation?",
                "options": [
                    "Much worse",
                    "Worse",
                    "No change",
                    "Better",
                    "Much better",
                ],
                "config": {
                    "min": 1,
                    "max": 5,
                    "min_label": "Much worse",
                    "max_label": "Much better",
                },
            },
            {
                "type": QuestionType.SCALE,
                "text": "My university education adequately prepared me for"
                " professional employment.",
                "options": [
                    "Strongly disagree",
                    "Disagree",
                    "Agree",
                    "Strongly agree",
                ],
                "config": {
                    "min": 1,
                    "max": 4,
                    "min_label": "Strongly disagree",
                    "max_label": "Strongly agree",
                },
            },
            {
                "type": QuestionType.SCALE,
                "text": "The curriculum developed skills directly applicable to my career.",
                "options": [
                    "Strongly disagree",
                    "Disagree",
                    "Agree",
                    "Strongly agree",
                ],
                "config": {
                    "min": 1,
                    "max": 4,
                    "min_label": "Strongly disagree",
                    "max_label": "Strongly agree",
                },
            },
            {
                "type": QuestionType.SCALE,
                "text": "Overall, my university education has had a positive"
                " impact on my life after graduation.",
                "options": [
                    "Strongly disagree",
                    "Disagree",
                    "Agree",
                    "Strongly agree",
                ],
                "config": {
                    "min": 1,
                    "max": 4,
                    "min_label": "Strongly disagree",
                    "max_label": "Strongly agree",
                },
            },
            {
                "type": QuestionType.SCALE,
                "text": "The faculty provided effective mentoring and support during my studies.",
                "options": [
                    "Strongly disagree",
                    "Disagree",
                    "Agree",
                    "Strongly agree",
                ],
                "config": {
                    "min": 1,
                    "max": 4,
                    "min_label": "Strongly disagree",
                    "max_label": "Strongly agree",
                },
            },
            {
                "type": QuestionType.SCALE,
                "text": "My involvement in student organizations contributed to"
                " my professional development.",
                "options": [
                    "Strongly disagree",
                    "Disagree",
                    "Agree",
                    "Strongly agree",
                    "Not applicable",
                ],
                "config": {
                    "min": 1,
                    "max": 5,
                    "min_label": "Strongly disagree",
                    "max_label": "Not applicable",
                },
            },
            {
                "type": QuestionType.SCALE,
                "text": "Overall, how satisfied are you with the quality of"
                " your university education?",
                "options": [
                    "Very dissatisfied",
                    "Dissatisfied",
                    "Satisfied",
                    "Very satisfied",
                ],
                "config": {
                    "min": 1,
                    "max": 4,
                    "min_label": "Very dissatisfied",
                    "max_label": "Very satisfied",
                },
            },
            {
                "type": QuestionType.TEXT,
                "text": "Optional: What is one specific improvement the"
                " university could implement to better prepare future"
                " graduates?",
                "options": None,
            },
        ],
    },
]


def _create_tables() -> None:
    SQLModel.metadata.create_all(sync_engine)


async def _seed(session: AsyncSession) -> SurveyModel:
    title = "Alumni Survey Questionnaire"
    description = (
        "This comprehensive survey helps us understand your post-graduation "
        "journey \u2014 from employment outcomes and degree-to-career alignment "
        "to socioeconomic impact and personal growth. Your responses directly "
        "shape how we improve the institution for future cohorts."
    )

    survey_id = generate_business_id("SURV")

    survey = SurveyModel(
        survey_id=survey_id,
        title=title,
        description=description,
        status="Active",
        target_cohort="All Alumni",
    )
    session.add(survey)

    sections = []
    for sec_idx, sec_spec in enumerate(SECTIONS):
        section = SurveySectionModel(
            survey_id=survey.id,
            title=sec_spec["title"],
            description=sec_spec["description"],
            order_index=sec_idx,
        )
        session.add(section)
        sections.append((section, sec_spec["questions"]))

    await session.flush()

    for section, questions in sections:
        for q_idx, spec in enumerate(questions):
            options_str = json.dumps(spec["options"]) if spec["options"] else None
            config_str = json.dumps(spec["config"]) if spec.get("config") else None
            question = SurveyQuestionModel(
                survey_id=survey.id,
                section_id=section.id,
                question_text=spec["text"],
                question_type=spec["type"],
                options=options_str,
                config=config_str,
                order_index=q_idx,
            )
            session.add(question)

    await session.commit()
    await session.refresh(survey)
    await record_audit(
        session, action="create", resource_type="survey", resource_id=str(survey.id)
    )
    return survey


async def _get_seeded_data(
    survey: SurveyModel,
) -> list[dict]:
    async with async_session_factory() as session:
        sections_result = await session.exec(
            select(SurveySectionModel)
            .where(col(SurveySectionModel.survey_id) == survey.id)
            .order_by(col(SurveySectionModel.order_index))
        )
        rows = []
        for sec in list(sections_result.all()):
            q_result = await session.exec(
                select(SurveyQuestionModel)
                .where(col(SurveyQuestionModel.section_id) == sec.id)
                .order_by(col(SurveyQuestionModel.order_index))
            )
            raw_qs = list(q_result.all())
            questions = []
            for q in raw_qs:
                opts: list[str] = []
                if q.options:
                    try:
                        opts = json.loads(q.options)
                    except (json.JSONDecodeError, TypeError):
                        pass
                questions.append({
                    "order": q.order_index + 1,
                    "type": str(q.question_type),
                    "text": q.question_text,
                    "options": opts,
                })
            rows.append({
                "order": sec.order_index + 1,
                "title": sec.title,
                "description": sec.description,
                "questions": questions,
            })
        return rows


def _fmt(val: object) -> str:
    if isinstance(val, str) and len(val) > 60:
        return val[:57] + "..."
    return str(val) if val is not None else "\u2014"


async def main() -> None:
    print(f"DB: {settings.database_url}\n")
    _create_tables()

    async with async_session_factory() as session:
        survey = await _seed(session)

    print(f"Survey: {survey.title}")
    print(f"  ID:        {survey.survey_id}")
    print(f"  Status:    {survey.status}")
    print(f"  Cohort:    {survey.target_cohort}")
    print()

    rows = await _get_seeded_data(survey)

    total_questions = 0
    for sec in rows:
        total_questions += len(sec["questions"])

    print(f"Sections ({len(rows)}):")
    print()
    for sec in rows:
        print(f"  [{sec['order']}] {sec['title']}")
        print(f"      {sec['description']}")
        for q in sec["questions"]:
            print(f"      [{q['order']}] {q['type']}")
            print(f"          {q['text']}")
            for opt in q["options"]:
                print(f"          \u00b7 {_fmt(opt)}")
        print()

    print(
        f"\u2713 Created survey {survey.survey_id} with {len(rows)} sections"
        f" and {total_questions} questions."
    )


if __name__ == "__main__":
    asyncio.run(main())
