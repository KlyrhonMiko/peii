import {
  Type,
  ListChecks,
  Star,
  Circle,
  Hash,
  ArrowUpDown,
  Table,
  Calendar,
  ToggleLeft,
} from "lucide-react"
import type { SurveyStatus } from "@/lib/surveys"

export const GRADUATE_TRACER_STUDY_SURVEY_TITLE = "GRADUATE TRACER STUDY SURVEY"

export const GRADUATE_TRACER_STUDY_PURPOSE =
  "This survey aims to assess the outcomes of graduates from Pamantasan ng Lungsod ng Pasig (PLP) and determine how their education has contributed to their employment, financial stability, personal development, and community engagement. The results will be used to compute the Pasig Education Impact Index (PEII) and to support the continuous improvement of educational programs and policies."

export const GRADUATE_TRACER_STUDY_INSTRUCTIONS =
  "Please answer the following questions honestly and completely."

export const GRADUATE_TRACER_STUDY_DATA_PRIVACY_NOTICE =
  "In accordance with the Data Privacy Act of 2012 (Republic Act No. 10173), all personal information collected will be treated with strict confidentiality. The data will be used solely for academic and research purposes. Participation in this survey is voluntary, and you may choose to withdraw at any time without any penalty. All information will be securely stored and protected. You may also visit https://privacy.gov.ph/data-privacy-act/ to learn more about your rights."

export const GRADUATE_TRACER_STUDY_REQUIRED_FIELDS_NOTE =
  "Required fields are marked with an asterisk (*)"

export const GRADUATE_TRACER_STUDY_SURVEY_DESCRIPTION = [
  `Purpose: ${GRADUATE_TRACER_STUDY_PURPOSE}`,
  `Instructions: ${GRADUATE_TRACER_STUDY_INSTRUCTIONS}`,
  `Data Privacy Notice: ${GRADUATE_TRACER_STUDY_DATA_PRIVACY_NOTICE}`,
  GRADUATE_TRACER_STUDY_REQUIRED_FIELDS_NOTE,
].join("\n\n")

export const PEII_SCALE_LABELS = [
  "Strongly Disagree",
  "Disagree",
  "Neutral",
  "Agree",
  "Strongly Agree",
]

type SurveyQuestionDefinition = {
  question_text: string
  question_type: string
  options: string[] | null
  config: SurveyQuestionConfig | null
}

type SurveyPhase = 1 | 2

type SurveyQuestionConfig = Record<string, unknown> & {
  survey_phase: SurveyPhase
  min?: number
  max?: number
  min_label?: string
  max_label?: string
}

type SurveySectionDefinition = {
  title: string
  description: string
  questions: SurveyQuestionDefinition[]
}

function questionConfig(
  survey_phase: SurveyPhase,
  config: Omit<SurveyQuestionConfig, "survey_phase"> = {},
): SurveyQuestionConfig {
  return { ...config, survey_phase }
}

function singleChoiceQuestion(
  question_text: string,
  options: string[],
  survey_phase: SurveyPhase,
  config: Omit<SurveyQuestionConfig, "survey_phase"> = {},
): SurveyQuestionDefinition {
  return {
    question_text,
    question_type: "single_choice",
    options,
    config: questionConfig(survey_phase, config),
  }
}

function textQuestion(question_text: string, survey_phase: SurveyPhase): SurveyQuestionDefinition {
  return {
    question_text,
    question_type: "text",
    options: null,
    config: questionConfig(survey_phase),
  }
}

function scaleQuestion(question_text: string, survey_phase: SurveyPhase): SurveyQuestionDefinition {
  return {
    question_text,
    question_type: "scale",
    options: [...PEII_SCALE_LABELS],
    config: questionConfig(survey_phase, { min: 1, max: 5 }),
  }
}

export const PEII_COMMON_DESCRIPTION =
  "Instruction: Rate each statement using the scale below based on your condition during two specific timeframes:\nYour situation specifically during your final year of residency as a student at PLP. This serves as your baseline for transformation\nNote: These responses are essential to compute your Individual-Level Improvement and the overall Pasig Education Impact Index (PEII).\nScale: 1 = Strongly Disagree | 2 = Disagree | 3 = Neutral | 4 = Agree | 5 = Strongly Agree"

function peiiSection(
  title: string,
  survey_phase: SurveyPhase,
  statements: string[],
): SurveySectionDefinition {
  return {
    title,
    description: PEII_COMMON_DESCRIPTION,
    questions: statements.map((question_text) => scaleQuestion(question_text, survey_phase)),
  }
}

