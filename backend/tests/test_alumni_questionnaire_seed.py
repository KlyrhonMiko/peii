from typing import Any, cast

from scripts import seed_alumni_questionnaire as seed


def test_alumni_questionnaire_matches_canonical_graduate_tracer_definition() -> None:
    expected_description = (
        "Purpose: This survey aims to assess the outcomes of graduates from "
        "Pamantasan ng Lungsod ng Pasig (PLP) and determine how their education "
        "has contributed to their employment, financial stability, personal "
        "development, and community engagement. The results will be used to "
        "compute the Pasig Education Impact Index (PEII) and to support the "
        "continuous improvement of educational programs and policies.\n\n"
        "Instructions: Please answer the following questions honestly and completely.\n\n"
        "Data Privacy Notice: In accordance with the Data Privacy Act of 2012 "
        "(Republic Act No. 10173), all personal information collected will be "
        "treated with strict confidentiality. The data will be used solely for "
        "academic and research purposes. Participation in this survey is voluntary, "
        "and you may choose to withdraw at any time without any penalty. All "
        "information will be securely stored and protected. You may also visit "
        "https://privacy.gov.ph/data-privacy-act/ to learn more about your rights.\n\n"
        "Required fields are marked with an asterisk (*)"
    )
    expected_common_description = (
        "Instruction: Rate each statement using the scale below based on your "
        "condition during two specific timeframes:\nYour situation specifically during "
        "your final year of residency as a student at PLP. This serves as your baseline "
        "for transformation\nNote: These responses are essential to compute your "
        "Individual-Level Improvement and the overall Pasig Education Impact Index "
        "(PEII).\nScale: 1 = Strongly Disagree | 2 = Disagree | 3 = Neutral | 4 = Agree "
        "| 5 = Strongly Agree"
    )
    survey_definition = cast(dict[str, Any], seed.GRADUATE_TRACER_STUDY_SURVEY)
    sections = cast(list[dict[str, Any]], survey_definition["sections"])
    questions = [question for section in sections for question in section["questions"]]

    assert survey_definition["title"] == "GRADUATE TRACER STUDY SURVEY"
    assert survey_definition["description"] == expected_description
    assert seed.PEII_COMMON_DESCRIPTION == expected_common_description
    assert seed.GRADUATE_TRACER_STUDY_TARGET_COHORT == "All Alumni"
    assert seed.GRADUATE_TRACER_STUDY_STATUS == "Active"
    assert len(sections) == 14
    assert len(questions) == 67
    assert all(question["is_required"] is True for question in questions)
    assert all(
        isinstance(question["config"], dict)
        and question["config"].get("survey_phase") in {1, 2}
        for question in questions
    )

    expected_profile_options = [
        ["2023", "2024", "2025", "2026"],
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
        ["Male", "Female"],
        ["Single", "Married", "Separated", "Widowed"],
        ["Yes", "No"],
        ["Pasig City", "NCR (Outside Pasig)", "Outside NCR", "Overseas / Abroad"],
    ]
    assert [question["options"] for question in sections[1]["questions"][4:]] == (
        expected_profile_options
    )
    assert [question["config"] for question in sections[1]["questions"][4:]] == [
        {"survey_phase": 1},
        {"presentation": "dropdown", "survey_phase": 1},
        {"survey_phase": 1},
        {"survey_phase": 1},
        {"survey_phase": 1},
        {"survey_phase": 1},
    ]

    expected_peii_statements = [
        [
            "I have/had a stable source of income or employment.",
            "My job/business is/was aligned with my college degree or skills.",
            "I am/was able to obtain employment opportunities when needed.",
            "My income is/was sufficient to support my basic needs.",
            "I have/had opportunities for career growth and advancement.",
        ],
        [
            "I contribute/contributed financially to my household expenses.",
            "My financial situation helps/helped improve my family’s living condition.",
            "I am/was able to support the education of family members.",
            "I have/had savings or an emergency fund for financial security.",
            "My financial responsibilities are/were manageable without excessive burden.",
        ],
        [
            "I feel/felt confident in my abilities and decisions.",
            "I demonstrate/demonstrated leadership skills when needed.",
            "I communicate/communicated effectively in personal and professional settings.",
            "I have/had clear career goals and direction.",
            "I am/was satisfied with my overall life situation.",
        ],
        [
            "I participate/participated in community or civic activities.",
            "I volunteer/volunteered my time or resources to help others.",
            "I mentor/mentored or guide/guided others in my community.",
            "I contribute/contributed my skills to community development.",
            "I feel/felt responsible for contributing to society.",
        ],
        [
            "I am/was aware of education programs provided by the Pasig LGU.",
            "I perceive/perceived that the local government supports education initiatives.",
            "I trust/trusted the local government in delivering education-related services.",
            "I believe/believed that public investment in education benefits society.",
            "I value/valued the educational opportunities provided by PLP.",
        ],
    ]
    unique_peii_statements = {
        statement for statements in expected_peii_statements for statement in statements
    }
    assert len(unique_peii_statements) == 25
    assert [section["title"] for section in sections[:2]] == [
        "Intro",
        "SECTION I : RESPONDENT'S PROFILE",
    ]
    assert [section["title"] for section in sections[2:8]] == [
        "SECTION II-A - PEII Core Impact Measurement: A. Employability and Economic Mobility",
        "SECTION II-A - PEII Core Impact Measurement: B. Family Upliftment and Financial Stability",
        "SECTION II-A - PEII Core Impact Measurement: C. Personal Development and Life Quality",
        (
            "SECTION II-A - PEII Core Impact Measurement: D. Civic Engagement and Community "
            "Contribution"
        ),
        (
            "SECTION II-A - PEII Core Impact Measurement: E. Government Trust and LGU Support "
            "Valuation"
        ),
        "IV-A. Feedback and Reflection",
    ]
    assert [section["title"] for section in sections[8:]] == [
        title.replace("II-A", "II-B").replace("IV-A", "IV-B")
        for title in [section["title"] for section in sections[2:8]]
    ]
    assert [len(section["questions"]) for section in sections[:8]] == [1, 10, 5, 5, 5, 5, 5, 3]
    assert [len(section["questions"]) for section in sections[8:]] == [5, 5, 5, 5, 5, 3]

    for section, statements in zip(sections[2:7], expected_peii_statements):
        assert section["description"] == seed.PEII_COMMON_DESCRIPTION
        assert [question["text"] for question in section["questions"]] == statements
        assert all(
            question["options"] == seed.PEII_SCALE_LABELS
            for question in section["questions"]
        )
        assert all(
            question["config"] == {"min": 1, "max": 5, "survey_phase": 1}
            for question in section["questions"]
        )

    assert [question["text"] for question in sections[7]["questions"]] == [
        "What specific technical or soft skills do you wish were given more focus at PLP?",
        "What improvements should PLP implement to better support students?",
        "What message would you like to share with Pasig City leaders regarding PLP?",
    ]

    for phase_1_section, phase_2_section in zip(sections[2:8], sections[8:]):
        assert phase_2_section["description"] == phase_1_section["description"]
        assert [question["text"] for question in phase_2_section["questions"]] == [
            question["text"] for question in phase_1_section["questions"]
        ]
        assert [question["type"] for question in phase_2_section["questions"]] == [
            question["type"] for question in phase_1_section["questions"]
        ]
        assert [question["options"] for question in phase_2_section["questions"]] == [
            question["options"] for question in phase_1_section["questions"]
        ]
        assert all(
            question["config"]["survey_phase"] == 2
            for question in phase_2_section["questions"]
        )
        assert [
            {key: value for key, value in question["config"].items() if key != "survey_phase"}
            for question in phase_2_section["questions"]
        ] == [
            {key: value for key, value in question["config"].items() if key != "survey_phase"}
            for question in phase_1_section["questions"]
        ]
