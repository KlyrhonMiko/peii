"""
Seed the "GRADUATE TRACER STUDY SURVEY" — the canonical 14-section,
68-question, two-phase graduate tracer study definition.

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


def _phase_config(phase: int, config: dict[str, object] | None = None) -> dict[str, object]:
    return {**(config or {}), "survey_phase": phase}


def _text_question(text: str, phase: int = 1) -> dict:
    return {
        "type": QuestionType.TEXT,
        "text": text,
        "options": None,
        "config": _phase_config(phase),
        "is_required": True,
    }


def _single_choice_question(
    text: str,
    options: list[str],
    config: dict[str, object] | None = None,
    phase: int = 1,
) -> dict:
    return {
        "type": QuestionType.SINGLE_CHOICE,
        "text": text,
        "options": options,
        "config": _phase_config(phase, config),
        "is_required": True,
    }


def _scale_question(text: str, phase: int = 1) -> dict:
    return {
        "type": QuestionType.SCALE,
        "text": text,
        "options": [*PEII_SCALE_LABELS],
        "config": _phase_config(phase, {"min": 1, "max": 5}),
        "is_required": True,
    }


PEII_COMMON_DESCRIPTION = (
    "Instruction: Rate each statement using the scale below based on your condition during two "
    "specific timeframes:\nYour situation specifically during your final year of residency as a "
    "student at PLP. This serves as your baseline for transformation\nNote: These responses are "
    "essential to compute your Individual-Level Improvement and the overall Pasig Education Impact "
    "Index (PEII).\nScale: "
    "1 = Strongly Disagree | 2 = Disagree | 3 = Neutral | 4 = Agree | 5 = Strongly Agree"
)

SECTIONS: list[dict] = [
    {
        "title": "Intro",
        "description": "",
        "questions": [
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
                    "Bachelor of Science in Accountancy",
                    "Bachelor of Science in Business Administration - Major in Marketing Management",
                    "Bachelor of Science in Entrepreneurship",
                    "Bachelor of Elementary Education",
                    "Bachelor of Secondary Education - Major in English",
                    "Bachelor of Secondary Education - Major in Filipino",
                    "Bachelor of Secondary Education - Major in Mathematics",
                    "Bachelor of Science in Electronics Engineering",
                    "Bachelor of Science in Hospitality Management",
                    "Bachelor of Science in Nursing",
                    "Bachelor of Science in Computer Science",
                    "Bachelor of Science in Information Technology",
                    "Bachelor of Arts in Psychology",
                    "Certificate in Teaching Program (CTP)",
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
        "title": "SECTION II-A - PEII Core Impact Measurement: A. Employability and Economic "
        "Mobility",
        "description": PEII_COMMON_DESCRIPTION,
        "questions": [
            _scale_question("I have/had a stable source of income or employment."),
            _scale_question("My job/business is/was aligned with my college degree or skills."),
            _scale_question("I am/was able to obtain employment opportunities when needed."),
            _scale_question("My income is/was sufficient to support my basic needs."),
            _scale_question("I have/had opportunities for career growth and advancement."),
        ],
    },
    {
        "title": "SECTION II-A - PEII Core Impact Measurement: B. Family Upliftment and Financial "
        "Stability",
        "description": PEII_COMMON_DESCRIPTION,
        "questions": [
            _scale_question("I contribute/contributed financially to my household expenses."),
            _scale_question(
                "My financial situation helps/helped improve my family’s living condition."
            ),
            _scale_question("I am/was able to support the education of family members."),
            _scale_question("I have/had savings or an emergency fund for financial security."),
            _scale_question(
                "My financial responsibilities are/were manageable without excessive burden."
            ),
        ],
    },
    {
        "title": "SECTION II-A - PEII Core Impact Measurement: C. Personal Development and Life "
        "Quality",
        "description": PEII_COMMON_DESCRIPTION,
        "questions": [
            _scale_question("I feel/felt confident in my abilities and decisions."),
            _scale_question("I demonstrate/demonstrated leadership skills when needed."),
            _scale_question(
                "I communicate/communicated effectively in personal and professional settings."
            ),
            _scale_question("I have/had clear career goals and direction."),
            _scale_question("I am/was satisfied with my overall life situation."),
        ],
    },
    {
        "title": "SECTION II-A - PEII Core Impact Measurement: D. Civic Engagement and Community "
        "Contribution",
        "description": PEII_COMMON_DESCRIPTION,
        "questions": [
            _scale_question("I participate/participated in community or civic activities."),
            _scale_question("I volunteer/volunteered my time or resources to help others."),
            _scale_question("I mentor/mentored or guide/guided others in my community."),
            _scale_question("I contribute/contributed my skills to community development."),
            _scale_question("I feel/felt responsible for contributing to society."),
        ],
    },
    {
        "title": "SECTION II-A - PEII Core Impact Measurement: E. Government Trust and LGU Support "
        "Valuation",
        "description": PEII_COMMON_DESCRIPTION,
        "questions": [
            _scale_question("I am/was aware of education programs provided by the Pasig LGU."),
            _scale_question(
                "I perceive/perceived that the local government supports education initiatives."
            ),
            _scale_question(
                "I trust/trusted the local government in delivering education-related services."
            ),
            _scale_question(
                "I believe/believed that public investment in education benefits society."
            ),
            _scale_question("I value/valued the educational opportunities provided by PLP."),
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


def _duplicate_follow_up_sections() -> list[dict]:
    duplicated: list[dict] = []
    for section in SECTIONS[2:7]:
        title = section["title"].replace("II-A", "II-B")
        questions = []
        for question in section["questions"]:
            config = {**question["config"], "survey_phase": 2}
            questions.append({**question, "config": config})
        duplicated.append(
            {
                "title": title,
                "description": section["description"],
                "questions": questions,
            }
        )
    return duplicated


feedback = SECTIONS.pop()
SECTIONS.extend(_duplicate_follow_up_sections())
SECTIONS.append(feedback)

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
            options_str = spec["options"] if spec["options"] else None
            config_str = spec["config"] if spec.get("config") else None
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
                    opts = (
                        q.options
                        if isinstance(q.options, list)
                        else json.loads(q.options)
                    )
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
