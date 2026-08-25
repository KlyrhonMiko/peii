"use client"

import { type FormEvent, type ComponentType, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  ClipboardList,
  Star,
  ArrowUpDown,
  Table,
  Calendar,
  Upload,
  ToggleLeft,
  ListChecks,
  Type,
  Hash,
  Circle,
  ArrowLeft,
  ArrowRight,
  Loader2,
  CheckCircle,
  AlertCircle,
} from "lucide-react"

import {
  createPublicSurveySubmission,
  publicSurveyErrorCode,
  parsePublicSurveyAccepted,
  parseRetryAfter,
  type PublicAnswerValue,
  type PublicAnswers,
  type PublicSurveyConsent,
  type PublicSurveyQuestion,
  type PublicSurveySection,
} from "@/lib/public-survey"

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? ""

interface ClientSurveyFormProps {
  title: string
  description: string | null
  consent: PublicSurveyConsent
  sections: PublicSurveySection[]
  token: string
}

const TYPE_ICON: Record<string, ComponentType<{ className?: string }>> = {
  single_choice: Circle,
  multiple_choice: ListChecks,
  text: Type,
  number: Hash,
  scale: Star,
  ranking: ArrowUpDown,
  matrix: Table,
  datetime: Calendar,
  file: Upload,
  boolean: ToggleLeft,
}

const TYPE_LABEL: Record<string, string> = {
  single_choice: "Single Choice",
  multiple_choice: "Multiple Choice",
  text: "Text",
  number: "Number",
  scale: "Scale",
  ranking: "Ranking",
  matrix: "Matrix",
  datetime: "Date/Time",
  file: "File Upload",
  boolean: "Yes/No",
}

function isBlankAnswer(value: PublicAnswerValue | undefined): boolean {
  return value === undefined ||
    (typeof value === "string" && !value.trim()) ||
    (Array.isArray(value) && value.length === 0) ||
    (typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0)
}

function isAnswerMap(value: PublicAnswerValue | undefined): value is Record<string, string> {
  return typeof value === "object" && value !== null && !Array.isArray(value) &&
    Object.values(value).every((answer) => typeof answer === "string")
}

function matrixValidationError(
  question: PublicSurveyQuestion,
  value: PublicAnswerValue | undefined,
): string | null {
  if (!isAnswerMap(value)) return "Complete every matrix row"
  const rows = question.options ?? []
  const configuredColumns = question.config?.columns
  const columns = Array.isArray(configuredColumns)
    ? configuredColumns.filter((column): column is string => typeof column === "string")
    : ["Poor", "Fair", "Good", "Excellent"]
  if (
    Object.keys(value).length !== rows.length ||
    rows.some((row) => !Object.hasOwn(value, row)) ||
    Object.values(value).some((answer) => !columns.includes(answer))
  ) {
    return "Complete every matrix row"
  }
  return null
}

