"""
Seed the "GRADUATE TRACER STUDY SURVEY" — the canonical 14-section,
80-question, two-phase graduate tracer study definition.

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
GRADUATE_TRACER_STUDY_REQUIRED_FIELDS_NOTE = "Required fields are marked with an asterisk (*)"
GRADUATE_TRACER_STUDY_SURVEY_DESCRIPTION = "\n\n".join(
    (
        f"Purpose: {GRADUATE_TRACER_STUDY_PURPOSE}",
        f"Instructions: {GRADUATE_TRACER_STUDY_INSTRUCTIONS}",
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


def _text_question(
    text: str,
    phase: int = 1,
    config: dict[str, object] | None = None,
) -> dict:
    return {
        "type": QuestionType.TEXT,
        "text": text,
        "options": None,
        "config": _phase_config(phase, config),
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

CURRENT_LOCATION_OPTIONS = [
    "Pasig City",
    "NCR (Outside Pasig)",
    "Outside NCR",
    "Overseas / Abroad",
]

PASIG_BARANGAY_OPTIONS = [
    "Bagong Ilog",
    "Bagong Katipunan",
    "Bambang",
    "Buting",
    "Caniogan",
    "Dela Paz",
    "Kalawaan",
    "Kapasigan",
    "Kapitolyo",
    "Malinao",
    "Manggahan",
    "Maybunga",
    "Oranbo",
    "Palatiw",
    "Pinagbuhatan",
    "Pineda",
    "Rosario",
    "Sagad",
    "San Antonio",
    "San Joaquin",
    "San Jose",
    "San Miguel",
    "San Nicolas",
    "Santa Cruz",
    "Santa Lucia",
    "Santa Rosa",
    "Santolan",
    "Santo Tomas",
    "Sumilang",
    "Ugong",
]

JOB_INDUSTRY_OPTIONS = [
    "Accounting",
    "Administration & Office Support",
    "Advertising, Arts, & Media",
    "Banking & Financial Services",
    "Call Centre & Customer Service",
    "CEO & General Management",
    "Community Services & Development",
    "Construction",
    "Consulting & Strategy",
    "Design & Architecture",
    "Education & Training",
    "Engineering",
    "Farming, Animals & Conservation",
    "Government & Defense",
    "Healthcare & Medical",
    "Hospitality & Tourism",
    "Human Resources & Recruitment",
    "Information & Communication Technology",
    "Insurance & Superannuation",
    "Legal",
    "Manufacturing, Transport & Logistics",
    "Marketing & Communications",
    "Mining, Resources & Energy",
    "Real Estate & Property",
    "Retail & Consumer Products",
    "Sales",
    "Science & Technology",
    "Self-Employment",
    "Sport & Recreation",
    "Trades & Services",
]


def _with_generic_other(choices: list[str]) -> list[str]:
    if "Other (specify)" in choices:
        return choices
    return [*choices, "Other (specify)"]


INDUSTRY_CATEGORY_CHOICES: dict[str, list[str]] = {
    "Accounting": _with_generic_other(
        [
            "Accounts Receivable/Credit Control",
            "Audit – External",
            "Financial Accounting & Reporting",
            "Forensic Accounting & Investigation",
            "Accounts Payable",
            "Bookkeeping",
            "Internal Audit",
            "Payroll",
            "Taxation",
        ]
    ),
    "Administration & Office Support": _with_generic_other(
        [
            "Administrative Assistants",
            "Records Management & Document Control",
            "Reception/front desk",
            "Executive/secretarial support",
            "Data entry",
            "Client/sales administration",
            "Contracts administration",
        ]
    ),
    "Advertising, Arts, & Media": _with_generic_other(
        [
            "Editing & Publishing",
            "Creative direction/design",
            "Journalism/writing",
            "Media planning/buying",
            "Photography/video production",
            "Events/promotions",
            "Performing arts",
        ]
    ),
    "Banking & Financial Services": _with_generic_other(
        [
            "Analysis & Reporting",
            "Banking – Retail/Branch",
            "Management",
            "Business banking",
            "Credit/lending",
            "Financial planning",
            "Compliance/risk",
            "Client account management",
        ]
    ),
    "Call Centre & Customer Service": _with_generic_other(
        [
            "Customer Service – Call Centre",
            "Customer Service – Customer Facing",
            "Sales – Outbound",
            "Supervisors/Team Leaders",
            "Inbound sales",
            "Collections",
            "Quality assurance/training",
            "Customer-service management/support",
        ]
    ),
    "CEO & General Management": _with_generic_other(
        [
            "Board/governance appointments",
            "Chief executive leadership",
            "Chief operating/managing director roles",
            "General/business unit management",
            "Other executive management (specify)",
        ]
    ),
    "Community Services & Development": _with_generic_other(
        [
            "Management",
            "Social work/case management",
            "Youth/family services",
            "Community development",
            "Disability/aged-care support",
            "Fundraising/nonprofit programs",
        ]
    ),
    "Construction": _with_generic_other(
        [
            "Management",
            "Site supervision",
            "Project management",
            "Estimating/costing",
            "Contracts administration",
            "Surveying",
            "Safety/compliance",
        ]
    ),
    "Consulting & Strategy": _with_generic_other(
        [
            "Business analysis",
            "Corporate development",
            "Environment/sustainability advisory",
            "Management/change consulting",
            "Policy advisory",
            "Strategy/planning",
            "Other consulting (specify)",
        ]
    ),
    "Design & Architecture": _with_generic_other(
        [
            "Architecture",
            "Architectural drafting",
            "Graphic/visual design",
            "Industrial/product design",
            "Interior design",
            "Landscape/urban design",
            "Web/interaction design",
            "Other design (specify)",
        ]
    ),
    "Education & Training": _with_generic_other(
        [
            "Management – Schools",
            "Management – Universities",
            "Teaching – Early Childhood",
            "Teaching – Primary",
            "Teaching – Secondary",
            "Tutoring",
            "Workplace Training & Assessment",
        ]
    ),
    "Engineering": _with_generic_other(
        [
            "Civil/structural engineering",
            "Electrical/electronics engineering",
            "Mechanical engineering",
            "Chemical/process engineering",
            "Environmental engineering",
            "Industrial engineering",
            "Engineering drafting/design",
            "Project/field engineering",
            "Engineering maintenance",
            "Other engineering (specify)",
        ]
    ),
    "Farming, Animals & Conservation": _with_generic_other(
        [
            "Agronomy/farm services",
            "Farm operations",
            "Horticulture",
            "Fisheries/aquaculture",
            "Animal care/veterinary services",
            "Conservation/parks/wildlife",
            "Other agriculture/conservation (specify)",
        ]
    ),
    "Government & Defense": _with_generic_other(
        [
            "Emergency Services",
            "Government – Local",
            "Government – National",
            "Government – Regional/Provincial",
            "Armed Forces",
            "Police/corrections",
            "Policy/planning/regulation",
            "Public administration",
        ]
    ),
    "Healthcare & Medical": _with_generic_other(
        [
            "Medical Administration",
            "Nursing - A&E, Critical Care & ICU",
            "Nursing - General Medical & Surgical",
            "Pharmaceuticals & Medical Devices",
            "Allied health/rehabilitation",
            "Dental care",
            "Laboratory/pathology",
            "Medical imaging",
            "Pharmacy",
            "Public/community health",
        ]
    ),
    "Hospitality & Tourism": _with_generic_other(
        [
            "Bar & Beverages Staff",
            "Chefs/Cooks",
            "Front Office & Guest Services",
            "Management",
            "Travel Agents/Consultants",
        ]
    ),
    "Human Resources & Recruitment": _with_generic_other(
        [
            "Management - Agency",
            "Agency recruitment",
            "In-house recruitment",
            "Employee relations",
            "Training/development",
            "HR generalist services",
            "Organizational development",
        ]
    ),
    "Information & Communication Technology": _with_generic_other(
        [
            "Developers/Programmers",
            "Engineering - Network",
            "Help Desk & IT Support",
            "Management",
            "Networks & Systems Administration",
            "Programme & Project Management",
            "Sales - Pre & Post",
            "Telecommunications",
            "Testing & Quality Assurance",
        ]
    ),
    "Insurance & Superannuation": _with_generic_other(
        [
            "Management",
            "Underwriting",
            "Claims processing",
            "Brokerage",
            "Risk/actuarial analysis",
            "Policy administration",
            "Retirement benefits/fund administration",
        ]
    ),
    "Legal": _with_generic_other(
        [
            "Corporate/commercial law",
            "Civil/criminal litigation",
            "Family law",
            "Labor/employment law",
            "Property/construction law",
            "In-house legal/compliance",
            "Paralegal/legal assistance",
            "Legal administration",
            "Other legal services (specify)",
        ]
    ),
    "Manufacturing, Transport & Logistics": _with_generic_other(
        [
            "Purchasing, Procurement & Inventory",
            "Production/assembly",
            "Quality assurance/control",
            "Warehousing/distribution",
            "Freight/transport",
            "Machine operations",
            "Supply-chain planning",
        ]
    ),
    "Marketing & Communications": _with_generic_other(
        [
            "Digital & Search Marketing",
            "Marketing Assitants/Coordinators",
            "Brand management",
            "Public relations",
            "Market research/analysis",
            "Events marketing",
            "Content/communications",
            "Product marketing",
        ]
    ),
    "Mining, Resources & Energy": _with_generic_other(
        [
            "Mining operations",
            "Mineral exploration/geoscience",
            "Mine engineering/maintenance",
            "Oil/gas operations",
            "Power/energy generation",
            "Health/safety/environment",
            "Natural resources/water",
            "Other resources/energy (specify)",
        ]
    ),
    "Real Estate & Property": _with_generic_other(
        [
            "Administration",
            "Residential Sales",
            "Property management/leasing",
            "Commercial sales/leasing",
            "Facilities management",
            "Property valuation",
            "Property development",
        ]
    ),
    "Retail & Consumer Products": _with_generic_other(
        [
            "Buying",
            "Management - Area/Multi-site",
            "Merchandisers",
            "Retail Assistants",
            "Store management",
            "Customer service/cashiering",
            "Inventory/stock control",
            "E-commerce/online retail",
        ]
    ),
    "Sales": _with_generic_other(
        [
            "Management",
            "Sales Coordinators",
            "Sales Representatives/Consultants",
            "Account/relationship management",
            "Business development",
            "Retail/in-store sales",
            "Technical sales",
            "Sales analysis/operations",
        ]
    ),
    "Science & Technology": _with_generic_other(
        [
            "Quality Assurance & Control",
            "Laboratory/technical services",
            "Biological/biomedical sciences",
            "Food technology/safety",
            "Chemistry/physics",
            "Environmental/earth sciences",
            "Research/data analysis",
        ]
    ),
    "Self-Employment": _with_generic_other(
        [
            "Self Employment",
            "Retail/trading business",
            "Food-service business",
            "Freelance professional services",
            "Digital/online business",
            "Skilled-trade services",
        ]
    ),
    "Sport & Recreation": _with_generic_other(
        [
            "Sports coaching/instruction",
            "Fitness/personal training",
            "Sports/recreation management",
            "Recreation program delivery",
            "Other sport/recreation (specify)",
        ]
    ),
    "Trades & Services": _with_generic_other(
        [
            "Electrical trades",
            "Automotive trades",
            "Carpentry/building trades",
            "Plumbing",
            "Welding/fabrication",
            "Air conditioning/refrigeration",
            "Maintenance/repair technicians",
            "Cleaning/facilities services",
            "Gardening/landscaping",
            "Hair/beauty services",
            "Security services",
            "Other trades/services (specify)",
        ]
    ),
}

ALL_CATEGORY_OPTIONS = list(
    dict.fromkeys(
        category
        for industry in JOB_INDUSTRY_OPTIONS
        for category in INDUSTRY_CATEGORY_CHOICES[industry]
    )
)
CATEGORY_OTHER_LABELS = list(
    dict.fromkeys(
        category
        for category in ALL_CATEGORY_OPTIONS
        if category.startswith("Other ") or category == "Other (specify)"
    )
)

ROLE_OPTIONS = [
    "Account Executive",
    "Accounting Role",
    "Accounts Manager",
    "Administration Role",
    "Administrative Manager",
    "Administrative Officer",
    "Agent",
    "Analyst",
    "Architect",
    "Assistant",
    "Audit Associate",
    "Back Office Staff",
    "Bank Teller",
    "Barista",
    "Billing Specialist",
    "Bookkeeper",
    "Business Development Executive",
    "Cashier",
    "Chef/Cook",
    "Commis Chef",
    "Compliance Officer",
    "Consultant",
    "Coordinator",
    "Crew Member",
    "Customer Service Representative",
    "Data Encoder",
    "Data Entry Role",
    "Designer",
    "Early Childhood Teacher",
    "Educational Leader",
    "Educator",
    "Engineer",
    "Engineering Role",
    "English Teacher",
    "Executive",
    "Farmer",
    "Financial Advisor",
    "Fitness Instructor",
    "Freelancer/Independent Professional",
    "Frontliner",
    "Full Stack Developer",
    "Head Teacher",
    "Healthcare Professional",
    "High School Teacher",
    "Hospitality Worker",
    "Human Resources Assistant",
    "Human Resources Officer",
    "Identity and Access Management Officer",
    "Insurance Officer",
    "Internal Auditor",
    "Laboratory Technician",
    "Lawyer/Attorney",
    "Logistics Officer",
    "Machine Operator",
    "Management Trainee",
    "Manager",
    "Marketing Assistant",
    "Marketing Officer",
    "Medical Representative",
    "Merchandiser",
    "Mining Worker",
    "Multimedia Designer",
    "Network Engineer",
    "Nurse",
    "Online English Teacher",
    "Online Seller",
    "Owner",
    "Paralegal",
    "Police Officer",
    "Project Coordinator",
    "Property Manager",
    "Quality Analyst",
    "Quality Assurance Engineer",
    "Quality Assurance Role",
    "Real Estate Agent",
    "Researcher",
    "Sales Assistant",
    "Sales Associate",
    "Sales Engineer",
    "Sales Executive",
    "Sales Manager",
    "Sales Supervisor",
    "Scientist",
    "Security Guard",
    "Skilled Tradesperson",
    "Social Media Manager",
    "Social Worker",
    "Software Developer",
    "Specialist",
    "Sports Coach",
    "Staff Nurse",
    "Store Crew",
    "Store Manager",
    "Supply Chain Officer",
    "Support Engineer",
    "Systems Developer",
    "Teacher I-VII",
    "Technical Officer",
    "Technician",
    "Tour Consultant",
    "Trainer",
    "Veterinarian",
    "Worker",
]

ROLE_OTHER_OPTION = "Other job title (specify)"

PEII_SECTIONS_PHASE_1: list[dict] = [
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
]


def _duplicate_follow_up_sections() -> list[dict]:
    duplicated: list[dict] = []
    for section in PEII_SECTIONS_PHASE_1:
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


PROFILE_SECTION = {
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
                "Bachelor of Science in Business Administration - Major in Marketing "
                "Management",
                "Bachelor of Science in Entrepreneurship",
                "Bachelor of Elementary Education",
                "Bachelor of Secondary Education",
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
            CURRENT_LOCATION_OPTIONS,
            {"question_key": "current_location"},
        ),
        _single_choice_question(
            "If you currently live in Pasig City, which barangay do you live in?",
            PASIG_BARANGAY_OPTIONS,
            {
                "visible_when": {"question_key": "current_location", "equals": "Pasig City"},
                "presentation": "dropdown",
            },
        ),
    ],
}

INTRO_SECTION = {
    "title": "Intro",
    "description": "",
    "questions": [
        _single_choice_question(
            "Consent Statement: I have read and understood the Data Privacy Statement and "
            "voluntarily agree to participate in this survey.",
            ["Yes", "No"],
        ),
    ],
}

POST_GRADUATION_EMPLOYMENT_SECTION = {
    "title": "SECTION I-B : POST-GRADUATION EMPLOYMENT PROFILE",
    "description": "Answer the following questions about your employment and first job.",
    "questions": [
        _single_choice_question(
            "What is your current employment status?",
            [
                "Employed full-time",
                "Employed part-time",
                "Self-employed / Business owner",
                "Unemployed - seeking work",
            ],
            phase=2,
        ),
        _single_choice_question(
            "What type of employment do you have?",
            ["Contractual", "Permanent", "Freelance", "Project-based"],
            phase=2,
        ),
        _single_choice_question(
            "Which sector do you work in?",
            ["Private", "Public"],
            phase=2,
        ),
        _single_choice_question(
            "What is your job level?",
            [
                "Entry-Level",
                "Junior Staff",
                "Senior-Level",
                "Supervisory Level",
                "Managerial Level",
            ],
            phase=2,
        ),
        _single_choice_question(
            "Which industry do you work in?",
            JOB_INDUSTRY_OPTIONS,
            {"question_key": "job_industry", "presentation": "dropdown"},
            phase=2,
        ),
        _single_choice_question(
            "Which category best describes your work in that industry?",
            ALL_CATEGORY_OPTIONS,
            {
                "question_key": "job_category",
                "presentation": "dropdown",
                "options_by_answer": {
                    "question_key": "job_industry",
                    "choices": INDUSTRY_CATEGORY_CHOICES,
                },
            },
            phase=2,
        ),
        _text_question(
            "If you selected Other (specify), what category best describes your work?",
            phase=2,
            config={
                "visible_when": {
                    "question_key": "job_category",
                    "one_of": CATEGORY_OTHER_LABELS,
                }
            },
        ),
        _single_choice_question(
            "Which role or job title best describes your work?",
            [*ROLE_OPTIONS, ROLE_OTHER_OPTION],
            {"question_key": "job_role", "presentation": "searchable_dropdown"},
            phase=2,
        ),
        _text_question(
            "What is your job title or role? (Other, please specify)",
            phase=2,
            config={
                "visible_when": {
                    "question_key": "job_role",
                    "equals": ROLE_OTHER_OPTION,
                }
            },
        ),
        _single_choice_question(
            "Where do you work?",
            CURRENT_LOCATION_OPTIONS,
            phase=2,
        ),
        _single_choice_question(
            "What is your monthly income range?",
            [
                "Below ₱15,000",
                "₱15,001 – ₱25,000",
                "₱25,001 – ₱40,000",
                "₱40,001 – ₱60,000",
                "Above ₱60,000",
            ],
            phase=2,
        ),
        _single_choice_question(
            "How related is your current job to your college degree?",
            ["Not related", "Slightly related", "Moderately related", "Highly related"],
            phase=2,
        ),
        _single_choice_question(
            "How difficult was it to find your first job after graduation?",
            ["Very Easy", "Easy", "Neutral", "Difficult", "Very Difficult"],
            phase=2,
        ),
        _single_choice_question(
            "How long did it take to find your first job after graduation?",
            ["< 3 months", "3-6 months", "6-12 months", "> 1 year", "Still unemployed"],
            phase=2,
        ),
        _single_choice_question(
            "How did you obtain your first job?",
            [
                "Internship",
                "Referral",
                "Walk-In",
                "Online application",
                "Business  / self-employment",
                "Job Fair",
            ],
            phase=2,
        ),
    ],
}

FEEDBACK_SECTION = {
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
}

SECTIONS: list[dict] = [
    INTRO_SECTION,
    PROFILE_SECTION,
    *PEII_SECTIONS_PHASE_1,
    FEEDBACK_SECTION,
    POST_GRADUATION_EMPLOYMENT_SECTION,
    *_duplicate_follow_up_sections(),
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
