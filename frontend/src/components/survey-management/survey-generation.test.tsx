import { describe, expect, it } from "vitest"

import {
  GRADUATE_TRACER_STUDY_SURVEY,
  GRADUATE_TRACER_STUDY_SURVEY_DESCRIPTION,
  GRADUATE_TRACER_STUDY_SURVEY_TITLE,
  PEII_SCALE_LABELS,
  createGraduateTracerStudySurveyPayload,
} from "./constants"

describe("Graduate Tracer Study survey definition", () => {
  it("keeps the canonical title and exact survey description together", () => {
    const expectedDescription = [
      "Purpose: This survey aims to assess the outcomes of graduates from Pamantasan ng Lungsod ng Pasig (PLP) and determine how their education has contributed to their employment, financial stability, personal development, and community engagement. The results will be used to compute the Pasig Education Impact Index (PEII) and to support the continuous improvement of educational programs and policies.",
      "Instructions: Please answer the following questions honestly and completely.",
      "Data Privacy Notice: In accordance with the Data Privacy Act of 2012 (Republic Act No. 10173), all personal information collected will be treated with strict confidentiality. The data will be used solely for academic and research purposes. Participation in this survey is voluntary, and you may choose to withdraw at any time without any penalty. All information will be securely stored and protected. You may also visit https://privacy.gov.ph/data-privacy-act/ to learn more about your rights.",
      "Required fields are marked with an asterisk (*)",
    ].join("\n\n")

    expect(GRADUATE_TRACER_STUDY_SURVEY_TITLE).toBe("GRADUATE TRACER STUDY SURVEY")
    expect(GRADUATE_TRACER_STUDY_SURVEY.title).toBe(GRADUATE_TRACER_STUDY_SURVEY_TITLE)
    expect(GRADUATE_TRACER_STUDY_SURVEY_DESCRIPTION).toBe(expectedDescription)
    expect(GRADUATE_TRACER_STUDY_SURVEY.description).toBe(expectedDescription)
  })

  it("contains the exact intro, profile, PEII, and feedback questions", () => {
    expect(GRADUATE_TRACER_STUDY_SURVEY.sections).toHaveLength(8)
    expect(GRADUATE_TRACER_STUDY_SURVEY.sections[0]).toMatchObject({
      title: "Intro",
      questions: [
        {
          question_text: "Email: Record <email> as the email to be included with my response",
          question_type: "text",
          options: null,
        },
        {
          question_text: "Consent Statement: I have read and understood the Data Privacy Statement and voluntarily agree to participate in this survey.",
          question_type: "single_choice",
          options: ["Yes", "No"],
        },
      ],
    })
    expect(GRADUATE_TRACER_STUDY_SURVEY.sections[1]).toMatchObject({
      title: "SECTION I : RESPONDENT'S PROFILE",
      questions: [
        { question_text: "Name*: Surname, First name, Middle Initial (e.g. Dela Cruz, Juan A.)", question_type: "text", options: null },
        { question_text: "PLP Email Address: (@plpasig.edu.ph)", question_type: "text", options: null },
        { question_text: "Non-PLP Email Address: (GMail, Yahoo, Etc.)", question_type: "text", options: null },
        { question_text: "Contact Number/s:", question_type: "text", options: null },
        { question_text: "Year Graduated:", question_type: "single_choice", options: ["2023", "2024", "2025", "2026"] },
        {
          question_text: "Degree Program Category:",
          question_type: "single_choice",
          options: ["BSA", "BSBA", "BSE", "BEE", "BSE - Fil", "BSE - Eng", "BSE - Math", "BSEE", "BSHM", "BSN", "BSCS", "BSIT", "BAP", "CTP"],
          config: { presentation: "dropdown" },
        },
        { question_text: "Sex Assigned At Birth:", question_type: "single_choice", options: ["Male", "Female"] },
        { question_text: "Civil Status:", question_type: "single_choice", options: ["Single", "Married", "Separated", "Widowed"] },
        {
          question_text: "First-generation graduate in the family: (You are the first in the immediate family to graduate from a college or university.)",
          question_type: "single_choice",
          options: ["Yes", "No"],
        },
        { question_text: "Current Location:", question_type: "single_choice", options: ["Pasig City", "NCR (Outside Pasig)", "Outside NCR", "Overseas / Abroad"] },
      ],
    })

    const peiiSections = GRADUATE_TRACER_STUDY_SURVEY.sections.slice(2, 7)
    expect(peiiSections.map(({ title }) => title)).toEqual([
      "SECTION II - PEII Core Impact Measurement: A. Employability and Economic Mobility",
      "SECTION II - PEII Core Impact Measurement: B. Family Upliftment and Financial Stability",
      "SECTION II - PEII Core Impact Measurement: C. Personal Development and Life Quality",
      "SECTION II - PEII Core Impact Measurement: D. Civic Engagement and Community Contribution",
      "SECTION II - PEII Core Impact Measurement: E. Government Trust and LGU Support Valuation",
    ])
    const peiiStatements = [
      "I have/had a stable source of income or employment.",
      "I contribute/contributed financially to my household expenses.",
      "I feel/felt confident in my abilities and decisions.",
      "I participate/participated in community or civic activities.",
      "I am/was aware of education programs provided by the Pasig LGU.",
    ]
    expect(peiiSections.flatMap(({ questions }) => questions.map(({ question_text }) => question_text))).toEqual(
      peiiStatements.flatMap((statement) => [statement, statement]),
    )
    expect(peiiSections.flatMap(({ questions }) => questions).every(({ question_type, options, config }) =>
      question_type === "scale" &&
      options?.join("|") === PEII_SCALE_LABELS.join("|") &&
      config?.min === 1 && config.max === 5 &&
      config.min_label === undefined && config.max_label === undefined,
    )).toBe(true)

    expect(GRADUATE_TRACER_STUDY_SURVEY.sections[7]).toMatchObject({
      title: "IV. Feedback and Reflection",
      questions: [
        { question_text: "What specific technical or soft skills do you wish were given more focus at PLP?", question_type: "text", options: null },
        { question_text: "What improvements should PLP implement to better support students?", question_type: "text", options: null },
        { question_text: "What message would you like to share with Pasig City leaders regarding PLP?", question_type: "text", options: null },
      ],
    })
  })

  it("builds an eight-section, 25-question payload with every question required", () => {
    const payload = createGraduateTracerStudySurveyPayload(() => "client-id")
    const questions = payload.sections.flatMap(({ questions: sectionQuestions }) => sectionQuestions)

    expect(payload.title).toBe(GRADUATE_TRACER_STUDY_SURVEY_TITLE)
    expect(payload.description).toBe(GRADUATE_TRACER_STUDY_SURVEY_DESCRIPTION)
    expect(payload.sections).toHaveLength(8)
    expect(questions).toHaveLength(25)
    expect(questions.every(({ is_required }) => is_required)).toBe(true)
    expect(questions.find(({ question_text }) => question_text === "Degree Program Category:")?.config).toEqual({
      presentation: "dropdown",
    })
    expect(payload.sections.every(({ client_id }) => client_id === "client-id")).toBe(true)
  })
})