export function ClientSurveyForm({
  title,
  description,
  consent,
  sections,
  token,
}: ClientSurveyFormProps) {
  const [sectionIdx, setSectionIdx] = useState(0)
  const [answers, setAnswers] = useState<PublicAnswers>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [validationAlertOpen, setValidationAlertOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [consentAccepted, setConsentAccepted] = useState(false)
  const [consentTouched, setConsentTouched] = useState(false)
  const [staleConsent, setStaleConsent] = useState(false)
  const [retryAt, setRetryAt] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const idempotencyKey = useRef<string | null>(null)
  const submittingRef = useRef(false)

  useEffect(() => {
    if (retryAt === null) return
    const timer = window.setInterval(() => {
      const current = Date.now()
      setNow(current)
      if (current >= retryAt) setRetryAt(null)
    }, 250)
    return () => window.clearInterval(timer)
  }, [retryAt])

  const section = sections[sectionIdx]
  if (submitted) {
    return (
      <div className="min-h-screen bg-[#f0f2f5] flex items-center justify-center">
        <div className="mx-auto w-full max-w-[480px] px-4">
          <div className="overflow-hidden rounded-xl border-t-[6px] border-t-emerald-500 bg-white shadow-sm ring-1 ring-black/[0.04] px-7 pb-8 pt-7 text-center">
            <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-emerald-50">
              <CheckCircle className="size-7 text-emerald-500" />
            </div>
            <h2 className="text-xl font-semibold tracking-tight text-slate-900">
              Response Submitted
            </h2>
            <p className="mt-2 text-[14px] leading-relaxed text-slate-500">
              Thank you for completing the survey. Your feedback helps us improve
              the quality of education at Pasig City.
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (!section) return null

  const isFirst = sectionIdx === 0
  const isLast = sectionIdx === sections.length - 1
  const retryRemaining = retryAt === null ? 0 : Math.max(0, Math.ceil((retryAt - now) / 1000))
  const retryBlocked = retryRemaining > 0

  const validateSection = () => {
    let isValid = true
    const newErrors: Record<string, string> = {}
    for (const question of section.questions) {
      const value = answers[question.id]
      if (question.question_type === "matrix" && (question.is_required || !isBlankAnswer(value))) {
        const matrixError = matrixValidationError(question, value)
        if (matrixError) {
          newErrors[question.id] = matrixError
          isValid = false
        }
        continue
      }
      if (question.is_required) {
        const rankingHasDefault = question.question_type === "ranking" && (question.options?.length ?? 0) > 0
        if (!rankingHasDefault && isBlankAnswer(value)) {
          newErrors[question.id] = "This question is required"
          isValid = false
        }
      }
    }
    setErrors(newErrors)
    return isValid
  }

  const goNext = () => {
    if (submitting) return
    if (!validateSection()) {
      setValidationAlertOpen(true)
      return
    }
    if (!isLast) setSectionIdx((previous) => previous + 1)
  }

  const goPrev = () => {
    if (submitting) return
    if (!isFirst) setSectionIdx((previous) => previous - 1)
  }

  const setAnswer = (questionId: string, value: PublicAnswerValue) => {
    if (submitting) return
    setAnswers((previous) => ({ ...previous, [questionId]: value }))
    if (errors[questionId]) {
      setErrors((previous) => {
        const next = { ...previous }
        delete next[questionId]
        return next
      })
    }
  }

  const toggleMultiple = (questionId: string, option: string) => {
    const current = (answers[questionId] as string[] | undefined) ?? []
    const nextList = current.includes(option)
      ? current.filter((value) => value !== option)
      : [...current, option]
    setAnswer(questionId, nextList)
  }

  const handleSubmit = async () => {
    if (submittingRef.current || submitting || staleConsent || retryBlocked) return
    submittingRef.current = true
    setSubmitting(true)
    setSubmitError(null)
    try {
      const submittedAnswers: PublicAnswers = { ...answers }
      for (const currentSection of sections) {
        for (const question of currentSection.questions) {
          if (
            !(question.id in submittedAnswers) &&
            question.question_type === "ranking" &&
            question.options
          ) {
            submittedAnswers[question.id] = question.options
          }
        }
      }
      idempotencyKey.current ??= crypto.randomUUID()
      const response = await fetch(`${API_BASE}/survey/${encodeURIComponent(token)}/respond`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey.current,
        },
        body: JSON.stringify(createPublicSurveySubmission(submittedAnswers, consent.version)),
      })
      if (!response.ok) {
        let errorPayload: unknown = null
        try {
          errorPayload = await response.json()
        } catch {
          // Fall through to the generic status-specific message.
        }
        const errorCode = publicSurveyErrorCode(errorPayload)
        if (response.status === 409 && errorCode === "stale_consent") {
          idempotencyKey.current = null
          setStaleConsent(true)
          setSubmitError("This consent notice is out of date. Reload and review the notice before submitting again.")
        } else if (response.status === 409 && errorCode === "idempotency_conflict") {
          setSubmitError("We could not confirm whether your response was submitted. It may already be recorded; please do not create a duplicate response.")
        } else if (response.status === 409) {
          setSubmitError("We could not confirm whether your response was submitted. Please do not create a duplicate response.")
        } else if (response.status === 429) {
          const retryAfter = parseRetryAfter(response.headers.get("Retry-After"))
          if (retryAfter !== null) setRetryAt(Date.now() + retryAfter * 1000)
          setSubmitError(
            retryAfter === null
              ? "Too many attempts. Please try again later."
              : `Too many attempts. Please try again in ${retryAfter} seconds.`,
          )
        } else {
          if (response.status < 500) idempotencyKey.current = null
          setSubmitError(
            response.status >= 500
              ? "We could not submit your response. Please try again."
              : "We could not submit your response. Please review your answers and try again.",
          )
        }
        return
      }
      let payload: unknown
      try {
        payload = await response.json()
      } catch {
        setSubmitError("We could not confirm your response. Please try again.")
        return
      }
      if (parsePublicSurveyAccepted(payload) === null) {
        setSubmitError("We could not confirm your response. Please try again.")
        return
      }
      setRetryAt(null)
      setSubmitted(true)
    } catch {
      setSubmitError("We could not submit your response. Please try again.")
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting || staleConsent || retryBlocked) return
    if (!consentAccepted) {
      setConsentTouched(true)
      return
    }
    if (!isLast) {
      goNext()
      return
    }
    if (!validateSection()) {
      setValidationAlertOpen(true)
      return
    }
    void handleSubmit()
  }

  return (
    <div className="min-h-screen bg-[#f0f2f5]">
      <div className="h-[240px] bg-gradient-to-br from-indigo-600 via-indigo-500 to-violet-500" />

      <fieldset disabled={submitting} aria-busy={submitting} className="contents">
        <form onSubmit={onSubmit} noValidate>
          <div className={`mx-auto w-full max-w-[640px] px-4 -mt-[200px] pb-12 ${submitting ? "pointer-events-none opacity-90" : ""}`}>
            <div className="relative mb-4 overflow-hidden rounded-xl border-t-[6px] border-t-indigo-500 bg-white shadow-sm ring-1 ring-black/[0.04]">
              <div className="px-7 pb-6 pt-7">
                <div className="mb-4 flex items-center gap-2">
                  <div className="flex size-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                    <ClipboardList className="size-[18px]" />
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
                    Alumni Survey
                  </span>
                </div>
                <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
                {description && (
                  <p className="mt-2 max-w-md text-[15px] leading-relaxed text-slate-500">{description}</p>
                )}
                <p className="mt-3 text-[11px] text-slate-400">
                  {Object.keys(answers).length} of {sections.reduce((total, current) => total + current.questions.length, 0)} answered
                </p>
              </div>
            </div>

            <div className="mb-4">
              <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
                <span>Section {sectionIdx + 1} of {sections.length}</span>
                <span>{Math.round(((sectionIdx + 1) / sections.length) * 100)}% complete</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-indigo-500 transition-all duration-300"
                  style={{ width: `${((sectionIdx + 1) / sections.length) * 100}%` }}
                />
              </div>
            </div>

            <div className="mb-4 rounded-xl border-l-4 border-l-violet-500 bg-white px-7 py-5 shadow-sm ring-1 ring-black/[0.04]">
              <h2 className="text-lg font-semibold text-slate-900">{section.title || `Section ${sectionIdx + 1}`}</h2>
              {section.description && <p className="mt-1 text-[14px] leading-relaxed text-slate-500">{section.description}</p>}
            </div>

            <div className="space-y-3">
              {section.questions.map((question) => {
                const errorId = `${question.id}-error`
                const hasError = Boolean(errors[question.id])
                const fieldProps = {
                  "aria-invalid": hasError,
                  "aria-describedby": hasError ? errorId : undefined,
                }
                return (
                  <fieldset
                    key={question.id}
                    aria-invalid={hasError}
                    aria-describedby={hasError ? errorId : undefined}
                    className={`rounded-xl bg-white px-7 py-5 shadow-sm ring-1 transition-all ${hasError ? "bg-red-50/10 ring-red-400" : "ring-black/[0.04]"}`}
                  >
                    <legend className="mb-4 block text-sm font-medium text-slate-800">
                      {question.question_text}
                      {question.is_required && <span className="ml-1 text-red-500" aria-hidden="true">*</span>}
                      {question.is_required && <span className="sr-only"> (required)</span>}
                    </legend>
                    <div className="mb-1 flex items-center gap-2">
                      {(() => {
                        const Icon = TYPE_ICON[question.question_type] ?? Type
                        return <Icon className="size-4 text-indigo-500" />
                      })()}
                      <span className="text-[11px] font-medium uppercase tracking-wider text-indigo-500">
                        {TYPE_LABEL[question.question_type] ?? question.question_type}
                      </span>
                    </div>
                    {hasError && <p id={errorId} role="alert" className="mb-4 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-[13px] font-semibold text-red-600">{errors[question.id]}</p>}

                    {question.question_type === "single_choice" && (
                      <select
                        id={`q-${question.id}`}
                        name={`q-${question.id}`}
                        value={(answers[question.id] as string | undefined) ?? ""}
                        onChange={(event) => setAnswer(question.id, event.target.value)}
                        aria-label={question.question_text}
                        {...fieldProps}
                        className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3.5 text-sm text-slate-700 outline-none transition-colors focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/10"
                      >
                        <option value="">Select an option…</option>
                        {(question.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}
                      </select>
                    )}

                    {question.question_type === "multiple_choice" && (
                      <div className="space-y-2">
                        {(question.options ?? []).map((option) => {
                          const selected = ((answers[question.id] as string[] | undefined) ?? []).includes(option)
                          return (
                            <label key={option} className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3.5 py-3 text-sm transition-all hover:border-indigo-200 hover:bg-slate-50 ${selected ? "border-indigo-200 bg-indigo-50/20 text-indigo-900" : "border-slate-100 bg-slate-50/20 text-slate-700"}`}>
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={() => toggleMultiple(question.id, option)}
                                aria-label={`${question.question_text}: ${option}`}
                                {...fieldProps}
                                className="size-4 accent-indigo-600"
                              />
                              <span className={selected ? "font-medium" : ""}>{option}</span>
                            </label>
                          )
                        })}
                      </div>
                    )}

                    {question.question_type === "text" && (
                      <textarea
                        id={`q-${question.id}`}
                        rows={1}
                        value={(answers[question.id] as string) ?? ""}
                        onChange={(event) => {
                          setAnswer(question.id, event.target.value)
                          event.target.style.height = "auto"
                          event.target.style.height = `${event.target.scrollHeight}px`
                        }}
                        aria-label={question.question_text}
                        {...fieldProps}
                        className="mt-2 w-full resize-none border-b border-slate-200 bg-transparent pb-1.5 pt-1 text-sm font-normal outline-none transition-colors placeholder:text-slate-400 focus:border-indigo-600"
                        placeholder="Your answer"
                      />
                    )}

                    {question.question_type === "number" && (
                      <input
                        id={`q-${question.id}`}
                        type="number"
                        value={(answers[question.id] as number | string | undefined) ?? ""}
                        onChange={(event) => setAnswer(question.id, event.target.value ? Number(event.target.value) : "")}
                        aria-label={question.question_text}
                        {...fieldProps}
                        className="mt-2 w-full max-w-[200px] border-b border-slate-200 bg-transparent pb-1.5 pt-1 text-sm font-normal outline-none transition-colors placeholder:text-slate-400 focus:border-indigo-600"
                        placeholder="Your answer"
                      />
                    )}

                    {question.question_type === "scale" && (() => {
                      const min = typeof question.config?.min === "number" ? question.config.min : 1
                      const max = typeof question.config?.max === "number" ? question.config.max : (question.options?.length ?? 4)
                      const minLabel = typeof question.config?.min_label === "string" ? question.config.min_label : undefined
                      const maxLabel = typeof question.config?.max_label === "string" ? question.config.max_label : undefined
                      const range = Array.from({ length: max - min + 1 }, (_, index) => min + index)
                      return (
                        <div className="flex flex-col items-center justify-center rounded-xl bg-slate-50/30 px-4 py-4">
                          <div className="flex w-full max-w-[500px] items-end justify-between gap-2.5">
                            {minLabel && <span className="mb-2 max-w-[120px] text-right text-xs font-medium leading-tight text-slate-500">{minLabel}</span>}
                            <div className="flex flex-1 items-start justify-center gap-2 sm:gap-4">
                              {range.map((number) => {
                                const selected = answers[question.id] === number
                                return (
                                  <label key={number} className="group flex max-w-[70px] flex-1 cursor-pointer flex-col items-center gap-1.5">
                                    <span className="text-xs font-semibold text-slate-500 group-hover:text-indigo-600">{number}</span>
                                    <input type="radio" name={`scale-${question.id}`} value={number} checked={selected} onChange={() => setAnswer(question.id, number)} aria-label={`${question.question_text}: ${number}`} {...fieldProps} className="size-4 accent-indigo-600" />
                                    {question.options && question.options[number - min] && <span className="mt-1 text-center text-[10px] font-medium leading-tight text-slate-400">{question.options[number - min]}</span>}
                                  </label>
                                )
                              })}
                            </div>
                            {maxLabel && <span className="mb-2 max-w-[120px] text-left text-xs font-medium leading-tight text-slate-500">{maxLabel}</span>}
                          </div>
                        </div>
                      )
                    })()}

                    {question.question_type === "ranking" && (() => {
                      const currentOrder = (answers[question.id] as string[] | undefined) ?? question.options ?? []
                      const handleMove = (index: number, direction: "up" | "down") => {
                        const nextOrder = [...currentOrder]
                        const targetIndex = direction === "up" ? index - 1 : index + 1
                        if (targetIndex < 0 || targetIndex >= nextOrder.length) return
                        const current = nextOrder[index]
                        const target = nextOrder[targetIndex]
                        if (current === undefined || target === undefined) return
                        nextOrder[index] = target
                        nextOrder[targetIndex] = current
                        setAnswer(question.id, nextOrder)
                      }
                      return (
                        <div className="space-y-2.5">
                          <p className="mb-1 text-[11px] italic text-slate-400">Rank the choices using the arrow buttons:</p>
                          {currentOrder.map((option, index) => (
                            <div key={option} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-white p-3 shadow-sm transition-all hover:border-indigo-200">
                              <div className="flex items-center gap-3"><span className="flex size-6 items-center justify-center rounded bg-slate-100 text-xs font-bold text-slate-500">{index + 1}</span><span className="text-sm font-medium text-slate-700">{option}</span></div>
                              <div className="flex gap-1">
                                <Button type="button" variant="ghost" onClick={() => handleMove(index, "up")} disabled={index === 0} aria-label={`Move ${option} up`} className="h-8 w-8 p-0 text-slate-400 hover:bg-slate-50 hover:text-indigo-600 disabled:opacity-40"><ArrowLeft className="size-4 rotate-90" /></Button>
                                <Button type="button" variant="ghost" onClick={() => handleMove(index, "down")} disabled={index === currentOrder.length - 1} aria-label={`Move ${option} down`} className="h-8 w-8 p-0 text-slate-400 hover:bg-slate-50 hover:text-indigo-600 disabled:opacity-40"><ArrowRight className="size-4 rotate-90" /></Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )
                    })()}

                    {question.question_type === "matrix" && (() => {
                      const configuredColumns = question.config?.columns
                      const columns = Array.isArray(configuredColumns) ? configuredColumns.filter((column): column is string => typeof column === "string") : ["Poor", "Fair", "Good", "Excellent"]
                      const rows = question.options ?? []
                      const matrixAnswers = (answers[question.id] as Record<string, string> | undefined) ?? {}
                      return (
                        <div className="-mx-7 overflow-x-auto px-7">
                          <table className="w-full min-w-[500px] border-collapse text-sm">
                            <caption className="sr-only">{question.question_text}</caption>
                            <thead><tr className="border-b border-slate-200"><th scope="col" className="w-2/5 py-2.5 pr-4 text-left text-xs font-medium uppercase tracking-wider text-slate-500" />{columns.map((column) => <th scope="col" key={column} className="w-1/5 min-w-[80px] px-3 py-2.5 text-center text-xs font-semibold text-slate-500">{column}</th>)}</tr></thead>
                            <tbody>{rows.map((row, rowIndex) => <tr key={row} className="border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50/50"><th scope="row" className="py-3.5 pr-4 text-left text-sm font-medium text-slate-700">{row}</th>{columns.map((column) => <td key={column} className="px-3 py-3.5 text-center"><input type="radio" name={`matrix-${question.id}-row-${rowIndex}`} value={column} checked={matrixAnswers[row] === column} onChange={() => setAnswer(question.id, { ...matrixAnswers, [row]: column })} aria-label={`${row}: ${column}`} {...fieldProps} className="size-4 accent-indigo-600" /></td>)}</tr>)}</tbody>
                          </table>
                        </div>
                      )
                    })()}

                    {question.question_type === "datetime" && <input id={`q-${question.id}`} type="date" value={(answers[question.id] as string) ?? ""} onChange={(event) => setAnswer(question.id, event.target.value)} aria-label={question.question_text} {...fieldProps} className="h-10 w-48 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition-colors focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/10" />}

                    {question.question_type === "file" && <div className="flex flex-col items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-6 text-center"><Upload className="size-6 text-slate-400" /><p className="text-xs text-slate-500">File upload questions are not currently supported.</p></div>}

                    {question.question_type === "boolean" && <div className="flex gap-4">{["Yes", "No"].map((option) => { const value = option === "Yes"; const selected = answers[question.id] === value; return <label key={option} className={`flex flex-1 cursor-pointer items-center justify-center gap-3 rounded-lg border px-4 py-3 text-sm transition-all hover:border-indigo-200 hover:bg-slate-50 ${selected ? "border-indigo-200 bg-indigo-50/20 text-indigo-900" : "border-slate-100 bg-slate-50/20 text-slate-700"}`}><input type="radio" name={`boolean-${question.id}`} value={String(value)} checked={selected} onChange={() => setAnswer(question.id, value)} aria-label={`${question.question_text}: ${option}`} {...fieldProps} className="size-4 accent-indigo-600" /><span className={selected ? "font-medium" : ""}>{option}</span></label> })}</div>}
                  </fieldset>
                )
              })}
            </div>

            <section aria-labelledby="consent-heading" className="mt-4 rounded-xl border border-slate-200 bg-white px-7 py-5 shadow-sm ring-1 ring-black/[0.04]">
              <h2 id="consent-heading" className="text-base font-semibold text-slate-900">Consent and data notice</h2>
              <dl className="mt-3 grid gap-3 text-sm text-slate-600">
                <div><dt className="font-semibold text-slate-800">Notice</dt><dd>{consent.notice}</dd></div>
                <div><dt className="font-semibold text-slate-800">Purpose</dt><dd>{consent.purpose}</dd></div>
                <div><dt className="font-semibold text-slate-800">Retention</dt><dd>{consent.retention}</dd></div>
                <div><dt className="font-semibold text-slate-800">Contact</dt><dd>{consent.contact}</dd></div>
              </dl>
              <div className="mt-4">
                <label htmlFor="survey-consent" className="flex cursor-pointer items-start gap-3 text-sm font-medium text-slate-800">
                  <input
                    id="survey-consent"
                    name="consent"
                    type="checkbox"
                    required
                    checked={consentAccepted}
                    onChange={(event) => { setConsentAccepted(event.target.checked); setConsentTouched(true) }}
                    aria-invalid={consentTouched && !consentAccepted}
                    aria-describedby={consentTouched && !consentAccepted ? "consent-error" : undefined}
                    className="mt-0.5 size-4 accent-indigo-600"
                  />
                  <span>Consent: I have read and agree to this data notice.</span>
                </label>
                {consentTouched && !consentAccepted && <p id="consent-error" role="alert" className="mt-2 text-sm font-medium text-red-600">Consent is required before submitting.</p>}
              </div>
            </section>

            {submitting && <div className="mt-5 flex items-center gap-2 text-xs text-slate-500" role="status" aria-live="polite"><Loader2 className="size-3.5 animate-spin" /><span>Submitting your response...</span></div>}
            {submitError && <div className="mt-5 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700" role="alert" aria-live="assertive"><AlertCircle className="mt-0.5 size-4 shrink-0" /><span>{submitError}</span></div>}

            <div className="mt-6 flex items-center justify-between">
              <div className="text-xs text-slate-400">Consent notice version {consent.version}</div>
              <div className="flex gap-2">
                {!isFirst && <Button type="button" variant="outline" onClick={goPrev} className="h-10 gap-2 rounded-lg px-5 text-sm"><ArrowLeft className="size-4" data-icon="inline-start" />Previous</Button>}
                {!isLast ? <Button type="button" onClick={goNext} className="h-10 gap-2 rounded-lg bg-indigo-600 px-6 text-sm font-medium text-white shadow-sm transition-all hover:bg-indigo-700 hover:shadow-md">Next<ArrowRight className="size-4" data-icon="inline-end" /></Button> : <Button type="submit" disabled={submitting || !consentAccepted || staleConsent || retryBlocked} className="h-10 gap-2 rounded-lg bg-emerald-600 px-6 text-sm font-medium text-white shadow-sm transition-all hover:bg-emerald-700 hover:shadow-md">{submitting ? <Loader2 className="size-4 animate-spin" /> : <>Submit<ArrowRight className="size-4" data-icon="inline-end" /></>}</Button>}
              </div>
            </div>
            {retryBlocked && <p className="mt-2 text-right text-xs text-slate-500" role="status" aria-live="polite">Please wait {retryRemaining} seconds before trying again.</p>}
          </div>
        </form>
      </fieldset>

      <Dialog open={validationAlertOpen} onOpenChange={(open) => !submitting && setValidationAlertOpen(open)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-600"><AlertCircle className="size-5" />Missing Information</DialogTitle>
            <DialogDescription className="pt-2 text-[14.5px] leading-relaxed text-slate-600">Please complete all required questions before proceeding to the next section. Missing fields have been highlighted in red.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-2"><Button type="button" disabled={submitting} onClick={() => setValidationAlertOpen(false)} className="border-0 bg-indigo-600 text-white shadow-sm hover:bg-indigo-700">Got it</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
