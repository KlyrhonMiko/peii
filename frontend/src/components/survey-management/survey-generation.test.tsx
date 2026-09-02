import { describe, expect, it } from "vitest"

import {
  GRADUATE_TRACER_STUDY_SURVEY,
  GRADUATE_TRACER_STUDY_SURVEY_DESCRIPTION,
  GRADUATE_TRACER_STUDY_SURVEY_TITLE,
  PEII_COMMON_DESCRIPTION,
  PEII_SCALE_LABELS,
  createGraduateTracerStudySurveyPayload,
} from "./constants"
import { validateSurveyStructure } from "@/lib/survey-structure"

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
    expect(GRADUATE_TRACER_STUDY_SURVEY.sections).toHaveLength(14)
    expect(GRADUATE_TRACER_STUDY_SURVEY.sections[0]).toMatchObject({
      title: "Intro",
      questions: [
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

    const phaseOneSections = GRADUATE_TRACER_STUDY_SURVEY.sections.slice(0, 8)
    const phaseTwoSections = GRADUATE_TRACER_STUDY_SURVEY.sections.slice(8)
    const peiiSections = phaseOneSections.slice(2, 7)
    expect(peiiSections.map(({ title }) => title)).toEqual([
      "SECTION II-A - PEII Core Impact Measurement: A. Employability and Economic Mobility",
      "SECTION II-A - PEII Core Impact Measurement: B. Family Upliftment and Financial Stability",
      "SECTION II-A - PEII Core Impact Measurement: C. Personal Development and Life Quality",
      "SECTION II-A - PEII Core Impact Measurement: D. Civic Engagement and Community Contribution",
      "SECTION II-A - PEII Core Impact Measurement: E. Government Trust and LGU Support Valuation",
    ])
    const expectedPeiiDescription =
      "Instruction: Rate each statement using the scale below based on your condition during two specific timeframes:\nYour situation specifically during your final year of residency as a student at PLP. This serves as your baseline for transformation\nNote: These responses are essential to compute your Individual-Level Improvement and the overall Pasig Education Impact Index (PEII).\nScale: 1 = Strongly Disagree | 2 = Disagree | 3 = Neutral | 4 = Agree | 5 = Strongly Agree"
    expect(PEII_COMMON_DESCRIPTION).toBe(expectedPeiiDescription)
    expect(peiiSections.map(({ description }) => description)).toEqual(
      Array.from({ length: 5 }, () => expectedPeiiDescription),
    )

    const peiiStatements = [
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
    expect(peiiSections.map(({ questions }) => questions.map(({ question_text }) => question_text))).toEqual(
      peiiStatements,
    )
    expect(new Set(peiiStatements.flat()).size).toBe(25)
    expect(peiiSections.flatMap(({ questions }) => questions).every(({ question_type, options, config }) =>
      question_type === "scale" &&
      options?.join("|") === PEII_SCALE_LABELS.join("|") &&
      config?.min === 1 && config.max === 5 &&
      config.survey_phase === 1 &&
      config.min_label === undefined && config.max_label === undefined,
    )).toBe(true)

    expect(phaseOneSections[7]).toMatchObject({
      title: "IV-A. Feedback and Reflection",
      questions: [
        { question_text: "What specific technical or soft skills do you wish were given more focus at PLP?", question_type: "text", options: null },
        { question_text: "What improvements should PLP implement to better support students?", question_type: "text", options: null },
        { question_text: "What message would you like to share with Pasig City leaders regarding PLP?", question_type: "text", options: null },
      ],
    })

    expect(phaseTwoSections.map(({ title }) => title)).toEqual([
      "SECTION II-B - PEII Core Impact Measurement: A. Employability and Economic Mobility",
      "SECTION II-B - PEII Core Impact Measurement: B. Family Upliftment and Financial Stability",
      "SECTION II-B - PEII Core Impact Measurement: C. Personal Development and Life Quality",
      "SECTION II-B - PEII Core Impact Measurement: D. Civic Engagement and Community Contribution",
      "SECTION II-B - PEII Core Impact Measurement: E. Government Trust and LGU Support Valuation",
      "IV-B. Feedback and Reflection",
    ])
    expect(phaseTwoSections.slice(0, 5).map(({ questions }) => questions.map(({ question_text }) => question_text))).toEqual(
      peiiSections.map(({ questions }) => questions.map(({ question_text }) => question_text)),
    )
    expect(phaseTwoSections[5]?.questions.map(({ question_text }) => question_text)).toEqual(
      phaseOneSections[7]?.questions.map(({ question_text }) => question_text),
    )
    expect(phaseOneSections.flatMap(({ questions }) => questions).every(({ config }) => config?.survey_phase === 1)).toBe(true)
    expect(phaseTwoSections.flatMap(({ questions }) => questions).every(({ config }) => config?.survey_phase === 2)).toBe(true)
  })

  it("builds a fourteen-section, 67-question payload with 39 phase-one and 28 phase-two questions", () => {
    const payload = createGraduateTracerStudySurveyPayload(() => "client-id")
    const questions = payload.sections.flatMap(({ questions: sectionQuestions }) => sectionQuestions)

    expect(payload.title).toBe(GRADUATE_TRACER_STUDY_SURVEY_TITLE)
    expect(payload.description).toBe(GRADUATE_TRACER_STUDY_SURVEY_DESCRIPTION)
    expect(payload.sections).toHaveLength(14)
    expect(questions).toHaveLength(67)
    const phaseOneQuestions = payload.sections.slice(0, 8).flatMap(({ questions: sectionQuestions }) => sectionQuestions)
    const phaseTwoQuestions = payload.sections.slice(8).flatMap(({ questions: sectionQuestions }) => sectionQuestions)
    expect(phaseOneQuestions).toHaveLength(39)
    expect(phaseTwoQuestions).toHaveLength(28)
    expect(questions.every(({ is_required }) => is_required)).toBe(true)
    expect(phaseOneQuestions.every(({ config }) => config?.survey_phase === 1)).toBe(true)
    expect(phaseTwoQuestions.every(({ config }) => config?.survey_phase === 2)).toBe(true)
    expect(questions.find(({ question_text }) => question_text === "Degree Program Category:")?.config).toEqual({
      presentation: "dropdown",
      survey_phase: 1,
    })
    expect(payload.sections.every(({ client_id }) => client_id === "client-id")).toBe(true)
  })

  it("produces a structure that passes the pre-save survey validator", () => {
    const payload = createGraduateTracerStudySurveyPayload(() => "client-id")
    const structure = payload.sections.map((section) => ({
      title: section.title,
      questions: section.questions.map((question) => ({
        type: question.question_type,
        options: question.options,
        config: question.config,
      })),
    }))
    expect(validateSurveyStructure(structure)).toBeNull()
  })
})
