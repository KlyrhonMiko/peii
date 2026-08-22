"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import type { DragEvent } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Plus,
  Eye,

  Trash,
  FileText,
  Users,
  Calendar,
  Type,
  ListChecks,
  Star,
  ChevronDown,
  ClipboardList,
  X,
  Check,
  Pencil,
  Circle,
  Hash,
  ArrowUpDown,
  Table,
  Upload,
  ToggleLeft,
  Loader2,
  Share2,
  Copy,
  Link,
  CheckCircle2,
  ArrowUp,
  ArrowDown,
  GripVertical,
} from "lucide-react"
import { cn, formatDate } from "@/lib/utils"
import {
  fetchSurveys,
  fetchSurvey,
  createSurvey,
  updateSurvey,
  deleteSurvey,
  replaceSurveyStructure,
  createDistribution,
  fetchDistributions,
  fetchResponses,
  getScaleOptions,
} from "@/lib/surveys"
import type { Survey, SurveyQuestion, SurveySection, Distribution, SurveyResponse, SurveyStatus } from "@/lib/surveys"

const ALUMNI_QUESTIONNAIRE = [
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

const QUESTION_TYPES = [
  { value: "single_choice", label: "Single Choice", icon: Circle },
  { value: "multiple_choice", label: "Multiple Choice", icon: ListChecks },
  { value: "text", label: "Text Response", icon: Type },
  { value: "number", label: "Number", icon: Hash },
  { value: "scale", label: "Scale", icon: Star },
  { value: "ranking", label: "Ranking", icon: ArrowUpDown },
  { value: "matrix", label: "Matrix", icon: Table },
  { value: "datetime", label: "Date/Time", icon: Calendar },
  { value: "file", label: "File Upload", icon: Upload },
  { value: "boolean", label: "Yes/No", icon: ToggleLeft },
] as const

const SURVEY_STATUSES: SurveyStatus[] = ["Inactive", "Active", "Closed"]

type ModalState =
  | { type: "create" }
  | { type: "edit"; id: string }
  | { type: "view"; id: string }
  | { type: "settings"; id: string }
  | null

type DragItem =
  | { kind: "section"; id: string }
  | { kind: "question"; sectionId: string; id: string }
  | { kind: "option"; sectionId: string; questionId: string; index: number }
  | { kind: "column"; sectionId: string; questionId: string; index: number }

type PendingAction = {
  type: "load" | "view" | "edit" | "generate" | "save" | "delete" | "distribute"
  surveyId?: string
} | null

function createClientId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `client-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function moveInArray<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) {
    return items
  }
  const next = [...items]
  const [item] = next.splice(from, 1)
  if (item !== undefined) next.splice(to, 0, item)
  return next
}

function aggregateResponses(responses: SurveyResponse[]) {
  const counts: Record<string, Record<string, number>> = {}
  const texts: Record<string, string[]> = {}

  for (const r of responses) {
    if (!r.answers) continue
    for (const [qId, answer] of Object.entries(r.answers)) {
      if (typeof answer === "string" || typeof answer === "number") {
        if (!counts[qId]) counts[qId] = {}
        counts[qId][String(answer)] = (counts[qId][String(answer)] || 0) + 1

        if (!texts[qId]) texts[qId] = []
        texts[qId].push(String(answer))
      } else if (Array.isArray(answer)) {
        for (const item of answer) {
          if (!counts[qId]) counts[qId] = {}
          counts[qId][String(item)] = (counts[qId][String(item)] || 0) + 1
        }
      } else if (typeof answer === "object" && answer !== null) {
        for (const [row, colAnswer] of Object.entries(answer)) {
          const compositeKey = `${row}::${colAnswer}`
          if (!counts[qId]) counts[qId] = {}
          counts[qId][compositeKey] = (counts[qId][compositeKey] || 0) + 1
        }
      }
    }
  }
  return { counts, texts }
}

export default function SurveyPage() {
  const [surveys, setSurveys] = useState<Survey[]>([])
  const [loading, setLoading] = useState(true)
  const [pendingAction, setPendingAction] = useState<Exclude<PendingAction, null> | null>(null)
  const pendingActionRef = useRef<Exclude<PendingAction, null> | null>(null)
  const [requestError, setRequestError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [modalState, setModalState] = useState<ModalState>(null)
  const [viewTab, setViewTab] = useState<"questions" | "responses">("questions")
  const [sections, setSections] = useState<SurveySection[]>([])
  const [originalSections, setOriginalSections] = useState<SurveySection[]>([])
  const [targetCohort, setTargetCohort] = useState("Class of 2024")
  const [cohortOpen, setCohortOpen] = useState(false)
  const [openQuestionSelectId, setOpenQuestionSelectId] = useState<string | null>(null)
  const [statusOpen, setStatusOpen] = useState(false)
  const [surveyStatus, setSurveyStatus] = useState<SurveyStatus>("Inactive")
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [surveyTitle, setSurveyTitle] = useState("")
  const [surveyDescription, setSurveyDescription] = useState("")
  const [showGeneratePreview, setShowGeneratePreview] = useState(false)
  const [distributeSurveyId, setDistributeSurveyId] = useState<string | null>(null)
  const [distributions, setDistributions] = useState<Distribution[]>([])
  const [distLoading, setDistLoading] = useState(false)
  const [surveyResponses, setSurveyResponses] = useState<SurveyResponse[]>([])
  const [dragItem, setDragItem] = useState<DragItem | null>(null)
  
  const { counts: responseCounts, texts: responseTexts } = useMemo(
    () => aggregateResponses(surveyResponses),
    [surveyResponses]
  )
  const [copiedToken, setCopiedToken] = useState<string | null>(null)

  const interactionLocked = pendingAction !== null
  const pendingLabel = pendingAction?.type === "load"
    ? "Loading surveys..."
    : pendingAction?.type === "view"
      ? "Loading survey..."
      : pendingAction?.type === "edit"
        ? "Opening editor..."
        : pendingAction?.type === "generate"
          ? "Generating questionnaire..."
          : pendingAction?.type === "save"
            ? "Saving survey..."
              : pendingAction?.type === "delete"
                ? "Deleting survey..."
                : pendingAction?.type === "distribute"
                  ? "Loading distribution..."
                  : null

  const runExclusive = async <T,>(
    action: Exclude<PendingAction, null>,
    operation: () => Promise<T>,
  ): Promise<T | undefined> => {
    if (pendingActionRef.current !== null) return undefined
    pendingActionRef.current = action
    setPendingAction(action)
    try {
      return await operation()
    } finally {
      if (pendingActionRef.current === action) {
        pendingActionRef.current = null
        setPendingAction(null)
      }
    }
  }

  useEffect(() => {
    let mounted = true
    const load = async () => {
      await runExclusive({ type: "load" }, async () => {
        try {
          const result = await fetchSurveys()
          if (mounted) setSurveys(result.surveys)
        } catch (error) {
          if (mounted) setRequestError(error instanceof Error ? error.message : "We could not load surveys.")
        } finally {
          if (mounted) setLoading(false)
        }
      })
    }
    void load()
    return () => {
      mounted = false
    }
  }, [])

  const handleDelete = async (surveyId: string) => {
    setRequestError(null)
    await runExclusive({ type: "delete", surveyId }, async () => {
      try {
        await deleteSurvey(surveyId)
        setSurveys((prev) => prev.filter((s) => s.surveyId !== surveyId))
      } catch (error) {
        setRequestError(error instanceof Error ? error.message : "We could not delete the survey.")
        throw error
      }
    })
  }

  const handleCloseModal = () => {
    setModalState(null)
    setDragItem(null)
    setSections([])
    setOriginalSections([])
    setSurveyTitle("")
    setSurveyDescription("")
    setTargetCohort("Class of 2024")
    setSurveyStatus("Inactive")
    setViewTab("questions")
  }

  const handleOpenCreate = () => {
    if (interactionLocked) return
    setSurveyTitle("")
    setSurveyDescription("")
    setTargetCohort("Class of 2024")
    setSurveyStatus("Inactive")
    setSections([{
      id: createClientId(),
      title: "",
      description: "",
      orderIndex: 0,
      questions: [],
    }])
    setModalState({ type: "create" })
  }

  const handleOpenView = async (id: string) => {
    const survey = surveys.find((s) => s.id === id)
    if (!survey) return
    setRequestError(null)
    await runExclusive({ type: "view", surveyId: id }, async () => {
      try {
        const full = await fetchSurvey(survey.surveyId)
        setSurveys((prev) => prev.map((s) => (s.id === id ? { ...s, ...full } : s)))
        if (full.responses > 0) {
          const { responses } = await fetchResponses(full.id)
          setSurveyResponses(responses)
        } else {
          setSurveyResponses([])
        }
        setModalState({ type: "view", id })
      } catch (error) {
        setRequestError(error instanceof Error ? error.message : "We could not load the survey.")
      }
    })
  }

  const handleOpenEdit = async (id: string) => {
    const survey = surveys.find((s) => s.id === id)
    if (!survey) return
    setRequestError(null)
    await runExclusive({ type: "edit", surveyId: id }, async () => {
      try {
        const full = await fetchSurvey(survey.surveyId)
        setSurveys((prev) => prev.map((item) => (item.id === full.id ? full : item)))
        setSurveyTitle(full.title)
        setSurveyDescription(full.description ?? "")
        setTargetCohort(full.targetCohort ?? "Class of 2024")
        setSurveyStatus(full.status)
        const loaded = full.sections ?? []
        setOriginalSections(loaded)
        setSections(loaded)
        setModalState({ type: "edit", id })
      } catch (error) {
        setRequestError(error instanceof Error ? error.message : "We could not open the editor.")
      }
    })
  }

  const handleShowGeneratePreview = () => {
    if (interactionLocked) return
    setShowGeneratePreview(true)
  }

  const handleConfirmGenerate = async () => {
    if (generating || interactionLocked) return
    setRequestError(null)
    await runExclusive({ type: "generate" }, async () => {
      setGenerating(true)
      try {
        const created = await createSurvey({
          title: "Alumni Survey Questionnaire",
          description: "This comprehensive survey helps us understand your post-graduation journey — from employment outcomes and degree-to-career alignment to socioeconomic impact and personal growth.",
          target_cohort: "All Alumni",
          status: "Inactive",
        })
        await replaceSurveyStructure(created.id, {
          sections: ALUMNI_QUESTIONNAIRE.map((section) => ({
            client_id: createClientId(),
            title: section.title,
            description: section.description,
            questions: section.questions.map((question) => ({
              client_id: createClientId(),
              question_text: question.question_text,
              question_type: question.question_type,
              options: question.options,
              config: question.config,
              is_required: true,
            })),
          })),
        })
        await updateSurvey(created.surveyId, { status: "Active" })
        const full = await fetchSurvey(created.surveyId)
        setSurveys((prev) => [full, ...prev])
        setShowGeneratePreview(false)
      } catch (error) {
        setRequestError(error instanceof Error ? error.message : "We could not generate the questionnaire.")
      } finally {
        setGenerating(false)
      }
    })
  }

  const performSaveSurvey = async () => {
    if (!surveyTitle.trim() || saving) return
    setSaving(true)
    setSaveError(null)
    let createdSurvey: Survey | null = null
    try {
      if (surveyStatus === "Active") {
        if (sections.length === 0) {
          setSaveError("Add at least one section before activating the survey.")
          return
        }
        const emptySection = sections.find((section) => section.questions.length === 0)
        if (emptySection) {
          setSaveError(
            `Section "${emptySection.title || "Untitled Section"}" must contain at least one question before activating.`,
          )
          return
        }
      }

      if (modalState?.type === "create") {
        const created = await createSurvey({
          title: surveyTitle,
          description: surveyDescription || null,
          target_cohort: targetCohort,
          status: "Inactive",
        })
        const saved = await replaceSurveyStructure(created.id, {
          sections: sections.map((section) => ({
            client_id: section.id,
            id: section.id,
            title: section.title || "Untitled Section",
            description: section.description || null,
            questions: section.questions.map((question) => ({
              client_id: question.id,
              id: question.id,
              question_text: question.text,
              question_type: question.type,
              options: question.options ?? null,
              config: question.config ?? null,
              is_required: question.isRequired ?? true,
            })),
          })),
        })
        setSections(saved.sections ?? [])
        setOriginalSections(saved.sections ?? [])
        setSurveys((prev) => [saved, ...prev.filter((survey) => survey.id !== saved.id)])
        createdSurvey = saved
        await updateSurvey(created.surveyId, {
          title: surveyTitle,
          description: surveyDescription || null,
          target_cohort: targetCohort,
          status: surveyStatus,
        })
        const full = await fetchSurvey(created.surveyId)
        setSurveys((prev) => [full, ...prev.filter((survey) => survey.id !== full.id)])
      } else if (modalState?.type === "edit") {
        const target = surveys.find((s) => s.id === modalState.id)
        if (!target) return

        const structureChanged = JSON.stringify(sections) !== JSON.stringify(originalSections)
        const structureEditable = target.status === "Inactive" && target.responses === 0
        if (structureChanged && !structureEditable) {
          setSaveError("Only inactive surveys with no responses can have their structure edited.")
          return
        }

        if (structureChanged) {
          const removedSectionIds = originalSections
            .filter((original) => !sections.some((section) => section.id === original.id))
            .map((section) => section.id)
          const saved = await replaceSurveyStructure(target.id, {
            sections: sections.map((section) => ({
              client_id: section.id,
              id: section.id,
              title: section.title || "Untitled Section",
              description: section.description || null,
              questions: section.questions.map((question) => ({
                client_id: question.id,
                id: question.id,
                question_text: question.text,
                question_type: question.type,
                options: question.options ?? null,
                config: question.config ?? null,
                is_required: question.isRequired ?? true,
              })),
            })),
            cascade_section_ids: removedSectionIds,
          })
          setSections(saved.sections ?? [])
          setOriginalSections(saved.sections ?? [])
          setSurveys((prev) => prev.map((survey) => survey.id === saved.id ? saved : survey))
        }
        await updateSurvey(target.surveyId, {
          title: surveyTitle,
          description: surveyDescription || null,
          target_cohort: targetCohort,
          status: surveyStatus,
        })
        const refreshed = await fetchSurvey(target.surveyId)
        setSurveys((prev) => prev.map((s) => (s.id === refreshed.id ? refreshed : s)))
      }
      handleCloseModal()
    } catch (error) {
      if (createdSurvey) {
        setModalState({ type: "edit", id: createdSurvey.id })
      }
      setSaveError(
        error instanceof Error
          ? error.message
          : "We could not save the survey. Please try again.",
      )
    } finally {
      setSaving(false)
    }
  }

  const handleSaveSurvey = async () => {
    if (!surveyTitle.trim() || saving || interactionLocked) return
    const action: Exclude<PendingAction, null> = modalState?.type === "edit"
      ? { type: "save", surveyId: modalState.id }
      : { type: "save" }
    await runExclusive(action, performSaveSurvey)
  }

  const handleOpenDistribute = async (surveyId: string) => {
    if (interactionLocked) return
    setRequestError(null)
    await runExclusive({ type: "distribute", surveyId }, async () => {
      setDistributeSurveyId(surveyId)
      setDistLoading(true)
      try {
        let items = await fetchDistributions(surveyId)
        if (items.length === 0) {
          const created = await createDistribution(surveyId)
          items = [created]
        }
        setDistributions(items)
      } catch (error) {
        setDistributions([])
        setRequestError(error instanceof Error ? error.message : "We could not load distribution links.")
      } finally {
        setDistLoading(false)
      }
    })
  }

  const handleCopyLink = async (token: string) => {
    const url = `${window.location.origin}/survey/${token}`
    try {
      await navigator.clipboard.writeText(url)
      setCopiedToken(token)
      setTimeout(() => setCopiedToken(null), 2000)
    } catch {
      /* silently fail */
    }
  }

  const addSection = () => {
    setSections((prev) => [
      ...prev,
      {
        id: createClientId(),
        title: "",
        description: "",
        orderIndex: prev.length,
        questions: [],
      },
    ])
  }

  const moveSection = (id: string, delta: number) => {
    setSections((prev) => {
      const from = prev.findIndex((section) => section.id === id)
      const to = from + delta
      const next = moveInArray(prev, from, to)
      return next.map((section, index) => ({ ...section, orderIndex: index }))
    })
  }

  const moveQuestion = (
    sourceSectionId: string,
    questionId: string,
    targetSectionId: string,
    targetIndex: number,
  ) => {
    setSections((prev) => {
      const sourceSectionIndex = prev.findIndex((section) => section.id === sourceSectionId)
      const targetSectionIndex = prev.findIndex((section) => section.id === targetSectionId)
      if (sourceSectionIndex < 0 || targetSectionIndex < 0) return prev

      const sourceSection = prev[sourceSectionIndex]!
      const sourceIndex = sourceSection.questions.findIndex((question) => question.id === questionId)
      if (sourceIndex < 0) return prev

      const next = prev.map((section) => ({ ...section, questions: [...section.questions] }))
      const [question] = next[sourceSectionIndex]!.questions.splice(sourceIndex, 1)
      if (!question) return prev

      const adjustedTargetIndex =
        sourceSectionIndex === targetSectionIndex && sourceIndex < targetIndex
          ? targetIndex - 1
          : targetIndex
      question.sectionId = targetSectionId
      next[targetSectionIndex]!.questions.splice(
        Math.max(0, Math.min(adjustedTargetIndex, next[targetSectionIndex]!.questions.length)),
        0,
        question,
      )
      return next
    })
  }

  const moveQuestionBy = (sectionId: string, questionId: string, delta: number) => {
    setSections((prev) => {
      const section = prev.find((item) => item.id === sectionId)
      if (!section) return prev
      const from = section.questions.findIndex((question) => question.id === questionId)
      const to = from + delta
      if (from < 0 || to < 0 || to >= section.questions.length) return prev
      return prev.map((item) =>
        item.id === sectionId
          ? { ...item, questions: moveInArray(item.questions, from, to) }
          : item,
      )
    })
  }

  const moveOption = (
    sectionId: string,
    questionId: string,
    from: number,
    to: number,
  ) => {
    setSections((prev) => prev.map((section) => {
      if (section.id !== sectionId) return section
      return {
        ...section,
        questions: section.questions.map((question) =>
          question.id === questionId
            ? { ...question, options: moveInArray(question.options ?? [], from, to) }
            : question,
        ),
      }
    }))
  }

  const moveColumn = (
    sectionId: string,
    questionId: string,
    from: number,
    to: number,
  ) => {
    setSections((prev) => prev.map((section) => {
      if (section.id !== sectionId) return section
      return {
        ...section,
        questions: section.questions.map((question) => {
          if (question.id !== questionId) return question
          const columns = (question.config?.columns as string[] | undefined) ?? []
          return {
            ...question,
            config: { ...(question.config ?? {}), columns: moveInArray(columns, from, to) },
          }
        }),
      }
    }))
  }

  const handleDragStart = (event: DragEvent, item: DragItem) => {
    event.stopPropagation()
    setDragItem(item)
    event.dataTransfer.effectAllowed = "move"
    event.dataTransfer.setData("text/plain", item.kind)
  }

  const handleDrop = (event: DragEvent, target: DragItem) => {
    event.preventDefault()
    event.stopPropagation()
    const source = dragItem
    setDragItem(null)
    if (!source) return

    if (source.kind === "section" && target.kind === "section") {
      setSections((prev) => {
        const from = prev.findIndex((section) => section.id === source.id)
        const to = prev.findIndex((section) => section.id === target.id)
        return moveInArray(prev, from, to).map((section, index) => ({ ...section, orderIndex: index }))
      })
    } else if (source.kind === "question" && target.kind === "section") {
      moveQuestion(source.sectionId, source.id, target.id, Number.MAX_SAFE_INTEGER)
    } else if (source.kind === "question" && target.kind === "question") {
      const targetSection = sections.find((section) => section.id === target.sectionId)
      const targetIndex = targetSection?.questions.findIndex((question) => question.id === target.id) ?? -1
      if (targetIndex >= 0) moveQuestion(source.sectionId, source.id, target.sectionId, targetIndex)
    } else if (source.kind === "option" && target.kind === "option" && source.questionId === target.questionId) {
      moveOption(source.sectionId, source.questionId, source.index, target.index)
    } else if (source.kind === "column" && target.kind === "column" && source.questionId === target.questionId) {
      moveColumn(source.sectionId, source.questionId, source.index, target.index)
    }
  }

  const updateSection = (secIdx: number, patch: Partial<SurveySection>) => {
    setSections((prev) => {
      const next = [...prev]
      next[secIdx] = { ...next[secIdx]!, ...patch }
      return next
    })
  }

  const removeSection = (id: string) => {
    const section = sections.find((item) => item.id === id)
    if (section && section.questions.length > 0) {
      const confirmed = window.confirm(
        `Delete this section and its ${section.questions.length} question${section.questions.length === 1 ? "" : "s"}?`,
      )
      if (!confirmed) return
    }
    setSections((prev) => prev.filter((s) => s.id !== id))
  }

  const addQuestion = (secIdx: number) => {
    setSections((prev) => {
      const next = [...prev]
      const sec = { ...next[secIdx]! }
      sec.questions = [
        ...sec.questions,
        { id: createClientId(), text: "", type: "text", options: [""], isRequired: true },
      ]
      next[secIdx] = sec
      return next
    })
  }

  const updateQuestion = (secIdx: number, qIdx: number, patch: Partial<SurveyQuestion>) => {
    setSections((prev) => {
      const next = [...prev]
      const sec = { ...next[secIdx]! }
      const qs = [...sec.questions]
      qs[qIdx] = { ...qs[qIdx]!, ...patch }
      sec.questions = qs
      next[secIdx] = sec
      return next
    })
  }

  const removeQuestion = (secIdx: number, qId: string) => {
    setSections((prev) => {
      const next = [...prev]
      const sec = { ...next[secIdx]! }
      sec.questions = sec.questions.filter((q) => q.id !== qId)
      next[secIdx] = sec
      return next
    })
  }

  const updateOption = (secIdx: number, qIdx: number, optIdx: number, value: string) => {
    setSections((prev) => {
      const next = [...prev]
      const sec = { ...next[secIdx]! }
      const qs = [...sec.questions]
      const q = { ...qs[qIdx]! }
      const opts = [...(q.options ?? [])]
      opts[optIdx] = value
      q.options = opts
      qs[qIdx] = q
      sec.questions = qs
      next[secIdx] = sec
      return next
    })
  }

  const removeOption = (secIdx: number, qIdx: number, optIdx: number) => {
    setSections((prev) => {
      const next = [...prev]
      const sec = { ...next[secIdx]! }
      const qs = [...sec.questions]
      const q = { ...qs[qIdx]! }
      const opts = [...(q.options ?? [])]
      opts.splice(optIdx, 1)
      q.options = opts
      qs[qIdx] = q
      sec.questions = qs
      next[secIdx] = sec
      return next
    })
  }

  const addOption = (secIdx: number, qIdx: number) => {
    setSections((prev) => {
      const next = [...prev]
      const sec = { ...next[secIdx]! }
      const qs = [...sec.questions]
      const q = { ...qs[qIdx]! }
      const opts = [...(q.options ?? [])]
      opts.push("")
      q.options = opts
      qs[qIdx] = q
      sec.questions = qs
      next[secIdx] = sec
      return next
    })
  }

  const questionTypeIcon = (type: string) => {
    const match = QUESTION_TYPES.find((t) => t.value === type)
    const Icon = match?.icon ?? Type
    return <Icon className="size-3.5" />
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-[20px] font-semibold text-slate-900 tracking-tight">
            Survey Management
          </h2>
          <p className="text-[13px] text-slate-500 mt-0.5">
            Create and manage surveys to collect PEII feedback and track cohort
            progress.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={handleShowGeneratePreview}
            variant="outline"
            disabled={interactionLocked}
            className="gap-2 border-violet-200 text-violet-700 hover:bg-violet-50"
          >
            <ClipboardList className="size-4" />
            Generate Questionnaire
          </Button>
          <Button
            onClick={handleOpenCreate}
            disabled={interactionLocked}
            className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white border-0"
          >
            <Plus className="size-4" />
            Create Survey
          </Button>
        </div>
      </div>

      {pendingLabel && (
        <div className="flex items-center gap-2 text-xs text-slate-500" role="status" aria-live="polite">
          <Loader2 className="size-3.5 animate-spin" />
          <span>{pendingLabel}</span>
        </div>
      )}
      {requestError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {requestError}
        </div>
      )}

      {/* Survey List */}
      <div className="rounded-xl border border-slate-200/80 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50 text-slate-500 font-medium">
                <th className="px-5 py-3.5">Survey Details</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5">Responses</th>
                <th className="px-5 py-3.5">Date Created</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-slate-500">
                    <Loader2 className="size-5 animate-spin mx-auto" />
                  </td>
                </tr>
              ) : surveys.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-5 py-8 text-center text-slate-500"
                  >
                    No surveys found. Create one to get started.
                  </td>
                </tr>
              ) : (
                surveys.map((survey) => (
                  <tr
                    key={survey.id}
                    className="hover:bg-slate-50/50 transition-colors"
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="size-8 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                          <FileText className="size-4 text-indigo-600" />
                        </div>
                        <span className="font-medium text-slate-900">
                          {survey.title}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={cn(
                          "inline-flex items-center px-2 py-1 rounded-md text-[11px] font-medium",
                          survey.status === "Active" &&
                            "bg-emerald-50 text-emerald-700",
                          survey.status === "Inactive" &&
                            "bg-amber-50 text-amber-700",
                          survey.status === "Closed" &&
                            "bg-slate-100 text-slate-600"
                        )}
                      >
                        {survey.status}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1.5 text-slate-600">
                        <Users className="size-3.5 text-slate-400" />
                        {survey.responses}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1.5 text-slate-600">
                        <Calendar className="size-3.5 text-slate-400" />
                        {formatDate(survey.dateCreated)}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenView(survey.id)}
                          disabled={interactionLocked}
                          className="text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
                          title="View Details"
                        >
                          {pendingAction?.type === "view" && pendingAction.surveyId === survey.id ? <Loader2 className="size-4 animate-spin" /> : <Eye className="size-4" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenEdit(survey.id)}
                          disabled={interactionLocked}
                          className="text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
                          title="Edit Questions & Details"
                        >
                          {pendingAction?.type === "edit" && pendingAction.surveyId === survey.id ? <Loader2 className="size-4 animate-spin" /> : <Pencil className="size-4" />}
                        </Button>

                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenDistribute(survey.id)}
                          disabled={interactionLocked}
                          className="text-slate-400 hover:text-emerald-600 hover:bg-emerald-50"
                          title="Distribute"
                        >
                          {pendingAction?.type === "distribute" && pendingAction.surveyId === survey.id ? <Loader2 className="size-4 animate-spin" /> : <Share2 className="size-4" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteConfirmId(survey.id)}
                          disabled={interactionLocked}
                          className="text-slate-400 hover:text-red-600 hover:bg-red-50"
                          title="Delete"
                        >
                          {pendingAction?.type === "delete" && pendingAction.surveyId === survey.id ? <Loader2 className="size-4 animate-spin" /> : <Trash className="size-4" />}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Create / Edit Survey Dialog ─────────────────────────────── */}
      <Dialog
        open={modalState !== null && (modalState.type === "create" || modalState.type === "edit")}
        onOpenChange={(open) => !open && !interactionLocked && handleCloseModal()}
      >
        <DialogContent 
          showCloseButton={false}
          className="sm:max-w-6xl max-w-6xl w-[95vw] h-[90vh] p-0 overflow-hidden flex flex-col gap-0 border-slate-200/60 rounded-xl shadow-2xl bg-slate-50/50"
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200/80 bg-white shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-indigo-50 ring-1 ring-indigo-100">
                <ClipboardList className="size-5 text-indigo-600" />
              </div>
              <div className="flex-1 min-w-0">
                <DialogTitle className="text-base font-semibold text-slate-900">
                  {modalState?.type === "create" ? "Create New Survey" : "Edit Survey"}
                </DialogTitle>
                <DialogDescription className="text-[13px] text-slate-500 mt-0.5">
                  {modalState?.type === "create" 
                    ? "Define a new survey for the PEII system." 
                    : "Modify the title, target cohort, description, and questions for this survey."}
                </DialogDescription>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={handleCloseModal} disabled={interactionLocked} className="h-9">
                Cancel
              </Button>
              <Button
                onClick={handleSaveSurvey}
                disabled={!surveyTitle.trim() || interactionLocked}
                className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white h-9"
              >
                {saving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : modalState?.type === "create" ? (
                  <Check className="size-4" />
                ) : (
                  <Pencil className="size-4" />
                )}
                {modalState?.type === "create" ? "Create Survey" : "Save Changes"}
              </Button>
            </div>
          </div>

          {saveError && (
            <div className="mx-6 mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {saveError}
            </div>
          )}

          <div
            className={cn("flex flex-1 overflow-hidden", interactionLocked && "pointer-events-none opacity-75")}
            aria-busy={interactionLocked}
            inert={interactionLocked}
          >
            {/* Left Sidebar: Details */}
            <div className="w-[340px] shrink-0 border-r border-slate-200/80 bg-slate-50/50 p-6 overflow-y-auto">
              <fieldset className="space-y-4">
                    <legend className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                      <span className="flex size-5 items-center justify-center rounded-md bg-slate-100 text-[10px] font-bold text-slate-500">
                        1
                      </span>
                      Survey Details
                    </legend>

                    <div className="space-y-1.5">
                      <label className="text-[13px] font-medium text-slate-700">
                        Title
                      </label>
                      <Input
                        placeholder="e.g. Class of 2025 Mid-Year Check-in"
                        value={surveyTitle}
                        onChange={(e) => setSurveyTitle(e.target.value)}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[13px] font-medium text-slate-700">
                        Target Cohort
                      </label>
                      <Popover open={cohortOpen} onOpenChange={setCohortOpen}>
                        <PopoverTrigger
                          render={
                            <Button
                              variant="outline"
                              type="button"
                              className="h-8 w-full justify-between font-normal text-sm border border-input bg-transparent hover:bg-slate-50/50 hover:border-slate-300 transition-colors cursor-pointer outline-none focus-visible:ring-3 focus-visible:ring-ring/50 select-none text-left"
                            >
                              <span>{targetCohort}</span>
                              <ChevronDown className="size-4 text-slate-400 shrink-0 opacity-60" />
                            </Button>
                          }
                        />
                        <PopoverContent
                          align="start"
                          style={{ width: "var(--anchor-width)" }}
                          className="p-1 flex flex-col gap-0.5 bg-white border border-slate-200 rounded-lg shadow-md animate-in fade-in-0 zoom-in-95 duration-100"
                        >
                          {["Class of 2024", "Class of 2025", "All Alumni"].map((cohortOption) => {
                            const isSelected = targetCohort === cohortOption
                            return (
                              <button
                                type="button"
                                key={cohortOption}
                                onClick={() => {
                                  setTargetCohort(cohortOption)
                                  setCohortOpen(false)
                                }}
                                className={`
                                  flex items-center justify-between w-full px-2.5 py-1.5 text-xs font-medium rounded-md text-left transition-colors cursor-pointer outline-none
                                  ${isSelected
                                    ? "bg-indigo-50 text-indigo-700 font-semibold"
                                    : "text-slate-650 hover:bg-slate-50 hover:text-slate-900"
                                  }
                                `}
                              >
                                <span>{cohortOption}</span>
                                {isSelected && <Check className="size-3.5 text-indigo-600" />}
                              </button>
                            )
                          })}
                        </PopoverContent>
                      </Popover>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[13px] font-medium text-slate-700">
                        Status
                      </label>
                      <Popover open={statusOpen} onOpenChange={setStatusOpen}>
                        <PopoverTrigger
                          render={
                            <Button
                              variant="outline"
                              type="button"
                              className="h-8 w-full justify-between font-normal text-sm border border-input bg-transparent hover:bg-slate-50/50 hover:border-slate-300 transition-colors cursor-pointer outline-none focus-visible:ring-3 focus-visible:ring-ring/50 select-none text-left"
                            >
                              <span>{surveyStatus}</span>
                              <ChevronDown className="size-4 text-slate-400 shrink-0 opacity-60" />
                            </Button>
                          }
                        />
                        <PopoverContent
                          align="start"
                          style={{ width: "var(--anchor-width)" }}
                          className="p-1 flex flex-col gap-0.5 bg-white border border-slate-200 rounded-lg shadow-md animate-in fade-in-0 zoom-in-95 duration-100"
                        >
                          {SURVEY_STATUSES.map((statusOption) => {
                            const isSelected = surveyStatus === statusOption
                            return (
                              <button
                                type="button"
                                key={statusOption}
                                onClick={() => {
                                  setSurveyStatus(statusOption)
                                  setStatusOpen(false)
                                }}
                                className={`
                                  flex items-center justify-between w-full px-2.5 py-1.5 text-xs font-medium rounded-md text-left transition-colors cursor-pointer outline-none
                                  ${isSelected
                                    ? "bg-indigo-50 text-indigo-700 font-semibold"
                                    : "text-slate-650 hover:bg-slate-50 hover:text-slate-900"
                                  }
                                `}
                              >
                                <span>{statusOption}</span>
                                {isSelected && <Check className="size-3.5 text-indigo-600" />}
                              </button>
                            )
                          })}
                        </PopoverContent>
                      </Popover>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[13px] font-medium text-slate-700">
                        Description{" "}
                        <span className="font-normal text-slate-400">
                          (optional)
                        </span>
                      </label>
                      <textarea
                        rows={3}
                        className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-none overflow-hidden min-h-[80px]"
                        placeholder="Brief description of this survey's goals…"
                        value={surveyDescription}
                        onChange={(e) => {
                          setSurveyDescription(e.target.value)
                          e.target.style.height = "auto"
                          e.target.style.height = `${e.target.scrollHeight}px`
                        }}
                        ref={(el) => {
                          if (el) {
                            el.style.height = "auto"
                            el.style.height = `${el.scrollHeight}px`
                          }
                        }}
                      />
                    </div>
                  </fieldset>

                  {/* ── Section: Questions (Sections) ────────────────── */}
            </div>

            {/* Right Main Area: Questions */}
            <div className="flex-1 bg-white p-8 overflow-y-auto">
              <div className="max-w-3xl mx-auto pb-20">
                <fieldset className="space-y-4">
                    <legend className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                      <span className="flex size-5 items-center justify-center rounded-md bg-slate-100 text-[10px] font-bold text-slate-500">
                        2
                      </span>
                      Sections &amp; Questions
                    </legend>

                    {sections.length === 0 ? (
                      <button
                        type="button"
                        onClick={addSection}
                        className="group flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/40 px-4 py-8 text-center transition-colors hover:border-indigo-300 hover:bg-indigo-50/30"
                      >
                        <div className="flex size-10 items-center justify-center rounded-full bg-white ring-1 ring-slate-200 transition-shadow group-hover:ring-indigo-200 group-hover:shadow-sm">
                          <Plus className="size-5 text-slate-400 group-hover:text-indigo-500 transition-colors" />
                        </div>
                        <div>
                          <p className="text-[13px] font-medium text-slate-600 group-hover:text-indigo-600 transition-colors">
                            Add your first section
                          </p>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            Group related questions into sections
                          </p>
                        </div>
                      </button>
                    ) : (
                      <div className="space-y-4">
                        {sections.map((sec, secIdx) => (
                          <div
                            key={sec.id}
                            draggable
                            onDragStart={(event) => handleDragStart(event, { kind: "section", id: sec.id })}
                            onDragEnd={() => setDragItem(null)}
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={(event) => handleDrop(event, { kind: "section", id: sec.id })}
                            className="rounded-xl border border-slate-200/80 bg-white shadow-sm"
                          >
                            {/* Section header */}
                            <div className="flex items-start gap-3 p-4 pb-3 border-b border-slate-100">
                              <div className="flex items-center gap-1.5 pt-1">
                                <GripVertical
                                  className="size-4 cursor-grab text-slate-300 active:cursor-grabbing"
                                  aria-label="Drag section"
                                />
                                <span className="flex size-5 items-center justify-center rounded-md bg-violet-50 text-[10px] font-bold text-violet-600">
                                  {secIdx + 1}
                                </span>
                              </div>
                              <div className="flex-1 min-w-0 space-y-2">
                                <Input
                                  placeholder="Section title (e.g. Employment Outcomes)"
                                  value={sec.title}
                                  onChange={(e) =>
                                    updateSection(secIdx, {
                                      title: e.target.value,
                                    })
                                  }
                                  className="bg-slate-50/60 focus-visible:bg-white font-medium"
                                />
                                <textarea
                                  rows={1}
                                  className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-xs outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-none overflow-hidden min-h-[32px]"
                                  placeholder="Section description (optional)"
                                  value={sec.description ?? ""}
                                  onChange={(e) => {
                                    updateSection(secIdx, {
                                      description: e.target.value,
                                    })
                                    e.target.style.height = "auto"
                                    e.target.style.height = `${e.target.scrollHeight}px`
                                  }}
                                  ref={(el) => {
                                    if (el) {
                                      el.style.height = "auto"
                                      el.style.height = `${el.scrollHeight}px`
                                    }
                                  }}
                                />
                              </div>
                              <div className="flex items-center gap-0.5 pt-0.5">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-xs"
                                  aria-label="Move section up"
                                  title="Move section up"
                                  disabled={secIdx === 0}
                                  onClick={() => moveSection(sec.id, -1)}
                                >
                                  <ArrowUp />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-xs"
                                  aria-label="Move section down"
                                  title="Move section down"
                                  disabled={secIdx === sections.length - 1}
                                  onClick={() => moveSection(sec.id, 1)}
                                >
                                  <ArrowDown />
                                </Button>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                onClick={() => removeSection(sec.id)}
                                className="mt-0.5 text-slate-300 hover:text-red-500 hover:bg-red-50"
                                title="Remove section"
                              >
                                <X className="size-3.5" />
                              </Button>
                            </div>

                            {/* Questions within section */}
                            <div className="px-4 py-3 space-y-3">
                              {sec.questions.length === 0 ? (
                                <button
                                  type="button"
                                  onClick={() => addQuestion(secIdx)}
                                  className="group flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-200 bg-slate-50/40 px-3 py-3 text-[12px] font-medium text-slate-500 transition-colors hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50/30"
                                >
                                  <Plus className="size-3.5" />
                                  Add question to section
                                </button>
                              ) : (
                                <div className="space-y-2">
                                  {sec.questions.map((q, qIdx) => (
                                    <div
                                      key={q.id}
                                      draggable
                                      onDragStart={(event) => handleDragStart(event, {
                                        kind: "question",
                                        sectionId: sec.id,
                                        id: q.id,
                                      })}
                                      onDragEnd={() => setDragItem(null)}
                                      onDragOver={(event) => event.preventDefault()}
                                      onDrop={(event) => handleDrop(event, {
                                        kind: "question",
                                        sectionId: sec.id,
                                        id: q.id,
                                      })}
                                      className="group/q rounded-lg border border-slate-200/70 bg-white shadow-sm transition-shadow hover:shadow-md"
                                    >
                                      <div className="flex items-start gap-2 p-3">
                                        <div className="flex items-center gap-1.5 pt-1">
                                          <GripVertical className="size-4 cursor-grab text-slate-300 active:cursor-grabbing" aria-label="Drag question" />
                                          <span className="flex size-5 items-center justify-center rounded-md bg-indigo-50 text-[10px] font-bold text-indigo-600">
                                            {qIdx + 1}
                                          </span>
                                        </div>

                                        <div className="flex-1 min-w-0 space-y-2">
                                          <div className="relative">
                                            <Input
                                              placeholder={`Question ${qIdx + 1}`}
                                              value={q.text}
                                              onChange={(e) =>
                                                updateQuestion(secIdx, qIdx, {
                                                  text: e.target.value,
                                                })
                                              }
                                              className="bg-slate-50/60 focus-visible:bg-white pr-6"
                                            />
                                            {(q.isRequired ?? true) && (
                                              <span className="text-red-500 absolute right-2.5 top-1/2 -translate-y-1/2 font-medium">*</span>
                                            )}
                                          </div>

                                          {/* Type selector */}
                                          <div className="relative">
                                            <Popover
                                              open={openQuestionSelectId === q.id}
                                              onOpenChange={(isOpen) =>
                                                setOpenQuestionSelectId(isOpen ? q.id : null)
                                              }
                                            >
                                              <PopoverTrigger
                                                render={
                                                  <Button
                                                    variant="outline"
                                                    type="button"
                                                    className="h-8 w-full justify-between font-normal text-xs border border-input bg-slate-50/60 hover:bg-slate-100 hover:border-slate-300 transition-colors cursor-pointer outline-none focus-visible:ring-3 focus-visible:ring-ring/50 select-none text-left pl-7.5"
                                                  >
                                                    <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400">
                                                      {questionTypeIcon(q.type)}
                                                    </span>
                                                    <span>
                                                      {QUESTION_TYPES.find((t) => t.value === q.type)?.label || q.type}
                                                    </span>
                                                    <ChevronDown className="size-3.5 text-slate-400 shrink-0 opacity-60" />
                                                  </Button>
                                                }
                                              />
                                              <PopoverContent
                                                align="start"
                                                style={{ width: "var(--anchor-width)" }}
                                                className="p-1 flex flex-col gap-0.5 bg-white border border-slate-200 rounded-lg shadow-md animate-in fade-in-0 zoom-in-95 duration-100"
                                              >
                                                {QUESTION_TYPES.map((t) => {
                                                  const isSelected = q.type === t.value
                                                  const Icon = t.icon
                                                  return (
                                                    <button
                                                      type="button"
                                                      key={t.value}
                                                      onClick={() => {
                                                        const newType = t.value
                                                        const patch: Partial<SurveyQuestion> = {
                                                          type: newType,
                                                        }
                                                        if (["single_choice", "multiple_choice", "ranking"].includes(newType)) {
                                                          patch.options = (q.options && q.options.length > 0) ? q.options : ["Option 1", "Option 2"]
                                                          patch.config = null
                                                        } else if (newType === "matrix") {
                                                          patch.options = (q.options && q.options.length > 0) ? q.options : ["Row 1", "Row 2"]
                                                          patch.config = { columns: ["Poor", "Fair", "Good", "Excellent"] }
                                                        } else if (newType === "scale") {
                                                          patch.options = null
                                                          patch.config = { min: 1, max: 4, min_label: "", max_label: "" }
                                                        } else {
                                                          patch.options = null
                                                          patch.config = null
                                                        }
                                                        updateQuestion(secIdx, qIdx, patch)
                                                        setOpenQuestionSelectId(null)
                                                      }}
                                                      className={`
                                                        flex items-center justify-between w-full px-2.5 py-1.5 text-xs font-normal rounded-md text-left transition-colors cursor-pointer outline-none
                                                        ${isSelected
                                                          ? "bg-indigo-50 text-indigo-700 font-semibold"
                                                          : "text-slate-650 hover:bg-slate-50 hover:text-slate-900"
                                                        }
                                                      `}
                                                    >
                                                      <div className="flex items-center gap-2">
                                                        <Icon className="size-3.5 text-slate-400" />
                                                        <span>{t.label}</span>
                                                      </div>
                                                      {isSelected && <Check className="size-3.5 text-indigo-600" />}
                                                    </button>
                                                  )
                                                })}
                                              </PopoverContent>
                                            </Popover>
                                          </div>
                                        </div>

                                        <div className="flex items-center gap-0.5 pt-0.5">
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon-xs"
                                            aria-label="Move question up"
                                            title="Move question up"
                                            disabled={qIdx === 0}
                                            onClick={() => moveQuestionBy(sec.id, q.id, -1)}
                                          >
                                            <ArrowUp />
                                          </Button>
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon-xs"
                                            aria-label="Move question down"
                                            title="Move question down"
                                            disabled={qIdx === sec.questions.length - 1}
                                            onClick={() => moveQuestionBy(sec.id, q.id, 1)}
                                          >
                                            <ArrowDown />
                                          </Button>
                                        </div>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon-xs"
                                          onClick={() => removeQuestion(secIdx, q.id)}
                                          className="mt-0.5 text-slate-300 opacity-0 transition-opacity group-hover/q:opacity-100 hover:text-red-500 hover:bg-red-50"
                                        >
                                          <X className="size-3.5" />
                                        </Button>
                                      </div>

                                      <div className="px-3 pt-0 pb-1">
                                        <div 
                                          className="flex items-center gap-2 mt-1 w-max cursor-pointer"
                                          onClick={() => updateQuestion(secIdx, qIdx, { isRequired: !(q.isRequired ?? true) })}
                                        >
                                          <button
                                            type="button"
                                            className={cn(
                                              "relative inline-flex h-4 w-7 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2",
                                              (q.isRequired ?? true) ? "bg-indigo-600" : "bg-slate-200"
                                            )}
                                          >
                                            <span
                                              className={cn(
                                                "pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                                                (q.isRequired ?? true) ? "translate-x-3" : "translate-x-0"
                                              )}
                                            />
                                          </button>
                                          <span className="text-[11px] font-medium text-slate-500 select-none">
                                            Required question
                                          </span>
                                        </div>
                                      </div>

                                      {q.type === "scale" && (
                                        <div className="mt-2 space-y-1 p-3 pt-0">
                                          {!!(q.config?.min_label || q.config?.max_label) && (
                                            <div className="flex items-center gap-1.5 text-xs text-slate-400">
                                              {!!q.config?.min_label && <span>{String(q.config.min_label)}</span>}
                                              <span>({(q.config?.min as number) ?? 1} to {(q.config?.max as number) ?? (q.options?.length ?? 4)})</span>
                                              {!!q.config?.max_label && <span>{String(q.config.max_label)}</span>}
                                            </div>
                                          )}
                                          <div className="flex gap-2">
                                            {Array.from(
                                              { length: ((q.config?.max as number) ?? (q.options?.length ?? 4)) - ((q.config?.min as number) ?? 1) + 1 },
                                              (_, i) => ((q.config?.min as number) ?? 1) + i
                                            ).map(rating => (
                                              <div key={rating} className="size-8 rounded-md border border-slate-200 bg-slate-50 flex items-center justify-center text-slate-500 text-xs">
                                                {rating}
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                      {q.type === "text" && (
                                        <div className="h-16 rounded-md border border-slate-200 bg-slate-50 mt-2 p-2 text-slate-400 text-xs mx-3 mb-3">
                                          Text response area...
                                        </div>
                                      )}
                                      {["single_choice", "multiple_choice", "ranking"].includes(q.type) && (
                                        <div className="space-y-1.5 mt-2 p-3 pt-0">
                                          {(q.options ?? []).map((opt, optIdx) => (
                                            <div key={optIdx} className="flex items-center gap-2 text-xs">
                                              <span className="flex size-4 shrink-0 items-center justify-center rounded-full border border-slate-300 text-[9px] font-semibold text-slate-400">
                                                {String.fromCharCode(65 + optIdx)}
                                              </span>
                                              <span className="text-slate-700">{opt || `Option ${optIdx + 1}`}</span>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                      {q.type === "matrix" && (
                                        <div className="mt-2 space-y-2 p-3 pt-0">
                                          <div className="text-[10px] text-slate-400 font-semibold uppercase">Rows:</div>
                                          <div className="space-y-1 pl-2">
                                            {(q.options ?? []).map((opt, optIdx) => (
                                              <div key={optIdx} className="text-xs text-slate-600">• {opt || `Row ${optIdx + 1}`}</div>
                                            ))}
                                          </div>
                                          <div className="text-[10px] text-slate-400 font-semibold uppercase mt-1">Columns:</div>
                                          <div className="flex flex-wrap gap-1.5 pl-2">
                                             {((q.config?.columns as string[]) ?? []).map((col, colIdx) => (
                                               <span key={colIdx} className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-100 text-[10px] font-medium text-slate-600">
                                                 {col || `Col ${colIdx + 1}`}
                                               </span>
                                             ))}
                                          </div>
                                        </div>
                                      )}

                                      {/* Options */}
                                      {["single_choice", "multiple_choice", "ranking"].includes(q.type) && (
                                        <div className="border-t border-slate-100 bg-slate-50/30 px-3 py-3 rounded-b-xl">
                                          <div className="space-y-1.5 pl-7">
                                             {q.options?.map((opt, optIdx) => (
                                              <div
                                                key={optIdx}
                                                draggable
                                                onDragStart={(event) => handleDragStart(event, {
                                                  kind: "option",
                                                  sectionId: sec.id,
                                                  questionId: q.id,
                                                  index: optIdx,
                                                })}
                                                onDragEnd={() => setDragItem(null)}
                                                onDragOver={(event) => event.preventDefault()}
                                                onDrop={(event) => handleDrop(event, {
                                                  kind: "option",
                                                  sectionId: sec.id,
                                                  questionId: q.id,
                                                  index: optIdx,
                                                })}
                                                className="flex items-center gap-2"
                                              >
                                                <GripVertical className="size-3.5 cursor-grab text-slate-300" aria-label="Drag option" />
                                                <span className="flex size-4 shrink-0 items-center justify-center rounded-full border border-slate-300 text-[9px] font-semibold text-slate-400">
                                                  {String.fromCharCode(65 + optIdx)}
                                                </span>
                                                <Input
                                                  className="h-7 flex-1 bg-white text-xs"
                                                  placeholder={`Option ${optIdx + 1}`}
                                                  value={opt}
                                                  onChange={(e) =>
                                                    updateOption(secIdx, qIdx, optIdx, e.target.value)
                                                  }
                                                />
                                                 <Button
                                                   variant="ghost"
                                                   size="icon-xs"
                                                   className="text-slate-300 hover:text-red-500 hover:bg-red-50"
                                                   aria-label={`Move option ${optIdx + 1} up`}
                                                   disabled={optIdx === 0}
                                                   onClick={() => moveOption(sec.id, q.id, optIdx, optIdx - 1)}
                                                 >
                                                   <ArrowUp />
                                                 </Button>
                                                 <Button
                                                   variant="ghost"
                                                   size="icon-xs"
                                                   className="text-slate-300 hover:text-red-500 hover:bg-red-50"
                                                   aria-label={`Move option ${optIdx + 1} down`}
                                                   disabled={optIdx === (q.options?.length ?? 0) - 1}
                                                   onClick={() => moveOption(sec.id, q.id, optIdx, optIdx + 1)}
                                                 >
                                                   <ArrowDown />
                                                 </Button>
                                                 <Button
                                                   variant="ghost"
                                                   size="icon-xs"
                                                   className="text-slate-300 hover:text-red-500 hover:bg-red-50"
                                                   onClick={() => removeOption(secIdx, qIdx, optIdx)}
                                                 >
                                                  <Trash className="size-3" />
                                                </Button>
                                              </div>
                                            ))}
                                            <Button
                                              variant="ghost"
                                              size="xs"
                                              className="mt-1 h-6 gap-1 px-1.5 text-[11px] text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                                              onClick={() => addOption(secIdx, qIdx)}
                                            >
                                              <Plus className="size-3" />
                                              Add Option
                                            </Button>
                                          </div>
                                        </div>
                                      )}

                                      {q.type === "matrix" && (
                                        <div className="border-t border-slate-100 bg-slate-50/30 px-3 py-3 rounded-b-xl space-y-4">
                                          {/* Rows */}
                                          <div className="space-y-1.5 pl-7">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Rows</span>
                                             {q.options?.map((opt, optIdx) => (
                                              <div
                                                key={optIdx}
                                                draggable
                                                onDragStart={(event) => handleDragStart(event, {
                                                  kind: "option",
                                                  sectionId: sec.id,
                                                  questionId: q.id,
                                                  index: optIdx,
                                                })}
                                                onDragEnd={() => setDragItem(null)}
                                                onDragOver={(event) => event.preventDefault()}
                                                onDrop={(event) => handleDrop(event, {
                                                  kind: "option",
                                                  sectionId: sec.id,
                                                  questionId: q.id,
                                                  index: optIdx,
                                                })}
                                                className="flex items-center gap-2"
                                              >
                                                <GripVertical className="size-3.5 cursor-grab text-slate-300" aria-label="Drag row" />
                                                <span className="text-[10px] font-semibold text-slate-400 w-4">{optIdx + 1}</span>
                                                <Input
                                                  className="h-7 flex-1 bg-white text-xs"
                                                  placeholder={`Row ${optIdx + 1}`}
                                                  value={opt}
                                                  onChange={(e) => updateOption(secIdx, qIdx, optIdx, e.target.value)}
                                                />
                                                 <Button
                                                   variant="ghost"
                                                   size="icon-xs"
                                                   className="text-slate-300 hover:text-red-500 hover:bg-red-50"
                                                   aria-label={`Move row ${optIdx + 1} up`}
                                                   disabled={optIdx === 0}
                                                   onClick={() => moveOption(sec.id, q.id, optIdx, optIdx - 1)}
                                                 >
                                                   <ArrowUp />
                                                 </Button>
                                                 <Button
                                                   variant="ghost"
                                                   size="icon-xs"
                                                   className="text-slate-300 hover:text-red-500 hover:bg-red-50"
                                                   aria-label={`Move row ${optIdx + 1} down`}
                                                   disabled={optIdx === (q.options?.length ?? 0) - 1}
                                                   onClick={() => moveOption(sec.id, q.id, optIdx, optIdx + 1)}
                                                 >
                                                   <ArrowDown />
                                                 </Button>
                                                 <Button
                                                   variant="ghost"
                                                   size="icon-xs"
                                                   className="text-slate-300 hover:text-red-500 hover:bg-red-50"
                                                   onClick={() => removeOption(secIdx, qIdx, optIdx)}
                                                 >
                                                  <Trash className="size-3" />
                                                </Button>
                                              </div>
                                            ))}
                                            <Button
                                              variant="ghost"
                                              size="xs"
                                              className="mt-1 h-6 gap-1 px-1.5 text-[11px] text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                                              onClick={() => addOption(secIdx, qIdx)}
                                            >
                                              <Plus className="size-3" />
                                              Add Row
                                            </Button>
                                          </div>

                                          {/* Columns */}
                                          <div className="space-y-1.5 pl-7 border-t border-slate-100 pt-3">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Columns</span>
                                             {((q.config?.columns as string[]) ?? []).map((col, colIdx) => (
                                              <div
                                                key={colIdx}
                                                draggable
                                                onDragStart={(event) => handleDragStart(event, {
                                                  kind: "column",
                                                  sectionId: sec.id,
                                                  questionId: q.id,
                                                  index: colIdx,
                                                })}
                                                onDragEnd={() => setDragItem(null)}
                                                onDragOver={(event) => event.preventDefault()}
                                                onDrop={(event) => handleDrop(event, {
                                                  kind: "column",
                                                  sectionId: sec.id,
                                                  questionId: q.id,
                                                  index: colIdx,
                                                })}
                                                className="flex items-center gap-2"
                                              >
                                                <GripVertical className="size-3.5 cursor-grab text-slate-300" aria-label="Drag column" />
                                                <span className="text-[10px] font-semibold text-slate-400 w-4">{String.fromCharCode(65 + colIdx)}</span>
                                                <Input
                                                  className="h-7 flex-1 bg-white text-xs"
                                                  placeholder={`Column ${colIdx + 1}`}
                                                  value={col}
                                                  onChange={(e) => {
                                                    const newCols = [...((q.config?.columns as string[]) ?? [])]
                                                    newCols[colIdx] = e.target.value
                                                    updateQuestion(secIdx, qIdx, {
                                                      config: { ...(q.config || {}), columns: newCols }
                                                    })
                                                  }}
                                                />
                                                 <Button
                                                   variant="ghost"
                                                   size="icon-xs"
                                                   className="text-slate-300 hover:text-red-500 hover:bg-red-50"
                                                   aria-label={`Move column ${colIdx + 1} up`}
                                                   disabled={colIdx === 0}
                                                   onClick={() => moveColumn(sec.id, q.id, colIdx, colIdx - 1)}
                                                 >
                                                   <ArrowUp />
                                                 </Button>
                                                 <Button
                                                   variant="ghost"
                                                   size="icon-xs"
                                                   className="text-slate-300 hover:text-red-500 hover:bg-red-50"
                                                   aria-label={`Move column ${colIdx + 1} down`}
                                                   disabled={colIdx === (((q.config?.columns as string[]) ?? []).length - 1)}
                                                   onClick={() => moveColumn(sec.id, q.id, colIdx, colIdx + 1)}
                                                 >
                                                   <ArrowDown />
                                                 </Button>
                                                 <Button
                                                   variant="ghost"
                                                   size="icon-xs"
                                                   className="text-slate-300 hover:text-red-500 hover:bg-red-50"
                                                   onClick={() => {
                                                    const newCols = [...((q.config?.columns as string[]) ?? [])]
                                                    newCols.splice(colIdx, 1)
                                                    updateQuestion(secIdx, qIdx, {
                                                      config: { ...(q.config || {}), columns: newCols }
                                                    })
                                                  }}
                                                >
                                                  <Trash className="size-3" />
                                                </Button>
                                              </div>
                                            ))}
                                            <Button
                                              variant="ghost"
                                              size="xs"
                                              className="mt-1 h-6 gap-1 px-1.5 text-[11px] text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                                              onClick={() => {
                                                const newCols = [...((q.config?.columns as string[]) ?? []), ""]
                                                updateQuestion(secIdx, qIdx, {
                                                  config: { ...(q.config || {}), columns: newCols }
                                                })
                                              }}
                                            >
                                              <Plus className="size-3" />
                                              Add Column
                                            </Button>
                                          </div>
                                        </div>
                                      )}

                                      {q.type === "scale" && (
                                        <div className="border-t border-slate-100 bg-slate-50/30 px-3 py-3 rounded-b-xl">
                                          <div className="space-y-3 pl-7">
                                            <div className="flex items-center gap-4">
                                              <div className="space-y-1">
                                                <label className="text-[10px] font-bold text-slate-400 uppercase">Min Value</label>
                                                <select
                                                  value={(q.config?.min as number) ?? 1}
                                                  onChange={(e) => updateQuestion(secIdx, qIdx, {
                                                    config: { ...(q.config || {}), min: Number(e.target.value) }
                                                  })}
                                                  className="h-8 w-16 rounded border border-slate-200 bg-white px-2 text-xs"
                                                >
                                                  <option value={0}>0</option>
                                                  <option value={1}>1</option>
                                                </select>
                                              </div>
                                              <span className="text-slate-400 text-xs mt-4">to</span>
                                              <div className="space-y-1">
                                                <label className="text-[10px] font-bold text-slate-400 uppercase">Max Value</label>
                                                <select
                                                  value={(q.config?.max as number) ?? 5}
                                                  onChange={(e) => updateQuestion(secIdx, qIdx, {
                                                    config: { ...(q.config || {}), max: Number(e.target.value) }
                                                  })}
                                                  className="h-8 w-16 rounded border border-slate-200 bg-white px-2 text-xs"
                                                >
                                                  {[2, 3, 4, 5, 6, 7, 8, 9, 10].map(val => (
                                                    <option key={val} value={val}>{val}</option>
                                                  ))}
                                                </select>
                                              </div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-3">
                                              <div className="space-y-1">
                                                <label className="text-[10px] font-bold text-slate-400 uppercase">Min Label (Optional)</label>
                                                <Input
                                                  className="h-7 text-xs bg-white"
                                                  placeholder="e.g. Strongly disagree"
                                                  value={(q.config?.min_label as string) ?? ""}
                                                  onChange={(e) => updateQuestion(secIdx, qIdx, {
                                                    config: { ...(q.config || {}), min_label: e.target.value }
                                                  })}
                                                />
                                              </div>
                                              <div className="space-y-1">
                                                <label className="text-[10px] font-bold text-slate-400 uppercase">Max Label (Optional)</label>
                                                <Input
                                                  className="h-7 text-xs bg-white"
                                                  placeholder="e.g. Strongly agree"
                                                  value={(q.config?.max_label as string) ?? ""}
                                                  onChange={(e) => updateQuestion(secIdx, qIdx, {
                                                    config: { ...(q.config || {}), max_label: e.target.value }
                                                  })}
                                                />
                                              </div>
                                            </div>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  ))}

                                  {/* Add question to this section */}
                                  <button
                                    type="button"
                                    onClick={() => addQuestion(secIdx)}
                                    className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-200 bg-white px-3 py-2 text-[12px] font-medium text-slate-500 transition-colors hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50/30"
                                  >
                                    <Plus className="size-3.5" />
                                    Add Question
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}

                        {/* Add section */}
                        <button
                          type="button"
                          onClick={addSection}
                          className="flex w-full items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-violet-200 bg-violet-50/30 px-3 py-3 text-[12px] font-medium text-violet-600 transition-colors hover:border-violet-300 hover:bg-violet-50/60"
                        >
                          <Plus className="size-3.5" />
                          Add Section
                        </button>
                      </div>
                    )}
                  </fieldset>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── View / Settings Modal ─────────────────────────────── */}
      <Dialog
        open={modalState !== null && (modalState.type === "view" || modalState.type === "settings")}
        onOpenChange={(open) => !open && handleCloseModal()}
      >
        <DialogContent 
          showCloseButton={false}
          className="sm:max-w-4xl max-w-4xl w-[95vw] h-[90vh] p-0 overflow-hidden flex flex-col gap-0 border-slate-200/60 rounded-xl shadow-2xl bg-slate-50/50"
        >
          {modalState?.type === "view" && (
            (() => {
              const survey = surveys.find(s => s.id === modalState.id)
              if (!survey) return null
              return (
                <>
                  <div className="flex items-center justify-between px-8 py-5 border-b border-slate-200/80 bg-white shrink-0">
                    <div className="flex items-center gap-4">
                      <div className="flex size-12 items-center justify-center rounded-2xl bg-indigo-50/80 ring-1 ring-indigo-100 shadow-sm">
                        <FileText className="size-6 text-indigo-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <DialogTitle className="text-lg font-semibold text-slate-900 tracking-tight">
                          {survey.title}
                        </DialogTitle>
                        <DialogDescription className="text-[13px] text-slate-500 mt-0.5">
                          Created {formatDate(survey.dateCreated)}
                        </DialogDescription>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" onClick={handleCloseModal} className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full">
                      <X className="size-5" />
                    </Button>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto px-8 py-8 space-y-8 bg-slate-50/30">
                    <div className="max-w-3xl mx-auto space-y-8 pb-12">
                      {/* Analytics Overview */}
                      <div>
                        <h4 className="text-sm font-semibold text-slate-900 mb-4">Overview</h4>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm">
                            <div className="flex items-center gap-2 text-slate-500 mb-2">
                              <Users className="size-4" />
                              <span className="text-[13px] font-medium">Responses</span>
                            </div>
                            <div className="text-3xl font-semibold text-slate-900">
                              {survey.responses}
                            </div>
                          </div>
                          <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm">
                            <div className="flex items-center gap-2 text-slate-500 mb-2">
                              <FileText className="size-4" />
                              <span className="text-[13px] font-medium">Status</span>
                            </div>
                            <div className="text-xl font-semibold text-slate-900 mt-1">
                              <span
                                className={cn(
                                  "inline-flex items-center px-3 py-1.5 rounded-md text-[13px] font-medium",
                                  survey.status === "Active" && "bg-emerald-50 text-emerald-700",
                                  survey.status === "Inactive" && "bg-amber-50 text-amber-700",
                                  survey.status === "Closed" && "bg-slate-100 text-slate-600"
                                )}
                              >
                                {survey.status}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Tabs */}
                      <div className="flex items-center gap-1 p-1.5 bg-slate-200/50 rounded-xl w-full">
                        <button
                          onClick={() => setViewTab("questions")}
                          className={cn(
                            "flex-1 py-2 text-[14px] font-medium rounded-lg transition-all",
                            viewTab === "questions" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
                          )}
                        >
                          Questions
                        </button>
                        <button
                          onClick={() => setViewTab("responses")}
                          className={cn(
                            "flex-1 py-2 text-[14px] font-medium rounded-lg transition-all flex items-center justify-center gap-2",
                            viewTab === "responses" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
                          )}
                        >
                          Responses
                          {survey.responses > 0 && (
                            <span className={cn(
                              "py-0.5 px-2 rounded-full text-[11px] font-bold leading-none",
                              viewTab === "responses" ? "bg-indigo-100 text-indigo-700" : "bg-slate-200 text-slate-600"
                            )}>
                              {survey.responses}
                            </span>
                          )}
                        </button>
                      </div>

                      {/* Content */}
                      {viewTab === "questions" ? (
                        <div className="space-y-6">
                          {(!survey.sections || survey.sections.length === 0) ? (
                            <div className="py-12 flex flex-col items-center justify-center rounded-xl border border-slate-200 border-dashed bg-white">
                              <p className="text-sm text-slate-500 font-medium">No sections added yet.</p>
                            </div>
                          ) : (
                            <div className="space-y-6">
                              {survey.sections.map((sec, secIdx) => (
                                <div key={sec.id || secIdx} className="rounded-xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
                                  <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/30">
                                    <span className="text-base font-semibold text-slate-900">
                                      {secIdx + 1}. {sec.title || "Untitled Section"}
                                    </span>
                                    {sec.description && (
                                      <p className="text-[13px] text-slate-500 mt-1">{sec.description}</p>
                                    )}
                                  </div>
                                  <div className="p-6 space-y-6 divide-y divide-slate-100">
                                    {(!sec.questions || sec.questions.length === 0) ? (
                                      <p className="text-sm text-slate-400 italic">No questions in this section.</p>
                                    ) : (
                                      sec.questions.map((q, qIdx) => (
                                        <div key={q.id || qIdx} className="pt-6 first:pt-0 text-sm text-slate-600">
                                          <span className="font-medium text-slate-900 block mb-2 text-[15px]">
                                            {qIdx + 1}. {q.text || "Untitled Question"}
                                          </span>
                                          {q.type === "scale" && (
                                            <div className="mt-3 space-y-2">
                                              {!!(q.config?.min_label || q.config?.max_label) && (
                                                <div className="flex items-center gap-2 text-[13px] text-slate-500">
                                                  {!!q.config?.min_label && <span>{String(q.config.min_label)}</span>}
                                                  <span>({(q.config?.min as number) ?? 1} to {(q.config?.max as number) ?? (q.options?.length ?? 4)})</span>
                                                  {!!q.config?.max_label && <span>{String(q.config.max_label)}</span>}
                                                </div>
                                              )}
                                              <div className="flex gap-2">
                                                {Array.from(
                                                  { length: ((q.config?.max as number) ?? (q.options?.length ?? 4)) - ((q.config?.min as number) ?? 1) + 1 },
                                                  (_, i) => ((q.config?.min as number) ?? 1) + i
                                                ).map(rating => (
                                                  <div key={rating} className="size-10 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center text-slate-500 text-sm shadow-sm">
                                                    {rating}
                                                  </div>
                                                ))}
                                              </div>
                                            </div>
                                          )}
                                          {q.type === "text" && (
                                            <div className="h-20 rounded-lg border border-slate-200 bg-slate-50 mt-3 p-3 text-slate-400 text-[13px] shadow-sm">
                                              Text response area...
                                            </div>
                                          )}
                                          {["single_choice", "multiple_choice", "ranking"].includes(q.type) && (
                                            <div className="space-y-2 mt-3">
                                              {(q.options ?? []).map((opt, optIdx) => (
                                                <div key={optIdx} className="flex items-center gap-2.5 text-[13px]">
                                                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-slate-300 text-[10px] font-semibold text-slate-500 bg-white shadow-sm">
                                                    {String.fromCharCode(65 + optIdx)}
                                                  </span>
                                                  <span className="text-slate-700">{opt || `Option ${optIdx + 1}`}</span>
                                                </div>
                                              ))}
                                            </div>
                                          )}
                                          {q.type === "matrix" && (
                                            <div className="mt-3 space-y-3 bg-slate-50/50 p-4 rounded-xl border border-slate-100">
                                              <div className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">Rows:</div>
                                              <div className="space-y-1.5 pl-2">
                                                {(q.options ?? []).map((opt, optIdx) => (
                                                  <div key={optIdx} className="text-[13px] text-slate-600 flex items-center gap-2">
                                                    <div className="size-1 rounded-full bg-slate-300"></div>
                                                    {opt || `Row ${optIdx + 1}`}
                                                  </div>
                                                ))}
                                              </div>
                                              <div className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider mt-4">Columns:</div>
                                              <div className="flex flex-wrap gap-2 pl-2">
                                                 {((q.config?.columns as string[]) ?? []).map((col, colIdx) => (
                                                   <span key={colIdx} className="inline-flex items-center px-2.5 py-1 rounded-md bg-white border border-slate-200 shadow-sm text-[11px] font-medium text-slate-600">
                                                     {col || `Col ${colIdx + 1}`}
                                                   </span>
                                                 ))}
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      ))
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-6">
                          {survey.responses === 0 ? (
                            <div className="py-16 flex flex-col items-center justify-center rounded-xl border border-slate-200 border-dashed bg-white shadow-sm">
                              <div className="size-16 bg-slate-50 rounded-full flex items-center justify-center mb-3 ring-8 ring-slate-50/50">
                                <Users className="size-8 text-slate-400" />
                              </div>
                              <p className="text-base font-medium text-slate-700">Waiting for responses</p>
                              <p className="text-[13px] text-slate-500 mt-1 max-w-sm text-center">Once users start submitting their feedback, you&apos;ll see charts and detailed response breakdowns here.</p>
                            </div>
                          ) : (
                            <div className="space-y-8">
                              {survey.sections?.map((sec, secIdx) => (
                                <div key={secIdx} className="space-y-5">
                                  <h5 className="text-lg font-semibold text-slate-900 border-b border-slate-200 pb-3">{sec.title || `Section ${secIdx + 1}`}</h5>
                                  {sec.questions?.map((q, qIdx) => {
                                    const qTexts = responseTexts[q.id] || []
                                    const qCounts = responseCounts[q.id] || {}
                                    const totalAnswers = Object.values(qCounts).reduce((a, b) => a + b, 0)
                                    
                                    return (
                                      <div key={qIdx} className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm hover:shadow-md transition-shadow">
                                        <p className="text-[15px] font-medium text-slate-900 mb-6">{qIdx + 1}. {q.text}</p>
                                        
                                         {q.type === "text" ? (
                                           <div className="space-y-3">
                                            {qTexts.length > 0 ? (
                                              qTexts.map((txt, tIdx) => (
                                                <div key={tIdx} className="bg-slate-50 border border-slate-100 p-4 rounded-xl text-[14px] text-slate-700 italic shadow-sm">&quot;{txt}&quot;</div>
                                              ))
                                            ) : (
                                              <div className="text-[14px] text-slate-400 italic py-2">No text responses yet.</div>
                                            )}
                                          </div>
                                         ) : q.type === "scale" ? (
                                           <div className="space-y-4">
                                             {getScaleOptions(q).map((option, optionIdx) => {
                                               const count = qCounts[String(option.value)] ?? 0
                                               const percent = totalAnswers > 0
                                                 ? Math.round((count / totalAnswers) * 100)
                                                 : 0

                                               return (
                                                 <div key={option.value} className="group">
                                                   <div className="flex justify-between text-[13px] mb-2">
                                                     <span className="text-slate-600 font-medium truncate pr-4">
                                                       {option.value}
                                                       {option.label && (
                                                         <span className="text-slate-400 ml-1.5">{option.label}</span>
                                                       )}
                                                       {count > 0 && <span className="text-slate-400 ml-1.5">({count})</span>}
                                                     </span>
                                                     <span className="font-semibold text-slate-900">{percent}%</span>
                                                   </div>
                                                   <div className="h-3 w-full bg-slate-100/80 rounded-full overflow-hidden shadow-inner">
                                                     <div
                                                       className={cn("h-full rounded-full transition-all duration-500", optionIdx === 0 ? "bg-indigo-500 shadow-sm" : "bg-indigo-300 group-hover:bg-indigo-400")}
                                                       style={{ width: `${percent}%` }}
                                                     />
                                                   </div>
                                                 </div>
                                               )
                                             })}
                                           </div>
                                         ) : (
                                           <div className="space-y-4">
                                            {((q.options?.length ? q.options : ["Option 1", "Option 2", "Option 3"])).map((opt, optIdx) => {
                                              const isFirst = optIdx === 0
                                              const count = qCounts[opt] || 0
                                              const percent = totalAnswers > 0 ? Math.round((count / surveyResponses.length) * 100) : 0
                                              
                                              return (
                                                <div key={optIdx} className="group">
                                                  <div className="flex justify-between text-[13px] mb-2">
                                                    <span className="text-slate-600 font-medium truncate pr-4">
                                                      {opt} {count > 0 && <span className="text-slate-400 ml-1.5">({count})</span>}
                                                    </span>
                                                    <span className="font-semibold text-slate-900">{percent}%</span>
                                                  </div>
                                                  <div className="h-3 w-full bg-slate-100/80 rounded-full overflow-hidden shadow-inner">
                                                    <div 
                                                      className={cn("h-full rounded-full transition-all duration-500", isFirst ? "bg-indigo-500 shadow-sm" : "bg-indigo-300 group-hover:bg-indigo-400")} 
                                                      style={{ width: `${percent}%` }}
                                                    />
                                                  </div>
                                                </div>
                                              )
                                            })}
                                          </div>
                                        )}
                                      </div>
                                    )
                                  })}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )
            })()
          )}
        </DialogContent>
      </Dialog>

      {/* ── Generate Preview Dialog ──────────────────────────────────── */}
      <Dialog
        open={showGeneratePreview}
        onOpenChange={(open) => !open && !interactionLocked && setShowGeneratePreview(false)}
      >
        <DialogContent className="sm:max-w-3xl max-w-[95vw] max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden border-slate-200/60 rounded-2xl shadow-2xl bg-slate-50/50" showCloseButton={false}>
          {/* Header */}
          <div className="flex items-center justify-between px-8 py-6 border-b border-slate-200/80 bg-white shrink-0">
            <div className="flex items-center gap-4">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-indigo-50/80 ring-1 ring-indigo-100 shadow-sm">
                <ClipboardList className="size-6 text-indigo-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-semibold tracking-tight text-slate-900 flex items-center gap-2">
                  Alumni Survey Questionnaire
                  <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-600 ring-1 ring-inset ring-indigo-500/10 uppercase tracking-wider">Preview</span>
                </h2>
                <p className="text-[13px] text-slate-500 mt-1 max-w-xl leading-relaxed">
                  Review the predefined sections and questions before generating the survey structure.
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowGeneratePreview(false)}
              disabled={interactionLocked}
              className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 -mr-2"
            >
              <X className="size-4" />
            </Button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-8 space-y-8 bg-slate-50/30">
            <div className="grid gap-6">
              {ALUMNI_QUESTIONNAIRE.map((sec, secIdx) => (
                <div key={secIdx} className="rounded-xl bg-white border border-slate-200/60 shadow-sm overflow-hidden transition-all hover:shadow-md hover:border-slate-300/80">
                  <div className="bg-slate-50/50 px-6 py-4 border-b border-slate-100 flex items-start gap-4">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white border border-slate-200 shadow-sm text-sm font-bold text-slate-700">
                      {secIdx + 1}
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-slate-900 tracking-tight">
                        {sec.title}
                      </h3>
                      <p className="mt-1 text-[13px] leading-relaxed text-slate-500">
                        {sec.description}
                      </p>
                    </div>
                  </div>
                  
                  <div className="p-6 divide-y divide-slate-100">
                    {sec.questions.map((q, qIdx) => (
                      <div key={qIdx} className="py-4 first:pt-0 last:pb-0 flex items-start gap-4 group">
                         <span className="mt-0.5 text-[12px] font-medium text-slate-400 group-hover:text-indigo-500 transition-colors w-6">
                           {secIdx + 1}.{qIdx + 1}
                         </span>
                         <div className="min-w-0 flex-1">
                           <p className="text-[14px] font-medium text-slate-800 leading-snug group-hover:text-slate-900 transition-colors">
                             {q.question_text}
                           </p>
                           {q.options && q.options.length > 0 && (
                             <div className="mt-3 flex flex-wrap gap-2">
                               {q.options.map((opt, optIdx) => (
                                 <span
                                   key={optIdx}
                                   className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[12px] text-slate-600 shadow-sm transition-colors group-hover:border-slate-300 group-hover:bg-slate-50"
                                 >
                                   {opt}
                                 </span>
                               ))}
                             </div>
                           )}
                           {q.question_type === "text" && (
                             <div className="mt-3 h-12 w-full max-w-lg rounded-lg border border-slate-200 bg-slate-50/50 flex items-center px-3 text-slate-400 text-[12px] shadow-sm">
                               Text response...
                             </div>
                           )}
                           {q.question_type === "scale" && (
                              <div className="mt-3 flex gap-2">
                                {[1, 2, 3, 4, 5].map(rating => (
                                  <div key={rating} className="size-8 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-400 text-[12px] shadow-sm transition-colors group-hover:border-slate-300 group-hover:bg-slate-50">
                                    {rating}
                                  </div>
                                ))}
                              </div>
                           )}
                         </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="flex shrink-0 items-center justify-between border-t border-slate-200/80 bg-white px-8 py-5">
            <div className="flex items-center gap-3 text-[13px] text-slate-500 font-medium">
              <span className="flex items-center gap-1.5"><ClipboardList className="size-4 text-slate-400" /> {ALUMNI_QUESTIONNAIRE.length} Sections</span>
              <span className="text-slate-300">&bull;</span>
              <span className="flex items-center gap-1.5"><ListChecks className="size-4 text-slate-400" /> {ALUMNI_QUESTIONNAIRE.reduce((acc, s) => acc + s.questions.length, 0)} Questions</span>
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setShowGeneratePreview(false)}
                disabled={interactionLocked}
                className="h-10 px-5 text-[13px] font-medium"
              >
                Cancel
              </Button>
              <Button
                onClick={handleConfirmGenerate}
                disabled={interactionLocked}
                className="h-10 px-5 text-[13px] font-medium gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20 border-0 transition-all active:scale-[0.98]"
              >
                {generating ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Check className="size-4" />
                )}
                Generate Survey
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Deletion Confirmation Dialog */}
      <Dialog
        open={deleteConfirmId !== null}
        onOpenChange={(open) => !open && !interactionLocked && setDeleteConfirmId(null)}
      >
        <DialogContent className="max-w-md" showCloseButton={true}>
          <DialogHeader>
            <DialogTitle>Delete Survey</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this survey? This action cannot be undone and all collected responses will be permanently removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmId(null)}
              disabled={interactionLocked}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!deleteConfirmId) return
                const survey = surveys.find((s) => s.id === deleteConfirmId)
                if (survey) {
                  try {
                    await handleDelete(survey.surveyId)
                  } catch {
                    // silently fail
                  }
                }
                setDeleteConfirmId(null)
              }}
              disabled={interactionLocked}
            >
              {pendingAction?.type === "delete" ? <Loader2 className="size-4 animate-spin" /> : null}
              Delete Survey
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Distribution Dialog ─────────────────────────────────────── */}
      <Dialog
        open={distributeSurveyId !== null}
        onOpenChange={(open) => !open && !interactionLocked && setDistributeSurveyId(null)}
      >
        <DialogContent className="max-w-md p-0 overflow-hidden bg-white border-slate-200 shadow-2xl sm:rounded-2xl">
          <div className="px-6 pt-6 pb-4">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-slate-100/80 ring-1 ring-slate-200/50">
                <Share2 className="size-5 text-slate-700" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900 tracking-tight">Distribute Survey</h2>
                <p className="text-sm text-slate-500">Create and manage shareable links.</p>
              </div>
            </div>
          </div>

          <div className="px-6 pb-6 space-y-4 bg-slate-50/30">
            {distLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="size-6 animate-spin text-slate-400" />
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-700">Active Link</span>
                </div>

                <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-200 [&::-webkit-scrollbar-thumb]:rounded-full">
                  {distributions.length === 0 && !distLoading && (
                    <div className="flex flex-col items-center justify-center py-10 px-4 text-center rounded-xl border border-dashed border-slate-200 bg-white">
                      <div className="rounded-full bg-slate-50 p-3 mb-3">
                        <Link className="size-5 text-slate-400" />
                      </div>
                      <p className="text-sm font-medium text-slate-600">Generating link...</p>
                    </div>
                  )}

                  {distributions.map((d) => {
                    const surveyUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/survey/${d.token}`
                    const displayUrl = surveyUrl.replace(/^https?:\/\//, '')
                    
                    return (
                      <div
                        key={d.id}
                        className={cn(
                          "group relative flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition-all hover:border-slate-300 hover:shadow-md",
                          !d.isActive && "opacity-60 bg-slate-50/50 grayscale-[50%]"
                        )}
                      >
                        <div className="grid flex-1 gap-1.5 min-w-0">
                          <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2">
                            <span className={cn(
                              "relative flex size-2 shrink-0",
                              !d.isActive && "opacity-60"
                            )}>
                              {d.isActive && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>}
                              <span className={cn("relative inline-flex size-2 rounded-full", d.isActive ? "bg-emerald-500" : "bg-slate-400")}></span>
                            </span>
                            <span className="truncate block text-xs font-medium text-slate-700">
                              {displayUrl}
                            </span>
                          </div>
                          <span className="truncate block text-[10px] text-slate-400 ml-4">
                            Created {new Date(d.createdAt).toLocaleDateString()}
                          </span>
                        </div>

                        <div className="flex shrink-0 items-center gap-1 sm:opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                          {d.isActive && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                onClick={() => handleCopyLink(d.token)}
                                className="h-7 w-7 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md"
                                title="Copy link"
                              >
                                {copiedToken === d.token ? (
                                  <CheckCircle2 className="size-3.5 text-emerald-500" />
                                ) : (
                                  <Copy className="size-3.5" />
                                )}
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

    </div>
  )
}
