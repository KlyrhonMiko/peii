"""
Seed the "GRADUATE TRACER STUDY SURVEY" — the canonical 8-section,
25-question graduate tracer study definition.

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
from services.audit_service import AuditEvent, commit_with_audit
from utils.identifiers import generate_business_id

GRADUATE_TRACER_STUDY_SURVEY_TITLE = "GRADUATE TRACER STUDY SURVEY"
GRADUATE_TRACER_STUDY_PURPOSE = (
    "This survey aims to assess the outcomes of graduates from Pamantasan ng Lungsod ng Pasig "
    "(PLP) and determine how their education has contributed to their employment, financial "
    "stability, personal development, and community engagement. The results will be used to "
    "compute the Pasig Education Impact Index (PEII) and to support the continuous improvement of "
    "educational programs "
    "and policies."
)
GRADUATE_TRACER_STUDY_INSTRUCTIONS = (
    "Please answer the following questions honestly and completely."
)
GRADUATE_TRACER_STUDY_DATA_PRIVACY_NOTICE = (
    "In accordance with the Data Privacy Act of 2012 (Republic Act No. 10173), all personal "
    "information collected will be treated with strict confidentiality. The data will be used "
    "solely for academic and research purposes. Participation in this survey is voluntary, and "
    "you may choose to withdraw at any time without any penalty. All information will be securely "
    "stored and protected. You may also visit https://privacy.gov.ph/data-privacy-act/ to learn "
    "more about your rights."
)
GRADUATE_TRACER_STUDY_REQUIRED_FIELDS_NOTE = "Required fields are marked with an asterisk (*)"
GRADUATE_TRACER_STUDY_SURVEY_DESCRIPTION = "\n\n".join(
    (
        f"Purpose: {GRADUATE_TRACER_STUDY_PURPOSE}",
        f"Instructions: {GRADUATE_TRACER_STUDY_INSTRUCTIONS}",
        f"Data Privacy Notice: {GRADUATE_TRACER_STUDY_DATA_PRIVACY_NOTICE}",
        GRADUATE_TRACER_STUDY_REQUIRED_FIELDS_NOTE,
    )
)
GRADUATE_TRACER_STUDY_TARGET_COHORT = "All Alumni"
GRADUATE_TRACER_STUDY_STATUS = "Active"

PEII_SCALE_LABELS = [
    "Strongly Disagree",
    "Disagree",
    "Neutral",
    "Agree",
    "Strongly Agree",
]


def _text_question(text: str) -> dict:
    return {
        "type": QuestionType.TEXT,
        "text": text,
        "options": None,
        "config": None,
        "is_required": True,
    }


def _single_choice_question(
    text: str,
    options: list[str],
    config: dict[str, object] | None = None,
) -> dict:
    return {
        "type": QuestionType.SINGLE_CHOICE,
        "text": text,
        "options": options,
        "config": config,
        "is_required": True,
    }


def _scale_question(text: str) -> dict:
    return {
        "type": QuestionType.SCALE,
        "text": text,
        "options": [*PEII_SCALE_LABELS],
        "config": {"min": 1, "max": 5},
        "is_required": True,
    }


PEII_COMMON_DESCRIPTION = (
    "Instruction: Rate each statement using the scale below based on your condition during two "
    "specific timeframes:\nYour situation specifically during your final year of residency as a "
    "student at PLP. This serves as your baseline for transformation.\nNote: These responses are "
    "essential to compute your Individual-Level Improvement and the overall Pasig Education Impact "
    "Index (PEII).\nScale: "
    "1 = Strongly Disagree | 2 = Disagree | 3 = Neutral | 4 = Agree | 5 = Strongly Agree"
)

SECTIONS: list[dict] = [
    {
        "title": "Intro",
        "description": "",
        "questions": [
            _text_question("Email: Record <email> as the email to be included with my response"),
            _single_choice_question(
                "Consent Statement: I have read and understood the Data Privacy Statement and "
                "voluntarily agree to participate in this survey.",
                ["Yes", "No"],
            ),
        ],
    },
    {
        "title": "SECTION I : RESPONDENT'S PROFILE",
        "description": "",
        "questions": [
            _text_question("Name*: Surname, First name, Middle Initial (e.g. Dela Cruz, Juan A.)"),
            _text_question("PLP Email Address: (@plpasig.edu.ph)"),
            _text_question("Non-PLP Email Address: (GMail, Yahoo, Etc.)"),
            _text_question("Contact Number/s:"),
            _single_choice_question("Year Graduated:", ["2023", "2024", "2025", "2026"]),
            _single_choice_question(
                "Degree Program Category:",
                [
                    "BSA",
                    "BSBA",
                    "BSE",
                    "BEE",
                    "BSE - Fil",
                    "BSE - Eng",
                    "BSE - Math",
                    "BSEE",
                    "BSHM",
                    "BSN",
                    "BSCS",
                    "BSIT",
                    "BAP",
                    "CTP",
                ],
                {"presentation": "dropdown"},
            ),
            _single_choice_question("Sex Assigned At Birth:", ["Male", "Female"]),
            _single_choice_question("Civil Status:", ["Single", "Married", "Separated", "Widowed"]),
            _single_choice_question(
                "First-generation graduate in the family: (You are the first in the immediate "
                "family to graduate from a college or university.)",
                ["Yes", "No"],
            ),
            _single_choice_question(
                "Current Location:",
                ["Pasig City", "NCR (Outside Pasig)", "Outside NCR", "Overseas / Abroad"],
            ),
        ],
    },
    {
        "title": "SECTION II - PEII Core Impact Measurement: A. Employability and Economic "
        "Mobility",
        "description": PEII_COMMON_DESCRIPTION,
        "questions": [
            _scale_question("I have/had a stable source of income or employment."),
            _scale_question("I have/had a stable source of income or employment."),
        ],
    },
    {
        "title": "SECTION II - PEII Core Impact Measurement: B. Family Upliftment and Financial "
        "Stability",
        "description": PEII_COMMON_DESCRIPTION,
        "questions": [
            _scale_question("I contribute/contributed financially to my household expenses."),
            _scale_question("I contribute/contributed financially to my household expenses."),
        ],
    },
    {
        "title": "SECTION II - PEII Core Impact Measurement: C. Personal Development and Life "
        "Quality",
        "description": PEII_COMMON_DESCRIPTION,
        "questions": [
            _scale_question("I feel/felt confident in my abilities and decisions."),
            _scale_question("I feel/felt confident in my abilities and decisions."),
        ],
    },
    {
        "title": "SECTION II - PEII Core Impact Measurement: D. Civic Engagement and Community "
        "Contribution",
        "description": PEII_COMMON_DESCRIPTION,
        "questions": [
            _scale_question("I participate/participated in community or civic activities."),
            _scale_question("I participate/participated in community or civic activities."),
        ],
    },
    {
        "title": "SECTION II - PEII Core Impact Measurement: E. Government Trust and LGU Support "
        "Valuation",
        "description": PEII_COMMON_DESCRIPTION,
        "questions": [
            _scale_question("I am/was aware of education programs provided by the Pasig LGU."),
            _scale_question("I am/was aware of education programs provided by the Pasig LGU."),
        ],
    },
    {
        "title": "IV. Feedback and Reflection",
        "description": "",
        "questions": [
            _text_question(
                "What specific technical or soft skills do you wish were given more focus at PLP?"
            ),
            _text_question("What improvements should PLP implement to better support students?"),
            _text_question(
                "What message would you like to share with Pasig City leaders regarding PLP?"
            ),
        ],
    },
]

GRADUATE_TRACER_STUDY_SURVEY = {
    "title": GRADUATE_TRACER_STUDY_SURVEY_TITLE,
    "description": GRADUATE_TRACER_STUDY_SURVEY_DESCRIPTION,
    "sections": SECTIONS,
}


def _create_tables() -> None:
    SQLModel.metadata.create_all(sync_engine)


async def _seed(session: AsyncSession) -> SurveyModel:
    survey_id = generate_business_id("SURV")

    survey = SurveyModel(
        survey_id=survey_id,
        title=GRADUATE_TRACER_STUDY_SURVEY_TITLE,
        description=GRADUATE_TRACER_STUDY_SURVEY_DESCRIPTION,
        status=GRADUATE_TRACER_STUDY_STATUS,
        target_cohort=GRADUATE_TRACER_STUDY_TARGET_COHORT,
        performed_by=settings.SYSTEM_ACTOR_ID,
    )
    session.add(survey)
    sections = []
    for sec_idx, sec_spec in enumerate(SECTIONS):
        section = SurveySectionModel(
            survey_id=survey.id,
            title=sec_spec["title"],
            description=sec_spec["description"],
            order_index=sec_idx,
            performed_by=settings.SYSTEM_ACTOR_ID,
        )
        session.add(section)
        sections.append((section, sec_spec["questions"]))

    await session.flush()

    questions_to_audit = []
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
                is_required=spec["is_required"],
                performed_by=settings.SYSTEM_ACTOR_ID,
            )
            session.add(question)
            questions_to_audit.append(question)

    events = [
        AuditEvent(
            action="create",
            resource_type="survey",
            resource_id=survey.survey_id,
            performed_by=settings.SYSTEM_ACTOR_ID,
        ),
        *[
            AuditEvent(
                action="create",
                resource_type="survey_section",
                resource_id=str(section.id),
                performed_by=settings.SYSTEM_ACTOR_ID,
            )
            for section, _ in sections
        ],
        *[
            AuditEvent(
                action="create",
                resource_type="survey_question",
                resource_id=str(question.id),
                performed_by=settings.SYSTEM_ACTOR_ID,
            )
            for question in questions_to_audit
        ],
    ]
    await commit_with_audit(session, events)
    await session.refresh(survey)
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
