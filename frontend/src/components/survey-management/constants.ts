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

export const ALUMNI_QUESTIONNAIRE = [
  {
    title: "Employment Outcomes",
    description: "Tell us about your current employment and career situation since graduating.",
    questions: [
      {
        question_text: "What is your current employment status?",
        question_type: "single_choice",
        options: ["Full-time", "Part-time", "Self-employed", "Freelance / Contract", "Pursuing further studies", "Unemployed"],
        config: null,
      },
      {
        question_text: "How long did it take you to obtain your first job after graduation?",
        question_type: "single_choice",
        options: ["Before graduation", "Less than 3 months", "3–6 months", "6–12 months", "More than 1 year"],
        config: null,
      },
      {
        question_text: "What is your current monthly income range?",
        question_type: "single_choice",
        options: ["No current income", "Less than ₱20,000", "₱20,000–₱39,999", "₱40,000–₱59,999", "₱60,000–₱79,999", "₱80,000 or above", "Prefer not to answer"],
        config: null,
      },
      {
        question_text: "Which industry or sector do you currently work in?",
        question_type: "single_choice",
        options: ["Information and Communications Technology (ICT)", "Education", "Government / Public Administration", "Healthcare and Social Services", "Banking, Finance, and Insurance", "Professional and Business Services", "Manufacturing", "Retail and Wholesale Trade", "Hospitality, Tourism, and Food Services", "Construction and Engineering", "Transportation and Logistics", "Agriculture, Forestry, and Fisheries", "Media, Arts, and Entertainment", "Other", "Not currently employed"],
        config: null,
      },
      {
        question_text: "Optional: Please briefly describe any challenges or experiences encountered while seeking employment after graduation.",
        question_type: "text",
        options: null,
        config: null,
      },
    ],
  },
  {
    title: "Degree-to-Career Alignment & Institutional Factors",
    description: "Help us understand how well your degree aligns with your career path.",
    questions: [
      {
        question_text: "How related is your current employment to your degree program?",
        question_type: "scale",
        options: ["Not applicable", "Not related", "Slightly related", "Moderately related", "Highly related"],
        config: { min: 1, max: 5, min_label: "Not applicable", max_label: "Highly related" },
      },
      {
        question_text: "To what extent did your internship/OJT prepare you for employment?",
        question_type: "scale",
        options: ["Not helpful", "Slightly helpful", "Helpful", "Very helpful"],
        config: { min: 1, max: 4, min_label: "Not helpful", max_label: "Very helpful" },
      },
      {
        question_text: "Which skills acquired during your university studies do you regularly utilize in your current work? (Select all that apply)",
        question_type: "multiple_choice",
        options: ["Technical Skills", "Communication", "Critical Thinking", "Teamwork", "Leadership", "Problem Solving", "Research", "Digital Literacy", "Other"],
        config: null,
      },
      {
        question_text: "Optional: Please note any specific subjects, skills, or experiences that have proven particularly beneficial or ineffective in your career.",
        question_type: "text",
        options: null,
        config: null,
      },
    ],
  },
  {
    title: "Socioeconomic Impact",
    description: "Share how your education has affected your financial and daily life.",
    questions: [
      {
        question_text: "How would you describe your financial stability progression since graduation?",
        question_type: "single_choice",
        options: ["Significant positive progression", "Steady, gradual progression", "Stabilizing / No major changes yet", "Experiencing financial setbacks"],
        config: null,
      },
      {
        question_text: "Which of the following best describes your current financial stage?",
        question_type: "single_choice",
        options: ["Primary financial provider for my family / household", "Covering my own expenses and actively contributing to family expenses", "Covering my own living expenses", "Currently working toward personal financial independence", "Prefer not to answer"],
        config: null,
      },
      {
        question_text: "How would you characterize your current income capacity regarding daily expenses?",
        question_type: "single_choice",
        options: ["Covers basic needs with room for savings or investments", "Covers basic needs with limited disposable income", "Strictly covers essential needs", "Currently insufficient to cover all basic needs", "Prefer not to answer"],
        config: null,
      },
      {
        question_text: "What is your primary mode of transportation for work or daily activities?",
        question_type: "single_choice",
        options: ["Personal vehicle (car)", "Personal motorcycle", "Public transportation (e.g., jeepney, bus, MRT/LRT, UV Express)", "Ride-hailing services (e.g., Grab, Angkas)", "I walk or cycle", "Not applicable (Work from home or remote)"],
        config: null,
      },
      {
        question_text: "Optional: If your lifestyle has changed since graduation, please briefly describe the most significant shift.",
        question_type: "text",
        options: null,
        config: null,
      },
    ],
  },
  {
    title: "Personal Growth & Educational Effectiveness",
    description: "Reflect on how the university experience shaped your personal and professional life.",
    questions: [
      {
        question_text: "How has your overall quality of life changed since graduation?",
        question_type: "scale",
        options: ["Much worse", "Worse", "No change", "Better", "Much better"],
        config: { min: 1, max: 5, min_label: "Much worse", max_label: "Much better" },
      },
      {
        question_text: "My university education adequately prepared me for professional employment.",
        question_type: "scale",
        options: ["Strongly disagree", "Disagree", "Agree", "Strongly agree"],
        config: { min: 1, max: 4, min_label: "Strongly disagree", max_label: "Strongly agree" },
      },
      {
        question_text: "The curriculum developed skills directly applicable to my career.",
        question_type: "scale",
        options: ["Strongly disagree", "Disagree", "Agree", "Strongly agree"],
        config: { min: 1, max: 4, min_label: "Strongly disagree", max_label: "Strongly agree" },
      },
      {
        question_text: "Overall, my university education has had a positive impact on my life after graduation.",
        question_type: "scale",
        options: ["Strongly disagree", "Disagree", "Agree", "Strongly agree"],
        config: { min: 1, max: 4, min_label: "Strongly disagree", max_label: "Strongly agree" },
      },
      {
        question_text: "The faculty provided effective mentoring and support during my studies.",
        question_type: "scale",
        options: ["Strongly disagree", "Disagree", "Agree", "Strongly agree"],
        config: { min: 1, max: 4, min_label: "Strongly disagree", max_label: "Strongly agree" },
      },
      {
        question_text: "My involvement in student organizations contributed to my professional development.",
        question_type: "scale",
        options: ["Strongly disagree", "Disagree", "Agree", "Strongly agree", "Not applicable"],
        config: { min: 1, max: 5, min_label: "Strongly disagree", max_label: "Not applicable" },
      },
      {
        question_text: "Overall, how satisfied are you with the quality of your university education?",
        question_type: "scale",
        options: ["Very dissatisfied", "Dissatisfied", "Satisfied", "Very satisfied"],
        config: { min: 1, max: 4, min_label: "Very dissatisfied", max_label: "Very satisfied" },
      },
      {
        question_text: "Optional: What is one specific improvement the university could implement to better prepare future graduates?",
        question_type: "text",
        options: null,
        config: null,
      },
    ],
  },
]

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
