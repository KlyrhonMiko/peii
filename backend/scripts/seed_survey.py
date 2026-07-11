"""
Seed a development survey with sections covering employment, educational
effectiveness, career development, and overall satisfaction.

Each section groups questions around a theme, demonstrating the section-based
survey structure.

Usage:
    cd backend
    ./.venv/bin/python scripts/seed_survey.py
"""

import asyncio
import json
import sys
from pathlib import Path

# Ensure the backend directory is on sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlmodel import SQLModel, select
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

SAMPLE_SECTIONS: list[dict] = [
    {
        "title": "Employment Outcomes",
        "description": (
            "Tell us about your current employment and career"
            " situation since graduating."
        ),
        "questions": [
            {
                "type": QuestionType.SINGLE_CHOICE,
                "text": "What is your current employment status?",
                "options": [
                    "Employed Full-Time",
                    "Employed Part-Time",
                    "Self-Employed / Freelance",
                    "Unemployed — looking",
                    "Unemployed — not looking",
                    "Student",
                    "Retired",
                ],
            },
            {
                "type": QuestionType.MULTIPLE_CHOICE,
                "text": (
                    "Which of the following benefits does your current employer provide?"
                    " (Select all that apply)"
                ),
                "options": [
                    "Health insurance",
                    "Retirement / 401(k) matching",
                    "Paid parental leave",
                    "Tuition reimbursement",
                    "Stock options / equity",
                    "Remote / hybrid work options",
                    "Professional development budget",
                ],
            },
            {
                "type": QuestionType.NUMBER,
                "text": "How many years of professional experience do you have since graduation?",
                "options": None,
            },
        ],
    },
    {
        "title": "Educational Effectiveness",
        "description": "Help us understand how well the program prepared you for your career.",
        "questions": [
            {
                "type": QuestionType.TEXT,
                "text": (
                    "What skills or knowledge from your degree do you use most frequently"
                    " in your current role?"
                ),
                "options": None,
            },
            {
                "type": QuestionType.MATRIX,
                "text": (
                    "Rate your proficiency in each of the following areas before"
                    " and after the program."
                ),
                "options": [
                    "Critical thinking & problem-solving",
                    "Written communication",
                    "Data analysis & interpretation",
                    "Team collaboration",
                    "Technical / discipline-specific skills",
                ],
            },
            {
                "type": QuestionType.SCALE,
                "text": (
                    "On a scale of 1 to 5, how satisfied are you with the career guidance"
                    " you received as a student?"
                ),
                "options": None,
            },
        ],
    },
    {
        "title": "Career Development",
        "description": "Share your career journey and factors that influenced your decisions.",
        "questions": [
            {
                "type": QuestionType.RANKING,
                "text": (
                    "Rank the following factors in order of importance when you chose"
                    " your current job (1 = most important)."
                ),
                "options": [
                    "Salary and compensation",
                    "Work-life balance",
                    "Career growth opportunities",
                    "Company culture / values",
                    "Location / commute",
                ],
            },
            {
                "type": QuestionType.DATETIME,
                "text": "What date did you receive your first job offer after graduation?",
                "options": None,
            },
        ],
    },
    {
        "title": "Overall Satisfaction",
        "description": "A few final questions about your overall experience.",
        "questions": [
            {
                "type": QuestionType.BOOLEAN,
                "text": "Would you recommend this program to a prospective student?",
                "options": None,
            },
            {
                "type": QuestionType.FILE,
                "text": (
                    "Please upload your current CV / résumé so we can keep our alumni"
                    " profile up to date."
                ),
                "options": None,
            },
        ],
    },
]

SAMPLE_QUESTIONS: list[dict] = [
    q for sec in SAMPLE_SECTIONS for q in sec["questions"]
]


def _create_tables() -> None:
    SQLModel.metadata.create_all(sync_engine)


async def _seed(session: AsyncSession) -> SurveyModel:
    title = "Alumni Outcomes & Program Feedback Survey"
    description = (
        "This comprehensive survey helps us understand your post-graduation "
        "journey — from employment and skills to overall satisfaction. "
        "Your responses directly shape how we improve the program for future cohorts."
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
    for sec_idx, sec_spec in enumerate(SAMPLE_SECTIONS):
        section = SurveySectionModel(
            survey_id=survey.id,
            title=sec_spec["title"],
            description=sec_spec["description"],
            order_index=sec_idx,
        )
        session.add(section)
        sections.append((section, sec_spec["questions"]))

    # Flush to database so that sections are inserted and their primary keys exist
    # in the database before inserting the questions that reference them.
    await session.flush()

    for section, questions in sections:
        for q_idx, spec in enumerate(questions):
            options_str = json.dumps(spec["options"]) if spec["options"] else None
            question = SurveyQuestionModel(
                survey_id=survey.id,
                section_id=section.id,
                question_text=spec["text"],
                question_type=spec["type"],
                options=options_str,
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
    """Return structured data for display, grouped by section."""
    async with async_session_factory() as session:
        sections_result = await session.exec(
            select(SurveySectionModel)
            .where(SurveySectionModel.survey_id == survey.id)
            .order_by(SurveySectionModel.order_index)  # type: ignore[arg-type]
        )
        rows = []
        for sec in list(sections_result.all()):
            q_result = await session.exec(
                select(SurveyQuestionModel)
                .where(SurveyQuestionModel.section_id == sec.id)
                .order_by(SurveyQuestionModel.order_index)  # type: ignore[arg-type]
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
    return str(val) if val is not None else "—"


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
                print(f"          · {_fmt(opt)}")
        print()

    print(
        f"✓ Created survey {survey.survey_id} with {len(rows)} sections"
        f" and {total_questions} questions."
    )


if __name__ == "__main__":
    asyncio.run(main())
