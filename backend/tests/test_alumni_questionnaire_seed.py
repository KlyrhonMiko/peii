from typing import Any, cast

from scripts import seed_alumni_questionnaire as seed


def _questions(section: dict[str, Any]) -> list[dict[str, Any]]:
    return cast(list[dict[str, Any]], section["questions"])


def test_alumni_questionnaire_matches_canonical_graduate_tracer_definition() -> None:
    survey_definition = cast(dict[str, Any], seed.GRADUATE_TRACER_STUDY_SURVEY)
    sections = cast(list[dict[str, Any]], survey_definition["sections"])
    questions = [question for section in sections for question in _questions(section)]

    expected_description = (
        "Purpose: This survey aims to assess the outcomes of graduates from "
        "Pamantasan ng Lungsod ng Pasig (PLP) and determine how their education "
        "has contributed to their employment, financial stability, personal "
        "development, and community engagement. The results will be used to "
        "compute the Pasig Education Impact Index (PEII) and to support the "
        "continuous improvement of educational programs and policies.\n\n"
        "Instructions: Please answer the following questions honestly and completely.\n\n"
        "Required fields are marked with an asterisk (*)"
    )

    assert survey_definition["title"] == "GRADUATE TRACER STUDY SURVEY"
    assert survey_definition["description"] == expected_description
    assert seed.GRADUATE_TRACER_STUDY_TARGET_COHORT == "All Alumni"
    assert seed.GRADUATE_TRACER_STUDY_STATUS == "Active"
    assert len(sections) == 14
    assert len(questions) == 80
    assert all(question["is_required"] is True for question in questions)
    assert {question["config"]["survey_phase"] for question in questions} == {1, 2}
    assert sum(question["config"]["survey_phase"] == 1 for question in questions) == 40
    assert sum(question["config"]["survey_phase"] == 2 for question in questions) == 40

    assert [section["title"] for section in sections] == [
        "Intro",
        "SECTION I : RESPONDENT'S PROFILE",
        "SECTION II-A - PEII Core Impact Measurement: A. Employability and Economic Mobility",
        "SECTION II-A - PEII Core Impact Measurement: B. Family Upliftment and Financial Stability",
        "SECTION II-A - PEII Core Impact Measurement: C. Personal Development and Life Quality",
        (
            "SECTION II-A - PEII Core Impact Measurement: D. Civic Engagement and Community "
            "Contribution"
        ),
        (
            "SECTION II-A - PEII Core Impact Measurement: E. Governance Trust and LGU Support "
            "Valuation"
        ),
        "IV. Feedback and Reflection",
        "SECTION I-B : POST-GRADUATION EMPLOYMENT PROFILE",
        "SECTION II-B - PEII Core Impact Measurement: A. Employability and Economic Mobility",
        "SECTION II-B - PEII Core Impact Measurement: B. Family Upliftment and Financial Stability",
        "SECTION II-B - PEII Core Impact Measurement: C. Personal Development and Life Quality",
        (
            "SECTION II-B - PEII Core Impact Measurement: D. Civic Engagement and Community "
            "Contribution"
        ),
        (
            "SECTION II-B - PEII Core Impact Measurement: E. Governance Trust and LGU Support "
            "Valuation"
        ),
    ]
    assert [len(_questions(section)) for section in sections] == [
        1,
        11,
        5,
        5,
        5,
        5,
        5,
        3,
        15,
        5,
        5,
        5,
        5,
        5,
    ]


