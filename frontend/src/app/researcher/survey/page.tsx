"use client"

import { useState } from "react"
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
  GripVertical,
  ChevronDown,
  ClipboardList,
  X,
  Check,
  Pencil,
} from "lucide-react"
import { cn, formatDate } from "@/lib/utils"

const QUESTION_TYPES = [
  { value: "text", label: "Text Response", icon: Type },
  { value: "choice", label: "Multiple Choice", icon: ListChecks },
  { value: "rating", label: "1–5 Rating", icon: Star },
] as const

type QuestionType = (typeof QUESTION_TYPES)[number]["value"]

interface SurveyQuestion {
  id: string
  text: string
  type: QuestionType
  options?: string[]
}

interface Survey {
  id: string
  title: string
  status: string
  responses: number
  dateCreated: string
  targetCohort?: string
  description?: string
  questions?: SurveyQuestion[]
}

// Mock data
const initialSurveys: Survey[] = [
  {
    id: "surv_1",
    title: "Class of 2024 Exit Survey",
    status: "Active",
    responses: 342,
    dateCreated: "2024-05-15",
    targetCohort: "Class of 2024",
    description: "Exit survey for the graduating class of 2024.",
    questions: [
      { id: "q1", text: "How satisfied are you with the program overall?", type: "rating", options: [] },
      { id: "q2", text: "What were the primary highlights of your time with us?", type: "text", options: [] },
    ],
  },
  {
    id: "surv_2",
    title: "Alumni Mid-Career Check-in",
    status: "Draft",
    responses: 0,
    dateCreated: "2024-06-01",
    targetCohort: "All Alumni",
    description: "Mid-career feedback and check-in survey.",
    questions: [
      { id: "q1", text: "Are you still working in your field of study?", type: "choice", options: ["Yes", "No, changed fields", "Partially"] },
    ],
  },
  {
    id: "surv_3",
    title: "Engineering Department Feedback",
    status: "Closed",
    responses: 89,
    dateCreated: "2023-11-10",
    targetCohort: "Class of 2024",
    description: "Specific curriculum feedback for the engineering department.",
    questions: [],
  },
]

type ModalState =
  | { type: "create" }
  | { type: "edit"; id: string }
  | { type: "view"; id: string }
  | { type: "settings"; id: string }
  | null

