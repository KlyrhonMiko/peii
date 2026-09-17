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
import {
  JOB_CATEGORY_OPTIONS,
  JOB_CATEGORY_OTHER_OPTIONS,
  JOB_INDUSTRIES,
  JOB_INDUSTRY_CATEGORIES,
  JOB_TITLES,
  PASIG_BARANGAYS,
} from "./graduate-tracer-options"

export const GRADUATE_TRACER_STUDY_SURVEY_TITLE = "GRADUATE TRACER STUDY SURVEY"
export const GRADUATE_TRACER_STUDY_TEMPLATE_VERSION = "survey-questionnaire-2026-09-16"

export const GRADUATE_TRACER_STUDY_PURPOSE =
  "This survey aims to assess the outcomes of graduates from Pamantasan ng Lungsod ng Pasig (PLP) and determine how their education has contributed to their employment, financial stability, personal development, and community engagement. The results will be used to compute the Pasig Education Impact Index (PEII) and to support the continuous improvement of educational programs and policies."

export const GRADUATE_TRACER_STUDY_INSTRUCTIONS =
  "Please answer the following questions honestly and completely."

export const GRADUATE_TRACER_STUDY_REQUIRED_FIELDS_NOTE =
  "Required fields are marked with an asterisk (*)"

export const GRADUATE_TRACER_STUDY_SURVEY_DESCRIPTION = [
  `Purpose: ${GRADUATE_TRACER_STUDY_PURPOSE}`,
  `Instructions: ${GRADUATE_TRACER_STUDY_INSTRUCTIONS}`,
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

function textQuestion(
  question_text: string,
  survey_phase: SurveyPhase,
  config: Omit<SurveyQuestionConfig, "survey_phase"> = {},
): SurveyQuestionDefinition {
  return {
    question_text,
    question_type: "text",
    options: null,
    config: questionConfig(survey_phase, config),
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
      `SECTION ${sectionLabel} - PEII Core Impact Measurement: E. Governance Trust and LGU Support Valuation`,
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

function feedbackSection(survey_phase: SurveyPhase, sectionLabel: "IV-A" | "IV-B" | "IV"): SurveySectionDefinition {
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

function employmentSection(): SurveySectionDefinition {
  return {
    title: "SECTION I-B : POST-GRADUATION EMPLOYMENT PROFILE",
    description: "Answer the following questions about your employment and first job.",
    questions: [
      singleChoiceQuestion("What is your current employment status?", [
        "Employed full-time", "Employed part-time", "Self-employed / Business owner", "Unemployed - seeking work",
      ], 2),
      singleChoiceQuestion("What type of employment do you have?", [
        "Contractual", "Permanent", "Freelance", "Project-based",
      ], 2),
      singleChoiceQuestion("Which sector do you work in?", ["Private", "Public"], 2),
      singleChoiceQuestion("What is your job level?", [
        "Entry-Level", "Junior Staff", "Senior-Level", "Supervisory Level", "Managerial Level",
      ], 2),
      singleChoiceQuestion("Which industry do you work in?", JOB_INDUSTRIES, 2, {
        question_key: "job_industry",
        presentation: "dropdown",
      }),
      singleChoiceQuestion("Which category best describes your work in that industry?", JOB_CATEGORY_OPTIONS, 2, {
        question_key: "job_category",
        presentation: "dropdown",
        options_by_answer: { question_key: "job_industry", choices: JOB_INDUSTRY_CATEGORIES },
      }),
      textQuestion("If you selected Other (specify), what category best describes your work?", 2, {
        visible_when: { question_key: "job_category", one_of: JOB_CATEGORY_OTHER_OPTIONS },
      }),
      singleChoiceQuestion("Which role or job title best describes your work?", [...JOB_TITLES], 2, {
        question_key: "job_role",
        presentation: "searchable_dropdown",
      }),
      textQuestion("What is your job title or role? (Other, please specify)", 2, {
        visible_when: { question_key: "job_role", equals: "Other job title (specify)" },
      }),
      singleChoiceQuestion("Where do you work?", [
        "Pasig City", "NCR (Outside Pasig)", "Outside NCR", "Overseas / Abroad",
      ], 2),
      singleChoiceQuestion("What is your monthly income range?", [
        "Below ₱15,000", "₱15,001 – ₱25,000", "₱25,001 – ₱40,000", "₱40,001 – ₱60,000", "Above ₱60,000",
      ], 2),
      singleChoiceQuestion("How related is your current job to your college degree?", [
        "Not related", "Slightly related", "Moderately related", "Highly related",
      ], 2),
      singleChoiceQuestion("How difficult was it to find your first job after graduation?", [
        "Very Easy", "Easy", "Neutral", "Difficult", "Very Difficult",
      ], 2),
      singleChoiceQuestion("How long did it take to find your first job after graduation?", [
        "< 3 months", "3-6 months", "6-12 months", "> 1 year", "Still unemployed",
      ], 2),
      singleChoiceQuestion("How did you obtain your first job?", [
        "Internship", "Referral", "Walk-In", "Online application", "Business  / self-employment", "Job Fair",
      ], 2),
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
        singleChoiceQuestion("Current Location:", ["Pasig City", "NCR (Outside Pasig)", "Outside NCR", "Overseas / Abroad"], 1, {
          question_key: "current_location",
        }),
        singleChoiceQuestion("If you currently live in Pasig City, which barangay do you live in?", [...PASIG_BARANGAYS], 1, {
          visible_when: { question_key: "current_location", equals: "Pasig City" },
          presentation: "dropdown",
        }),
      ],
    },
    ...createPeiiSections(1, "II-A"),
    feedbackSection(1, "IV"),
    employmentSection(),
    ...createPeiiSections(2, "II-B"),
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

export function createGraduateTracerStudyTemplatePayload(createId: () => string) {
  const payload = createGraduateTracerStudySurveyPayload(createId)
  const consentQuestion = payload.sections[0]?.questions[0]
  if (!consentQuestion?.config) throw new Error("Graduate tracer questionnaire is missing its consent question configuration.")
  consentQuestion.config = {
    ...consentQuestion.config,
    template_definition_version: GRADUATE_TRACER_STUDY_TEMPLATE_VERSION,
  }
  return { ...payload, is_template: true }
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
  readAggregates: "survey_responses.read_aggregates",
  readRaw: "survey_responses.read_raw",
  readIdentity: "survey_responses.read_identity",
  export: "survey_responses.export",
  import: "survey_responses.import",
  erase: "survey_responses.erase",
} as const
