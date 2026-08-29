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
    survey_definition = cast(dict[str, Any], seed.GRADUATE_TRACER_STUDY_SURVEY)
    sections = cast(list[dict[str, Any]], survey_definition["sections"])
    questions = [question for section in sections for question in section["questions"]]

    assert survey_definition["title"] == "GRADUATE TRACER STUDY SURVEY"
    assert survey_definition["description"] == expected_description
    assert seed.GRADUATE_TRACER_STUDY_TARGET_COHORT == "All Alumni"
    assert seed.GRADUATE_TRACER_STUDY_STATUS == "Active"
    assert len(sections) == 8
    assert len(questions) == 25
    assert all(question["is_required"] is True for question in questions)

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
        None,
        {"presentation": "dropdown"},
        None,
        None,
        None,
        None,
    ]

    expected_peii_statements = [
        "I have/had a stable source of income or employment.",
        "I contribute/contributed financially to my household expenses.",
        "I feel/felt confident in my abilities and decisions.",
        "I participate/participated in community or civic activities.",
        "I am/was aware of education programs provided by the Pasig LGU.",
    ]
    for section, statement in zip(sections[2:7], expected_peii_statements):
        assert [question["text"] for question in section["questions"]] == [
            statement,
            statement,
        ]
        assert all(
            question["options"] == seed.PEII_SCALE_LABELS
            for question in section["questions"]
        )
        assert all(
            question["config"] == {"min": 1, "max": 5}
            for question in section["questions"]
        )

    assert [question["text"] for question in sections[7]["questions"]] == [
        "What specific technical or soft skills do you wish were given more focus at PLP?",
        "What improvements should PLP implement to better support students?",
        "What message would you like to share with Pasig City leaders regarding PLP?",
    ]