def test_profile_and_post_graduation_branching_options_match_questionnaire() -> None:
    sections = cast(list[dict[str, Any]], seed.GRADUATE_TRACER_STUDY_SURVEY["sections"])
    profile_questions = _questions(sections[1])

    assert profile_questions[5]["options"] == [
        "Bachelor of Science in Accountancy",
        "Bachelor of Science in Business Administration - Major in Marketing Management",
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
    ]

    current_location = profile_questions[9]
    assert current_location["config"] == {
        "question_key": "current_location",
        "survey_phase": 1,
    }
    barangay = profile_questions[10]
    assert barangay["text"] == "If you currently live in Pasig City, which barangay do you live in?"
    assert barangay["options"] == seed.PASIG_BARANGAY_OPTIONS
    assert len(barangay["options"]) == 30
    assert barangay["config"] == {
        "visible_when": {
            "question_key": "current_location",
            "equals": "Pasig City",
        },
        "presentation": "dropdown",
        "survey_phase": 1,
    }

    employment_questions = _questions(sections[8])
    assert sections[8]["description"] == (
        "Answer the following questions about your employment and first job."
    )
    industry = employment_questions[4]
    assert industry["text"] == "Which industry do you work in?"
    assert industry["options"] == seed.JOB_INDUSTRY_OPTIONS
    assert len(industry["options"]) == 30
    assert industry["config"] == {
        "question_key": "job_industry",
        "presentation": "dropdown",
        "survey_phase": 2,
    }

    category = employment_questions[5]
    category_config = cast(dict[str, Any], category["config"])
    assert category["text"] == "Which category best describes your work in that industry?"
    assert category["options"] == seed.ALL_CATEGORY_OPTIONS
    assert category_config["question_key"] == "job_category"
    assert category_config["presentation"] == "dropdown"
    assert category_config["options_by_answer"] == {
        "question_key": "job_industry",
        "choices": seed.INDUSTRY_CATEGORY_CHOICES,
    }
    assert set(category["options"]) == {
        choice
        for choices in seed.INDUSTRY_CATEGORY_CHOICES.values()
        for choice in choices
    }
    assert set(seed.INDUSTRY_CATEGORY_CHOICES) == set(seed.JOB_INDUSTRY_OPTIONS)
    assert all("Other (specify)" in choices for choices in seed.INDUSTRY_CATEGORY_CHOICES.values())

    category_other = employment_questions[6]
    assert category_other["type"] == "text"
    assert category_other["options"] is None
    assert category_other["config"] == {
        "visible_when": {
            "question_key": "job_category",
            "one_of": seed.CATEGORY_OTHER_LABELS,
        },
        "survey_phase": 2,
    }

    role = employment_questions[7]
    assert role["options"] == [*seed.ROLE_OPTIONS, seed.ROLE_OTHER_OPTION]
    assert len(seed.ROLE_OPTIONS) == 103
    assert role["config"] == {
        "question_key": "job_role",
        "presentation": "searchable_dropdown",
        "survey_phase": 2,
    }

    role_other = employment_questions[8]
    assert role_other["text"] == "What is your job title or role? (Other, please specify)"
    assert role_other["type"] == "text"
    assert role_other["options"] is None
    assert role_other["config"] == {
        "visible_when": {
            "question_key": "job_role",
            "equals": seed.ROLE_OTHER_OPTION,
        },
        "survey_phase": 2,
    }


def test_phase_two_impact_sections_repeat_phase_one_statements() -> None:
    sections = cast(list[dict[str, Any]], seed.GRADUATE_TRACER_STUDY_SURVEY["sections"])
    phase_one_sections = sections[2:7]
    phase_two_sections = sections[9:14]

    for phase_one, phase_two in zip(phase_one_sections, phase_two_sections):
        assert phase_two["title"] == phase_one["title"].replace("II-A", "II-B")
        assert phase_two["description"] == phase_one["description"]
        phase_one_questions = _questions(phase_one)
        phase_two_questions = _questions(phase_two)
        assert [question["text"] for question in phase_two_questions] == [
            question["text"] for question in phase_one_questions
        ]
        assert [question["options"] for question in phase_two_questions] == [
            question["options"] for question in phase_one_questions
        ]
        assert all(
            question["config"] == {"min": 1, "max": 5, "survey_phase": 2}
            for question in phase_two_questions
        )
