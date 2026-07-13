"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet"
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
  Settings,
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
  ExternalLink,
  Share2,
  Copy,
  Link,
  CheckCircle2,
  Ban,
} from "lucide-react"
import { cn, formatDate } from "@/lib/utils"
import {
  fetchSurveys,
  fetchSurvey,
  createSurvey,
  updateSurvey,
  deleteSurvey,
  createSection,
  updateSection as updateSectionApi,
  deleteSection,
  reorderSections,
  createQuestion,
  updateQuestion as updateQuestionApi,
  deleteQuestion,
  reorderQuestions,
  createDistribution,
  fetchDistributions,
  revokeDistribution,
} from "@/lib/surveys"
import type { Survey, SurveyQuestion, SurveySection, Distribution } from "@/lib/surveys"
import { SurveyPreview } from "@/components/SurveyPreview"

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

type ModalState =
  | { type: "create" }
  | { type: "edit"; id: string }
  | { type: "view"; id: string }
  | { type: "settings"; id: string }
  | null

export default function SurveyPage() {
  const [surveys, setSurveys] = useState<Survey[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [modalState, setModalState] = useState<ModalState>(null)
  const [sections, setSections] = useState<SurveySection[]>([])
  const [originalSections, setOriginalSections] = useState<SurveySection[]>([])
  const [targetCohort, setTargetCohort] = useState("Class of 2024")
  const [cohortOpen, setCohortOpen] = useState(false)
  const [openQuestionSelectId, setOpenQuestionSelectId] = useState<string | null>(null)
  const [settingsCohortOpen, setSettingsCohortOpen] = useState(false)
  const [settingsTargetCohort, setSettingsTargetCohort] = useState("Class of 2024")
  const [settingsStatusOpen, setSettingsStatusOpen] = useState(false)
  const [settingsStatus, setSettingsStatus] = useState("Active")
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [surveyTitle, setSurveyTitle] = useState("")
  const [surveyDescription, setSurveyDescription] = useState("")
  const [settingsTitle, setSettingsTitle] = useState("")
  const [previewSurvey, setPreviewSurvey] = useState<Survey | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [showGeneratePreview, setShowGeneratePreview] = useState(false)
  const [distributeSurveyId, setDistributeSurveyId] = useState<string | null>(null)
  const [distributions, setDistributions] = useState<Distribution[]>([])
  const [distLoading, setDistLoading] = useState(false)
  const [distCreating, setDistCreating] = useState(false)
  const [copiedToken, setCopiedToken] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    const load = async () => {
      try {
        const result = await fetchSurveys()
        if (mounted) setSurveys(result.surveys)
      } catch {
        /* empty — the empty table communicates the state */
      } finally {
        if (mounted) setLoading(false)
      }
    }
    void load()
    return () => {
      mounted = false
    }
  }, [])

  const handleDelete = async (surveyId: string) => {
    await deleteSurvey(surveyId)
    setSurveys((prev) => prev.filter((s) => s.surveyId !== surveyId))
  }

  const handleCloseModal = () => {
    setModalState(null)
    setSections([])
    setOriginalSections([])
    setSurveyTitle("")
    setSurveyDescription("")
    setTargetCohort("Class of 2024")
  }

  const handleOpenCreate = () => {
    setSurveyTitle("")
    setSurveyDescription("")
    setTargetCohort("Class of 2024")
    setSections([{
      id: Date.now().toString(),
      title: "",
      description: "",
      orderIndex: 0,
      questions: [],
    }])
    setModalState({ type: "create" })
  }

  const handleOpenEdit = async (id: string) => {
    const survey = surveys.find((s) => s.id === id)
    if (!survey) return
    try {
      const full = await fetchSurvey(survey.surveyId)
      setSurveyTitle(full.title)
      setSurveyDescription(full.description ?? "")
      setTargetCohort(full.targetCohort ?? "Class of 2024")
      const loaded = full.sections ?? []
      setOriginalSections(loaded)
      setSections(loaded)
      setModalState({ type: "edit", id })
    } catch {
      // silently fail
    }
  }

  const handleShowGeneratePreview = () => {
    setShowGeneratePreview(true)
  }

  const handleConfirmGenerate = async () => {
    if (generating) return
    setGenerating(true)
    try {
      const created = await createSurvey({
        title: "Alumni Survey Questionnaire",
        description: "This comprehensive survey helps us understand your post-graduation journey — from employment outcomes and degree-to-career alignment to socioeconomic impact and personal growth.",
        target_cohort: "All Alumni",
        status: "Active",
      })
      for (const sec of ALUMNI_QUESTIONNAIRE) {
        const createdSec = await createSection(created.id, {
          title: sec.title,
          description: sec.description,
        })
        for (const q of sec.questions) {
          await createQuestion(created.id, {
            question_text: q.question_text,
            question_type: q.question_type,
            options: q.options ?? null,
            config: q.config ?? null,
            section_id: createdSec.id,
          })
        }
      }
      const full = await fetchSurvey(created.surveyId)
      setSurveys((prev) => [full, ...prev])
      setShowGeneratePreview(false)
    } catch {
      /* silently fail */
    } finally {
      setGenerating(false)
    }
  }

  const handleSaveSurvey = async () => {
    if (!surveyTitle.trim() || saving) return
    setSaving(true)
    try {
      if (modalState?.type === "create") {
        const created = await createSurvey({
          title: surveyTitle,
          description: surveyDescription || null,
          target_cohort: targetCohort,
          status: "Draft",
        })
        const sectionIdMap: Record<string, string> = {}
        for (const sec of sections) {
          const createdSec = await createSection(created.id, {
            title: sec.title || "Untitled Section",
            description: sec.description || null,
          })
          sectionIdMap[sec.id] = createdSec.id
          for (const q of sec.questions) {
            await createQuestion(created.id, {
              question_text: q.text,
              question_type: q.type,
              options: q.options ?? null,
              config: q.config ?? null,
              section_id: createdSec.id,
            })
          }
        }
        const full = await fetchSurvey(created.surveyId)
        setSurveys((prev) => [full, ...prev])
      } else if (modalState?.type === "edit") {
        const target = surveys.find((s) => s.id === modalState.id)
        if (!target) return

        await updateSurvey(target.surveyId, {
          title: surveyTitle,
          description: surveyDescription || null,
          target_cohort: targetCohort,
        })

        // -- Sections diff --
        const origSectionIds = new Set(originalSections.map((s) => s.id))
        const currentSectionIds = new Set(sections.map((s) => s.id))

        for (const orig of originalSections) {
          if (!currentSectionIds.has(orig.id)) {
            await deleteSection(target.id, orig.id)
          }
        }

        const sectionIdMap: Record<string, string> = {}
        for (const sec of sections) {
          let backendSecId: string
          if (origSectionIds.has(sec.id)) {
            const orig = originalSections.find((s) => s.id === sec.id)!
            if (orig.title !== sec.title || orig.description !== sec.description) {
              await updateSectionApi(target.id, sec.id, {
                title: sec.title || "Untitled Section",
                description: sec.description || null,
              })
            }
            backendSecId = sec.id
          } else {
            const created = await createSection(target.id, {
              title: sec.title || "Untitled Section",
              description: sec.description || null,
            })
            backendSecId = created.id
            sectionIdMap[sec.id] = created.id
          }

          // -- Questions within section --
          const origQuestions = origSectionIds.has(sec.id)
            ? originalSections.find((s) => s.id === sec.id)?.questions ?? []
            : []
          const origQIds = new Set(origQuestions.map((q) => q.id))
          const currentQIds = new Set(sec.questions.map((q) => q.id))

          for (const origQ of origQuestions) {
            if (!currentQIds.has(origQ.id)) {
              await deleteQuestion(target.id, origQ.id)
            }
          }

          for (const q of sec.questions) {
            if (origQIds.has(q.id)) {
              const origQ = origQuestions.find((o) => o.id === q.id)!
              if (
                origQ.text !== q.text ||
                origQ.type !== q.type ||
                JSON.stringify(origQ.options) !== JSON.stringify(q.options) ||
                JSON.stringify(origQ.config) !== JSON.stringify(q.config)
              ) {
                await updateQuestionApi(target.id, q.id, {
                  question_text: q.text,
                  question_type: q.type,
                  options: q.options ?? null,
                  config: q.config ?? null,
                })
              }
            } else {
              await createQuestion(target.id, {
                question_text: q.text,
                question_type: q.type,
                options: q.options ?? null,
                config: q.config ?? null,
                section_id: backendSecId,
              })
            }
          }
        }

        // Reorder sections
        const sectionOrder = sections.map((s) => sectionIdMap[s.id] ?? s.id)
        await reorderSections(target.id, sectionOrder)

        // Reorder questions per section (flat reorder across all sections)
        const allQuestionIds = sections.flatMap((sec) =>
          sec.questions.map((q) => q.id)
        )
        if (allQuestionIds.length > 0) {
          const resolvedIds = allQuestionIds.map((id) => sectionIdMap[id] ?? id)
          await reorderQuestions(target.id, resolvedIds)
        }

        const full = await fetchSurvey(target.surveyId)
        setSurveys((prev) => prev.map((s) => (s.id === full.id ? full : s)))
      }
      handleCloseModal()
    } finally {
      setSaving(false)
    }
  }

  const handleSaveSettings = async () => {
    if (modalState?.type !== "settings") return
    const survey = surveys.find((s) => s.id === modalState.id)
    if (!survey) return
    try {
      const payload: Parameters<typeof updateSurvey>[1] = {}
      if (settingsTitle) payload.title = settingsTitle
      payload.status = settingsStatus
      payload.target_cohort = settingsTargetCohort || null
      const updated = await updateSurvey(survey.surveyId, payload)
      setSurveys((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
      handleCloseModal()
    } catch {
      // silently fail
    }
  }

  const handlePreview = async (surveyId: string) => {
    const survey = surveys.find((s) => s.id === surveyId)
    if (!survey) return
    setPreviewLoading(true)
    try {
      const full = await fetchSurvey(survey.surveyId)
      setPreviewSurvey(full)
    } catch {
      // silently fail
    } finally {
      setPreviewLoading(false)
    }
  }

  const handleClosePreview = () => {
    setPreviewSurvey(null)
  }

  const handleOpenDistribute = async (surveyId: string) => {
    setDistributeSurveyId(surveyId)
    setDistLoading(true)
    try {
      const items = await fetchDistributions(surveyId)
      setDistributions(items)
    } catch {
      setDistributions([])
    } finally {
      setDistLoading(false)
    }
  }

  const handleCreateDistribution = async () => {
    if (!distributeSurveyId || distCreating) return
    setDistCreating(true)
    try {
      const created = await createDistribution(distributeSurveyId)
      setDistributions((prev) => [created, ...prev])
    } catch {
      /* silently fail */
    } finally {
      setDistCreating(false)
    }
  }

  const handleRevokeDistribution = async (distributionId: string) => {
    if (!distributeSurveyId) return
    try {
      await revokeDistribution(distributeSurveyId, distributionId)
      setDistributions((prev) =>
        prev.map((d) =>
          d.id === distributionId ? { ...d, isActive: false } : d,
        ),
      )
    } catch {
      /* silently fail */
    }
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
        id: Date.now().toString(),
        title: "",
        description: "",
        orderIndex: prev.length,
        questions: [],
      },
    ])
  }

  const updateSection = (secIdx: number, patch: Partial<SurveySection>) => {
    setSections((prev) => {
      const next = [...prev]
      Object.assign(next[secIdx]!, patch)
      return next
    })
  }

  const removeSection = (id: string) => {
    setSections((prev) => prev.filter((s) => s.id !== id))
  }

  const addQuestion = (secIdx: number) => {
    setSections((prev) => {
      const next = [...prev]
      const sec = { ...next[secIdx]! }
      sec.questions = [
        ...sec.questions,
        { id: Date.now().toString(), text: "", type: "text", options: [""] },
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
      Object.assign(qs[qIdx]!, patch)
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
            className="gap-2 border-violet-200 text-violet-700 hover:bg-violet-50"
          >
            <ClipboardList className="size-4" />
            Generate Questionnaire
          </Button>
          <Button
            onClick={handleOpenCreate}
            className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white border-0"
          >
            <Plus className="size-4" />
            Create Survey
          </Button>
        </div>
      </div>

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
                          survey.status === "Draft" &&
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
                          onClick={() => handlePreview(survey.id)}
                          disabled={previewLoading}
                          className="text-slate-400 hover:text-violet-600 hover:bg-violet-50"
                          title="Preview Survey Form"
                        >
                          <ExternalLink className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            setModalState({ type: "view", id: survey.id })
                          }
                          className="text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
                          title="View Details"
                        >
                          <Eye className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenEdit(survey.id)}
                          className="text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
                          title="Edit Questions & Details"
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setModalState({ type: "settings", id: survey.id })
                            setSettingsTitle(survey.title)
                            setSettingsTargetCohort(survey.targetCohort ?? "Class of 2024")
                            setSettingsStatus(survey.status)
                          }}
                          className="text-slate-400 hover:text-slate-900"
                          title="Settings"
                        >
                          <Settings className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenDistribute(survey.id)}
                          className="text-slate-400 hover:text-emerald-600 hover:bg-emerald-50"
                          title="Distribute"
                        >
                          <Share2 className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteConfirmId(survey.id)}
                          className="text-slate-400 hover:text-red-600 hover:bg-red-50"
                          title="Delete"
                        >
                          <Trash className="size-4" />
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
        onOpenChange={(open) => !open && handleCloseModal()}
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
              <Button variant="outline" onClick={handleCloseModal} className="h-9">
                Cancel
              </Button>
              <Button
                onClick={handleSaveSurvey}
                disabled={!surveyTitle.trim() || saving}
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

          <div className="flex flex-1 overflow-hidden">
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
                          className="w-[var(--anchor-width)] p-1 flex flex-col gap-0.5 bg-white border border-slate-200 rounded-lg shadow-md animate-in fade-in-0 zoom-in-95 duration-100"
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
                        Description{" "}
                        <span className="font-normal text-slate-400">
                          (optional)
                        </span>
                      </label>
                      <textarea
                        rows={3}
                        className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-none"
                        placeholder="Brief description of this survey's goals…"
                        value={surveyDescription}
                        onChange={(e) => setSurveyDescription(e.target.value)}
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
                            className="rounded-xl border border-slate-200/80 bg-white shadow-sm"
                          >
                            {/* Section header */}
                            <div className="flex items-start gap-3 p-4 pb-3 border-b border-slate-100">
                              <div className="flex items-center gap-1.5 pt-1">
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
                                  className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-xs outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-none"
                                  placeholder="Section description (optional)"
                                  value={sec.description ?? ""}
                                  onChange={(e) =>
                                    updateSection(secIdx, {
                                      description: e.target.value,
                                    })
                                  }
                                />
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
                                      className="group/q rounded-lg border border-slate-200/70 bg-white shadow-sm transition-shadow hover:shadow-md"
                                    >
                                      <div className="flex items-start gap-2 p-3">
                                        <div className="flex items-center gap-1.5 pt-1">
                                          <span className="flex size-5 items-center justify-center rounded-md bg-indigo-50 text-[10px] font-bold text-indigo-600">
                                            {qIdx + 1}
                                          </span>
                                        </div>

                                        <div className="flex-1 min-w-0 space-y-2">
                                          <Input
                                            placeholder={`Question ${qIdx + 1}`}
                                            value={q.text}
                                            onChange={(e) =>
                                              updateQuestion(secIdx, qIdx, {
                                                text: e.target.value,
                                              })
                                            }
                                            className="bg-slate-50/60 focus-visible:bg-white"
                                          />

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
                                                className="w-[var(--anchor-width)] p-1 flex flex-col gap-0.5 bg-white border border-slate-200 rounded-lg shadow-md animate-in fade-in-0 zoom-in-95 duration-100"
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

                                        <Button
                                          variant="ghost"
                                          size="icon-xs"
                                          onClick={() => removeQuestion(secIdx, q.id)}
                                          className="mt-0.5 text-slate-300 opacity-0 transition-opacity group-hover/q:opacity-100 hover:text-red-500 hover:bg-red-50"
                                        >
                                          <X className="size-3.5" />
                                        </Button>
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
                                              <div key={optIdx} className="flex items-center gap-2">
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
                                              <div key={optIdx} className="flex items-center gap-2">
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
                                              <div key={colIdx} className="flex items-center gap-2">
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

      {/* ── View / Settings Sheet ─────────────────────────────── */}
      <Sheet
        open={modalState !== null && (modalState.type === "view" || modalState.type === "settings")}
        onOpenChange={(open) => !open && handleCloseModal()}
      >
        <SheetContent>
          
          {modalState?.type === "view" && (
            (() => {
              const survey = surveys.find(s => s.id === modalState.id)
              if (!survey) return null
              return (
                <>
                  <SheetHeader className="gap-3 border-b border-slate-100 pb-5">
                    <div className="flex items-center gap-3">
                      <div className="flex size-10 items-center justify-center rounded-xl bg-indigo-50 ring-1 ring-indigo-100">
                        <FileText className="size-5 text-indigo-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <SheetTitle className="text-base font-semibold text-slate-900">
                          {survey.title}
                        </SheetTitle>
                        <SheetDescription className="text-[13px] text-slate-500 mt-0.5">
                          Created {formatDate(survey.dateCreated)}
                        </SheetDescription>
                      </div>
                    </div>
                  </SheetHeader>
                  
                  <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
                    {/* Analytics Overview */}
                    <div>
                      <h4 className="text-[13px] font-semibold text-slate-900 mb-3">Overview</h4>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-4">
                          <div className="flex items-center gap-2 text-slate-500 mb-1">
                            <Users className="size-4" />
                            <span className="text-[12px] font-medium">Responses</span>
                          </div>
                          <div className="text-2xl font-semibold text-slate-900">
                            {survey.responses}
                          </div>
                        </div>
                        <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-4">
                          <div className="flex items-center gap-2 text-slate-500 mb-1">
                            <FileText className="size-4" />
                            <span className="text-[12px] font-medium">Status</span>
                          </div>
                          <div className="text-lg font-semibold text-slate-900 mt-1">
                            <span
                              className={cn(
                                "inline-flex items-center px-2.5 py-1 rounded-md text-[12px] font-medium",
                                survey.status === "Active" && "bg-emerald-50 text-emerald-700",
                                survey.status === "Draft" && "bg-amber-50 text-amber-700",
                                survey.status === "Closed" && "bg-slate-100 text-slate-600"
                              )}
                            >
                              {survey.status}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Sections & Questions Preview */}
                    <div>
                      <h4 className="text-[13px] font-semibold text-slate-900 mb-3">Sections &amp; Questions</h4>
                      {(!survey.sections || survey.sections.length === 0) ? (
                        <p className="text-xs text-slate-500 italic py-2">No sections added yet.</p>
                      ) : (
                        <div className="space-y-4">
                          {survey.sections.map((sec, secIdx) => (
                            <div key={sec.id || secIdx} className="rounded-xl border border-slate-200/80 bg-white">
                              <div className="px-4 py-3 border-b border-slate-100">
                                <span className="text-sm font-semibold text-slate-900">
                                  {secIdx + 1}. {sec.title || "Untitled Section"}
                                </span>
                                {sec.description && (
                                  <p className="text-xs text-slate-500 mt-0.5">{sec.description}</p>
                                )}
                              </div>
                              <div className="px-4 py-3 space-y-3">
                                {(!sec.questions || sec.questions.length === 0) ? (
                                  <p className="text-xs text-slate-400 italic">No questions in this section.</p>
                                ) : (
                                  sec.questions.map((q, qIdx) => (
                                    <div key={q.id || qIdx} className="text-sm text-slate-600">
                                      <span className="font-medium text-slate-900 block mb-1">
                                        {qIdx + 1}. {q.text || "Untitled Question"}
                                      </span>
                                      {q.type === "scale" && (
                                        <div className="mt-2 space-y-1">
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
                                        <div className="h-16 rounded-md border border-slate-200 bg-slate-50 mt-2 p-2 text-slate-400 text-xs">
                                          Text response area...
                                        </div>
                                      )}
                                      {["single_choice", "multiple_choice", "ranking"].includes(q.type) && (
                                        <div className="space-y-1.5 mt-2">
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
                                        <div className="mt-2 space-y-2">
                                          <div className="text-[10px] text-slate-400 font-semibold uppercase">Rows:</div>
                                          <div className="space-y-1 pl-2">
                                            {(q.options ?? []).map((opt, optIdx) => (
                                              <div key={optIdx} className="text-xs text-slate-650">• {opt || `Row ${optIdx + 1}`}</div>
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
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <SheetFooter className="flex-row justify-end gap-2 border-t border-slate-100 bg-white px-5 py-3">
                    <Button variant="outline" onClick={handleCloseModal}>
                      Close
                    </Button>
                  </SheetFooter>
                </>
              )
            })()
          )}

          {modalState?.type === "settings" && (
            (() => {
              const survey = surveys.find(s => s.id === modalState.id)
              if (!survey) return null
              return (
                <>
                  <SheetHeader className="gap-3 border-b border-slate-100 pb-5">
                    <div className="flex items-center gap-3">
                      <div className="flex size-10 items-center justify-center rounded-xl bg-slate-100 ring-1 ring-slate-200">
                        <Settings className="size-5 text-slate-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <SheetTitle className="text-base font-semibold text-slate-900">
                          Survey Settings
                        </SheetTitle>
                        <SheetDescription className="text-[13px] text-slate-500 mt-0.5">
                          Manage configuration for {survey.title}
                        </SheetDescription>
                      </div>
                    </div>
                  </SheetHeader>
                  
                  <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <label className="text-[13px] font-medium text-slate-700">
                          Survey Title
                        </label>
                        <Input
                          value={settingsTitle}
                          onChange={(e) => setSettingsTitle(e.target.value)}
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[13px] font-medium text-slate-700">
                          Status
                        </label>
                        <Popover open={settingsStatusOpen} onOpenChange={setSettingsStatusOpen}>
                          <PopoverTrigger
                            render={
                              <Button
                                variant="outline"
                                type="button"
                                className="h-8 w-full justify-between font-normal text-sm border border-input bg-transparent hover:bg-slate-50/50 hover:border-slate-300 transition-colors cursor-pointer outline-none focus-visible:ring-3 focus-visible:ring-ring/50 select-none text-left"
                              >
                                <span>{settingsStatus}</span>
                                <ChevronDown className="size-4 text-slate-400 shrink-0 opacity-60" />
                              </Button>
                            }
                          />
                          <PopoverContent
                            align="start"
                            className="w-[var(--anchor-width)] p-1 flex flex-col gap-0.5 bg-white border border-slate-200 rounded-lg shadow-md animate-in fade-in-0 zoom-in-95 duration-100"
                          >
                            {["Active", "Draft", "Closed"].map((statusOption) => {
                              const isSelected = settingsStatus === statusOption
                              return (
                                <button
                                  type="button"
                                  key={statusOption}
                                  onClick={() => {
                                    setSettingsStatus(statusOption)
                                    setSettingsStatusOpen(false)
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
                          Target Cohort
                        </label>
                        <Popover open={settingsCohortOpen} onOpenChange={setSettingsCohortOpen}>
                          <PopoverTrigger
                            render={
                              <Button
                                variant="outline"
                                type="button"
                                className="h-8 w-full justify-between font-normal text-sm border border-input bg-transparent hover:bg-slate-50/50 hover:border-slate-300 transition-colors cursor-pointer outline-none focus-visible:ring-3 focus-visible:ring-ring/50 select-none text-left"
                              >
                                <span>{settingsTargetCohort}</span>
                                <ChevronDown className="size-4 text-slate-400 shrink-0 opacity-60" />
                              </Button>
                            }
                          />
                          <PopoverContent
                            align="start"
                            className="w-[var(--anchor-width)] p-1 flex flex-col gap-0.5 bg-white border border-slate-200 rounded-lg shadow-md animate-in fade-in-0 zoom-in-95 duration-100"
                          >
                            {["Class of 2024", "Class of 2025", "All Alumni"].map((cohortOption) => {
                              const isSelected = settingsTargetCohort === cohortOption
                              return (
                                <button
                                  type="button"
                                  key={cohortOption}
                                  onClick={() => {
                                    setSettingsTargetCohort(cohortOption)
                                    setSettingsCohortOpen(false)
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
                    </div>
                  </div>

                  <SheetFooter className="flex-row justify-end gap-2 border-t border-slate-100 bg-white px-5 py-3">
                    <Button variant="outline" onClick={handleCloseModal}>
                      Cancel
                    </Button>
                    <Button className="bg-slate-900 hover:bg-slate-800 text-white border-0" onClick={handleSaveSettings}>
                      Save Changes
                    </Button>
                  </SheetFooter>
                </>
              )
            })()
          )}
        </SheetContent>
      </Sheet>

      {/* ── Generate Preview Dialog ──────────────────────────────────── */}
      <Dialog
        open={showGeneratePreview}
        onOpenChange={(open) => !open && setShowGeneratePreview(false)}
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
                className="h-10 px-5 text-[13px] font-medium"
              >
                Cancel
              </Button>
              <Button
                onClick={handleConfirmGenerate}
                disabled={generating}
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
        onOpenChange={(open) => !open && setDeleteConfirmId(null)}
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
            >
              Delete Survey
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Distribution Dialog ─────────────────────────────────────── */}
      <Dialog
        open={distributeSurveyId !== null}
        onOpenChange={(open) => !open && setDistributeSurveyId(null)}
      >
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col p-0 gap-0" showCloseButton={false}>
          <div className="h-[80px] shrink-0 bg-gradient-to-br from-emerald-600 via-emerald-500 to-teal-500" />

          <div className="flex-1 overflow-y-auto px-6 -mt-[50px] pb-6">
            <div className="relative mb-4 overflow-hidden rounded-xl border-t-[6px] border-t-emerald-500 bg-white shadow-sm ring-1 ring-black/[0.04]">
              <div className="px-6 pb-5 pt-6">
                <div className="mb-3 flex items-center gap-2">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                    <Share2 className="size-[16px]" />
                  </div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-600">
                    Distribute Survey
                  </span>
                </div>
                <h2 className="text-xl font-semibold tracking-tight text-slate-900">
                  Share with Alumni
                </h2>
                <p className="mt-1.5 text-[14px] leading-relaxed text-slate-500">
                  Create shareable links to distribute this survey to alumni respondents.
                </p>
              </div>
            </div>

            {distLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="size-5 animate-spin text-slate-400" />
              </div>
            ) : (
              <div className="space-y-3">
                <Button
                  onClick={handleCreateDistribution}
                  disabled={distCreating}
                  className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white border-0"
                >
                  {distCreating ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Link className="size-4" />
                  )}
                  Create New Link
                </Button>

                {distributions.length === 0 && !distLoading && (
                  <p className="pt-2 text-center text-xs text-slate-400">
                    No distribution links created yet.
                  </p>
                )}

                {distributions.map((d) => {
                  const surveyUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/survey/${d.token}`
                  return (
                    <div
                      key={d.id}
                      className={cn(
                        "rounded-xl border bg-white px-5 py-4 shadow-sm ring-1 ring-black/[0.04] transition-opacity",
                        !d.isActive && "opacity-50",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                "inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                                d.isActive
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-slate-100 text-slate-500",
                              )}
                            >
                              {d.isActive ? "Active" : "Revoked"}
                            </span>
                            <span className="text-[11px] text-slate-400">
                              {new Date(d.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                          <p className="mt-1.5 truncate text-[12px] font-mono text-slate-600">
                            {surveyUrl}
                          </p>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          {d.isActive && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                onClick={() => handleCopyLink(d.token)}
                                className="text-slate-400 hover:text-emerald-600 hover:bg-emerald-50"
                                title="Copy link"
                              >
                                {copiedToken === d.token ? (
                                  <CheckCircle2 className="size-3.5 text-emerald-500" />
                                ) : (
                                  <Copy className="size-3.5" />
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                onClick={() => handleRevokeDistribution(d.id)}
                                className="text-slate-400 hover:text-red-600 hover:bg-red-50"
                                title="Revoke"
                              >
                                <Ban className="size-3.5" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center justify-end border-t border-slate-100 bg-white px-6 py-3">
            <Button
              variant="outline"
              onClick={() => setDistributeSurveyId(null)}
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Preview Dialog ──────────────────────────────────────────── */}
      {previewSurvey && (
        <SurveyPreview
          survey={previewSurvey}
          open={previewSurvey !== null}
          onClose={handleClosePreview}
        />
      )}
    </div>
  )
}
