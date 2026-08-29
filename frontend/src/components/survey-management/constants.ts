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

type SurveyQuestionConfig = Record<string, unknown> & {
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

function textQuestion(question_text: string): SurveyQuestionDefinition {
  return { question_text, question_type: "text", options: null, config: null }
}

function singleChoiceQuestion(
  question_text: string,
  options: string[],
  config: SurveyQuestionConfig | null = null,
): SurveyQuestionDefinition {
  return { question_text, question_type: "single_choice", options, config }
}

function scaleQuestion(question_text: string): SurveyQuestionDefinition {
  return {
    question_text,
    question_type: "scale",
    options: [...PEII_SCALE_LABELS],
    config: { min: 1, max: 5 },
  }
}

export const PEII_COMMON_DESCRIPTION =
  "Instruction: Rate each statement using the scale below based on your condition during two specific timeframes:\nYour situation specifically during your final year of residency as a student at PLP. This serves as your baseline for transformation.\nNote: These responses are essential to compute your Individual-Level Improvement and the overall Pasig Education Impact Index (PEII).\nScale: 1 = Strongly Disagree | 2 = Disagree | 3 = Neutral | 4 = Agree | 5 = Strongly Agree"

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
        textQuestion("Email: Record <email> as the email to be included with my response"),
        singleChoiceQuestion(
          "Consent Statement: I have read and understood the Data Privacy Statement and voluntarily agree to participate in this survey.",
          ["Yes", "No"],
        ),
      ],
    },
    {
      title: "SECTION I : RESPONDENT'S PROFILE",
      description: "",
      questions: [
        textQuestion("Name*: Surname, First name, Middle Initial (e.g. Dela Cruz, Juan A.)"),
        textQuestion("PLP Email Address: (@plpasig.edu.ph)"),
        textQuestion("Non-PLP Email Address: (GMail, Yahoo, Etc.)"),
        textQuestion("Contact Number/s:"),
        singleChoiceQuestion("Year Graduated:", ["2023", "2024", "2025", "2026"]),
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
          { presentation: "dropdown" },
        ),
        singleChoiceQuestion("Sex Assigned At Birth:", ["Male", "Female"]),
        singleChoiceQuestion("Civil Status:", ["Single", "Married", "Separated", "Widowed"]),
        singleChoiceQuestion(
          "First-generation graduate in the family: (You are the first in the immediate family to graduate from a college or university.)",
          ["Yes", "No"],
        ),
        singleChoiceQuestion("Current Location:", ["Pasig City", "NCR (Outside Pasig)", "Outside NCR", "Overseas / Abroad"]),
      ],
    },
    {
      title: "SECTION II - PEII Core Impact Measurement: A. Employability and Economic Mobility",
      description: PEII_COMMON_DESCRIPTION,
      questions: [
        scaleQuestion("I have/had a stable source of income or employment."),
        scaleQuestion("I have/had a stable source of income or employment."),
      ],
    },
    {
      title: "SECTION II - PEII Core Impact Measurement: B. Family Upliftment and Financial Stability",
      description: PEII_COMMON_DESCRIPTION,
      questions: [
        scaleQuestion("I contribute/contributed financially to my household expenses."),
        scaleQuestion("I contribute/contributed financially to my household expenses."),
      ],
    },
    {
      title: "SECTION II - PEII Core Impact Measurement: C. Personal Development and Life Quality",
      description: PEII_COMMON_DESCRIPTION,
      questions: [
        scaleQuestion("I feel/felt confident in my abilities and decisions."),
        scaleQuestion("I feel/felt confident in my abilities and decisions."),
      ],
    },
    {
      title: "SECTION II - PEII Core Impact Measurement: D. Civic Engagement and Community Contribution",
      description: PEII_COMMON_DESCRIPTION,
      questions: [
        scaleQuestion("I participate/participated in community or civic activities."),
        scaleQuestion("I participate/participated in community or civic activities."),
      ],
    },
    {
      title: "SECTION II - PEII Core Impact Measurement: E. Government Trust and LGU Support Valuation",
      description: PEII_COMMON_DESCRIPTION,
      questions: [
        scaleQuestion("I am/was aware of education programs provided by the Pasig LGU."),
        scaleQuestion("I am/was aware of education programs provided by the Pasig LGU."),
      ],
    },
    {
      title: "IV. Feedback and Reflection",
      description: "",
      questions: [
        textQuestion("What specific technical or soft skills do you wish were given more focus at PLP?"),
        textQuestion("What improvements should PLP implement to better support students?"),
        textQuestion("What message would you like to share with Pasig City leaders regarding PLP?"),
      ],
    },
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
  { value: "scale", label: "Scale", icon: Star },
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
  export: "survey_responses.export",
  erase: "survey_responses.erase",
} as const