function createPeiiSections(
  survey_phase: SurveyPhase,
  sectionLabel: "II-A" | "II-B",
): SurveySectionDefinition[] {
  return [
    peiiSection(
      `SECTION ${sectionLabel} - PEII Core Impact Measurement: A. Employability and Economic Mobility`,
      survey_phase,
      [
        "I have/had a stable source of income or employment.",
        "My job/business is/was aligned with my college degree or skills.",
        "I am/was able to obtain employment opportunities when needed.",
        "My income is/was sufficient to support my basic needs.",
        "I have/had opportunities for career growth and advancement.",
      ],
    ),
    peiiSection(
      `SECTION ${sectionLabel} - PEII Core Impact Measurement: B. Family Upliftment and Financial Stability`,
      survey_phase,
      [
        "I contribute/contributed financially to my household expenses.",
        "My financial situation helps/helped improve my family’s living condition.",
        "I am/was able to support the education of family members.",
        "I have/had savings or an emergency fund for financial security.",
        "My financial responsibilities are/were manageable without excessive burden.",
      ],
    ),
    peiiSection(
      `SECTION ${sectionLabel} - PEII Core Impact Measurement: C. Personal Development and Life Quality`,
      survey_phase,
      [
        "I feel/felt confident in my abilities and decisions.",
        "I demonstrate/demonstrated leadership skills when needed.",
        "I communicate/communicated effectively in personal and professional settings.",
        "I have/had clear career goals and direction.",
        "I am/was satisfied with my overall life situation.",
      ],
    ),
    peiiSection(
      `SECTION ${sectionLabel} - PEII Core Impact Measurement: D. Civic Engagement and Community Contribution`,
      survey_phase,
      [
        "I participate/participated in community or civic activities.",
        "I volunteer/volunteered my time or resources to help others.",
        "I mentor/mentored or guide/guided others in my community.",
        "I contribute/contributed my skills to community development.",
        "I feel/felt responsible for contributing to society.",
      ],
    ),
    peiiSection(
      `SECTION ${sectionLabel} - PEII Core Impact Measurement: E. Government Trust and LGU Support Valuation`,
      survey_phase,
      [
        "I am/was aware of education programs provided by the Pasig LGU.",
        "I perceive/perceived that the local government supports education initiatives.",
        "I trust/trusted the local government in delivering education-related services.",
        "I believe/believed that public investment in education benefits society.",
        "I value/valued the educational opportunities provided by PLP.",
      ],
    ),
  ]
}

function feedbackSection(survey_phase: SurveyPhase, sectionLabel: "IV-A" | "IV-B"): SurveySectionDefinition {
  return {
    title: `${sectionLabel}. Feedback and Reflection`,
    description: "",
    questions: [
      textQuestion("What specific technical or soft skills do you wish were given more focus at PLP?", survey_phase),
      textQuestion("What improvements should PLP implement to better support students?", survey_phase),
      textQuestion("What message would you like to share with Pasig City leaders regarding PLP?", survey_phase),
    ],
  }
}

export const GRADUATE_TRACER_STUDY_SURVEY: {
  title: string
  description: string
  sections: SurveySectionDefinition[]
} = {
  title: GRADUATE_TRACER_STUDY_SURVEY_TITLE,
  description: GRADUATE_TRACER_STUDY_SURVEY_DESCRIPTION,
  sections: [
    {
      title: "Intro",
      description: "",
      questions: [
        singleChoiceQuestion(
          "Consent Statement: I have read and understood the Data Privacy Statement and voluntarily agree to participate in this survey.",
          ["Yes", "No"],
          1,
        ),
      ],
    },
    {
      title: "SECTION I : RESPONDENT'S PROFILE",
      description: "",
      questions: [
        textQuestion("Name*: Surname, First name, Middle Initial (e.g. Dela Cruz, Juan A.)", 1),
        textQuestion("PLP Email Address: (@plpasig.edu.ph)", 1),
        textQuestion("Non-PLP Email Address: (GMail, Yahoo, Etc.)", 1),
        textQuestion("Contact Number/s:", 1),
        singleChoiceQuestion("Year Graduated:", ["2023", "2024", "2025", "2026"], 1),
        singleChoiceQuestion(
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
          1,
          { presentation: "dropdown" },
        ),
        singleChoiceQuestion("Sex Assigned At Birth:", ["Male", "Female"], 1),
        singleChoiceQuestion("Civil Status:", ["Single", "Married", "Separated", "Widowed"], 1),
        singleChoiceQuestion(
          "First-generation graduate in the family: (You are the first in the immediate family to graduate from a college or university.)",
          ["Yes", "No"],
          1,
        ),
        singleChoiceQuestion("Current Location:", ["Pasig City", "NCR (Outside Pasig)", "Outside NCR", "Overseas / Abroad"], 1),
      ],
    },
    ...createPeiiSections(1, "II-A"),
    feedbackSection(1, "IV-A"),
    ...createPeiiSections(2, "II-B"),
    feedbackSection(2, "IV-B"),
  ],
}

export function createGraduateTracerStudySurveyPayload(createId: () => string) {
  return {
    title: GRADUATE_TRACER_STUDY_SURVEY.title,
    description: GRADUATE_TRACER_STUDY_SURVEY.description,
    target_cohort: "All Alumni",
    status: "Inactive" as const,
    sections: GRADUATE_TRACER_STUDY_SURVEY.sections.map((section) => ({
      client_id: createId(),
      title: section.title,
      description: section.description,
      questions: section.questions.map((question) => ({
        client_id: createId(),
        question_text: question.question_text,
        question_type: question.question_type,
        options: question.options,
        config: question.config,
        is_required: true,
      })),
    })),
  }
}

export const QUESTION_TYPES = [
  { value: "single_choice", label: "Single Choice", icon: Circle },
  { value: "multiple_choice", label: "Multiple Choice", icon: ListChecks },
  { value: "text", label: "Text Response", icon: Type },
  { value: "number", label: "Number", icon: Hash },
  { value: "scale", label: "Scale (1-5)", icon: Star },
  { value: "ranking", label: "Ranking", icon: ArrowUpDown },
  { value: "matrix", label: "Matrix", icon: Table },
  { value: "datetime", label: "Date/Time", icon: Calendar },
  { value: "boolean", label: "Yes/No", icon: ToggleLeft },
] as const

export const SURVEY_STATUSES: SurveyStatus[] = ["Inactive", "Active", "Closed"]

export const SURVEY_PERMISSIONS = {
  manage: "surveys.manage",
  distributionManage: "survey_distributions.manage",
  readAggregates: "survey_responses.read_aggregates",
  readRaw: "survey_responses.read_raw",
  readIdentity: "survey_responses.read_identity",
  export: "survey_responses.export",
  erase: "survey_responses.erase",
} as const