export default function SurveyPage() {
  const [surveys, setSurveys] = useState(initialSurveys)
  const [modalState, setModalState] = useState<ModalState>(null)
  const [questions, setQuestions] = useState<SurveyQuestion[]>([])
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

  const handleDelete = (id: string) => {
    setSurveys(surveys.filter((s) => s.id !== id))
  }

  const handleCloseModal = () => {
    setModalState(null)
    setQuestions([])
    setSurveyTitle("")
    setSurveyDescription("")
    setTargetCohort("Class of 2024")
  }

  const handleOpenCreate = () => {
    setSurveyTitle("")
    setSurveyDescription("")
    setTargetCohort("Class of 2024")
    setQuestions([])
    setModalState({ type: "create" })
  }

  const handleOpenEdit = (id: string) => {
    const survey = surveys.find((s) => s.id === id)
    if (survey) {
      setSurveyTitle(survey.title)
      setSurveyDescription(survey.description ?? "")
      setTargetCohort(survey.targetCohort ?? "Class of 2024")
      setQuestions(survey.questions ?? [])
      setModalState({ type: "edit", id })
    }
  }

  const handleSaveSurvey = () => {
    if (!surveyTitle.trim()) return

    if (modalState?.type === "create") {
      const newSurvey: Survey = {
        id: "surv_" + Date.now(),
        title: surveyTitle,
        status: "Draft",
        responses: 0,
        dateCreated: new Date().toISOString().split("T")[0] || "",
        targetCohort,
        description: surveyDescription,
        questions,
      }
      setSurveys((prev) => [newSurvey, ...prev])
    } else if (modalState?.type === "edit") {
      const targetId = modalState.id
      setSurveys((prev) =>
        prev.map((s) =>
          s.id === targetId
            ? {
                ...s,
                title: surveyTitle,
                targetCohort,
                description: surveyDescription,
                questions,
              }
            : s
        )
      )
    }
    handleCloseModal()
  }

  const addQuestion = () => {
    setQuestions((prev) => [
      ...prev,
      { id: Date.now().toString(), text: "", type: "text", options: [""] },
    ])
  }

  const updateQuestion = (idx: number, patch: Partial<SurveyQuestion>) => {
    setQuestions((prev) => {
      const next = [...prev]
      Object.assign(next[idx]!, patch)
      return next
    })
  }

  const removeQuestion = (id: string) => {
    setQuestions((prev) => prev.filter((q) => q.id !== id))
  }

  const updateOption = (qIdx: number, optIdx: number, value: string) => {
    setQuestions((prev) => {
      const next = [...prev]
      const q = next[qIdx]!
      const opts = [...(q.options ?? [])]
      opts[optIdx] = value
      next[qIdx] = { ...q, options: opts }
      return next
    })
  }

  const removeOption = (qIdx: number, optIdx: number) => {
    setQuestions((prev) => {
      const next = [...prev]
      const q = next[qIdx]!
      const opts = [...(q.options ?? [])]
      opts.splice(optIdx, 1)
      next[qIdx] = { ...q, options: opts }
      return next
    })
  }

  const addOption = (qIdx: number) => {
    setQuestions((prev) => {
      const next = [...prev]
      const q = next[qIdx]!
      const opts = [...(q.options ?? [])]
      opts.push("")
      next[qIdx] = { ...q, options: opts }
      return next
    })
  }

  const questionTypeIcon = (type: QuestionType) => {
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
        <Button
          onClick={handleOpenCreate}
          className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white border-0"
        >
          <Plus className="size-4" />
          Create Survey
        </Button>
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
              {surveys.length === 0 ? (
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

      {/* ── Create / View / Settings Sheet ─────────────────────────────── */}
      <Sheet
        open={modalState !== null}
        onOpenChange={(open) => !open && handleCloseModal()}
      >
        <SheetContent
          className={cn(
            (modalState?.type === "create" || modalState?.type === "edit") && "sm:max-w-lg"
          )}
        >
          {/* ── Create / Edit Survey ───────────────────────────────────── */}
          {(modalState?.type === "create" || modalState?.type === "edit") && (
            <>
              <SheetHeader className="gap-3 border-b border-slate-100 pb-5">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-indigo-50 ring-1 ring-indigo-100">
                    <ClipboardList className="size-5 text-indigo-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <SheetTitle className="text-base font-semibold text-slate-900">
                      {modalState.type === "create" ? "Create New Survey" : "Edit Survey"}
                    </SheetTitle>
                    <SheetDescription className="text-[13px] text-slate-500 mt-0.5">
                      {modalState.type === "create" 
                        ? "Define a new survey for the PEII system." 
                        : "Modify the title, target cohort, description, and questions for this survey."}
                    </SheetDescription>
                  </div>
                </div>
              </SheetHeader>

              {/* Scrollable form body */}
              <div className="flex-1 overflow-y-auto px-5 py-5">
                <div className="space-y-6">
                  {/* ── Section: Details ─────────────────────────────── */}
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

                  {/* ── Section: Questions ───────────────────────────── */}
                  <fieldset className="space-y-3">
                    <legend className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                      <span className="flex size-5 items-center justify-center rounded-md bg-slate-100 text-[10px] font-bold text-slate-500">
                        2
                      </span>
                      Questions
                    </legend>

                    {questions.length === 0 ? (
                      /* ── Empty state ──────────────────────────────── */
                      <button
                        type="button"
                        onClick={addQuestion}
                        className="group flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/40 px-4 py-8 text-center transition-colors hover:border-indigo-300 hover:bg-indigo-50/30"
                      >
                        <div className="flex size-10 items-center justify-center rounded-full bg-white ring-1 ring-slate-200 transition-shadow group-hover:ring-indigo-200 group-hover:shadow-sm">
                          <Plus className="size-5 text-slate-400 group-hover:text-indigo-500 transition-colors" />
                        </div>
                        <div>
                          <p className="text-[13px] font-medium text-slate-600 group-hover:text-indigo-600 transition-colors">
                            Add your first question
                          </p>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            Text, multiple choice, or rating scale
                          </p>
                        </div>
                      </button>
                    ) : (
                      /* ── Question list ────────────────────────────── */
                      <div className="space-y-3">
                        {questions.map((q, idx) => (
                          <div
                            key={q.id}
                            className="group/q rounded-xl border border-slate-200/80 bg-white shadow-sm transition-shadow hover:shadow-md"
                          >
                            {/* Card header row */}
                            <div className="flex items-start gap-2 p-3">
                              <div className="flex items-center gap-1.5 pt-1">
                                <GripVertical className="size-3.5 text-slate-300" />
                                <span className="flex size-5 items-center justify-center rounded-md bg-indigo-50 text-[10px] font-bold text-indigo-600">
                                  {idx + 1}
                                </span>
                              </div>

                              <div className="flex-1 min-w-0 space-y-2">
                                <Input
                                  placeholder={`Question ${idx + 1}`}
                                  value={q.text}
                                  onChange={(e) =>
                                    updateQuestion(idx, {
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
                                               if (
                                                 newType === "choice" &&
                                                 (!q.options || q.options.length === 0)
                                               ) {
                                                 patch.options = [
                                                   "Option 1",
                                                   "Option 2",
                                                 ]
                                               }
                                               updateQuestion(idx, patch)
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
                                onClick={() => removeQuestion(q.id)}
                                className="mt-0.5 text-slate-300 opacity-0 transition-opacity group-hover/q:opacity-100 hover:text-red-500 hover:bg-red-50"
                              >
                                <X className="size-3.5" />
                              </Button>
                            </div>

                            {/* Multiple-choice options */}
                            {q.type === "choice" && (
                              <div className="border-t border-slate-100 bg-slate-50/30 px-3 py-3 rounded-b-xl">
                                <div className="space-y-1.5 pl-7">
                                  {q.options?.map((opt, optIdx) => (
                                    <div
                                      key={optIdx}
                                      className="flex items-center gap-2"
                                    >
                                      <span className="flex size-4 shrink-0 items-center justify-center rounded-full border border-slate-300 text-[9px] font-semibold text-slate-400">
                                        {String.fromCharCode(65 + optIdx)}
                                      </span>
                                      <Input
                                        className="h-7 flex-1 bg-white text-xs"
                                        placeholder={`Option ${optIdx + 1}`}
                                        value={opt}
                                        onChange={(e) =>
                                          updateOption(
                                            idx,
                                            optIdx,
                                            e.target.value
                                          )
                                        }
                                      />
                                      <Button
                                        variant="ghost"
                                        size="icon-xs"
                                        className="text-slate-300 hover:text-red-500 hover:bg-red-50"
                                        onClick={() =>
                                          removeOption(idx, optIdx)
                                        }
                                      >
                                        <Trash className="size-3" />
                                      </Button>
                                    </div>
                                  ))}
                                  <Button
                                    variant="ghost"
                                    size="xs"
                                    className="mt-1 h-6 gap-1 px-1.5 text-[11px] text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                                    onClick={() => addOption(idx)}
                                  >
                                    <Plus className="size-3" />
                                    Add Option
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}

                        {/* Add-another button */}
                        <button
                          type="button"
                          onClick={addQuestion}
                          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-200 bg-white px-3 py-2 text-[12px] font-medium text-slate-500 transition-colors hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50/30"
                        >
                          <Plus className="size-3.5" />
                          Add Question
                        </button>
                      </div>
                    )}
                  </fieldset>
                </div>
              </div>

              {/* Sticky footer */}
              <SheetFooter className="flex-row justify-end gap-2 border-t border-slate-100 bg-white px-5 py-3">
                <Button variant="outline" onClick={handleCloseModal}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleSaveSurvey}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white border-0"
                >
                  {modalState.type === "create" ? "Create Survey" : "Save Changes"}
                </Button>
              </SheetFooter>
            </>
          )}

          {/* ── View / Settings ──────────────────────────────────────────── */}
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

                    {/* Questions Preview */}
                    <div>
                      <h4 className="text-[13px] font-semibold text-slate-900 mb-3">Questions (Preview)</h4>
                      {(!survey.questions || survey.questions.length === 0) ? (
                        <p className="text-xs text-slate-500 italic py-2">No questions added yet.</p>
                      ) : (
                        <div className="space-y-3">
                          {survey.questions.map((q, idx) => (
                            <div key={q.id || idx} className="rounded-xl border border-slate-200/80 bg-white p-4 text-sm text-slate-600">
                              <span className="font-medium text-slate-900 block mb-1">
                                {idx + 1}. {q.text || "Untitled Question"}
                              </span>
                              {q.type === "rating" && (
                                <div className="flex gap-2 mt-2">
                                  {[1, 2, 3, 4, 5].map(rating => (
                                    <div key={rating} className="size-8 rounded-md border border-slate-200 bg-slate-50 flex items-center justify-center text-slate-500">
                                      {rating}
                                    </div>
                                  ))}
                                </div>
                              )}
                              {q.type === "text" && (
                                <div className="h-16 rounded-md border border-slate-200 bg-slate-50 mt-2 p-2 text-slate-400 text-xs">
                                  Text response area...
                                </div>
                              )}
                              {q.type === "choice" && (
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
                        <Input defaultValue={survey.title} />
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
                    <Button className="bg-slate-900 hover:bg-slate-800 text-white border-0" onClick={handleCloseModal}>
                      Save Changes
                    </Button>
                  </SheetFooter>
                </>
              )
            })()
          )}
        </SheetContent>
      </Sheet>

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
              onClick={() => {
                if (deleteConfirmId) {
                  handleDelete(deleteConfirmId)
                  setDeleteConfirmId(null)
                }
              }}
            >
              Delete Survey
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
