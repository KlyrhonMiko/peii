"use client"

import { type FormEvent, useEffect, useRef, useState } from "react"
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
  type PublicSurveySection,
} from "@/lib/public-survey"

import { SurveyConsentCard } from "./public-survey/SurveyConsentCard"
import { QuestionInput } from "./public-survey/QuestionInput"

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? ""

interface ClientSurveyFormProps {
  title: string
  description: string | null
  consent: PublicSurveyConsent
  sections: PublicSurveySection[]
  token: string
}

function isBlankAnswer(value: PublicAnswerValue | undefined): boolean {
  return (
    value === undefined ||
    (typeof value === "string" && !value.trim()) ||
    (Array.isArray(value) && value.length === 0) ||
    (typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0)
  )
}

function isAnswerMap(value: PublicAnswerValue | undefined): value is Record<string, string> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((answer) => typeof answer === "string")
  )
}

function matrixValidationError(
  question: { options?: string[] | null; config?: Record<string, unknown> | null },
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
            <h2 className="text-xl font-semibold tracking-tight text-slate-900">Response Submitted</h2>
            <p className="mt-2 text-[14px] leading-relaxed text-slate-500">
              Thank you for completing the survey. Your feedback helps us improve the quality of education at Pasig City.
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
          if (!(question.id in submittedAnswers) && question.question_type === "ranking" && question.options) {
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
            {/* Survey header card */}
            <div className="relative mb-4 overflow-hidden rounded-xl border-t-[6px] border-t-indigo-500 bg-white shadow-sm ring-1 ring-black/[0.04]">
              <div className="px-7 pb-6 pt-7">
                <div className="mb-4 flex items-center gap-2">
                  <div className="flex size-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                    <ClipboardList className="size-[18px]" />
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600">Alumni Survey</span>
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

            {/* Progress bar */}
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

            {/* Section label */}
            <div className="mb-4 rounded-xl border-l-4 border-l-violet-500 bg-white px-7 py-5 shadow-sm ring-1 ring-black/[0.04]">
              <h2 className="text-lg font-semibold text-slate-900">
                {section.title || `Section ${sectionIdx + 1}`}
              </h2>
              {section.description && (
                <p className="mt-1 text-[14px] leading-relaxed text-slate-500">{section.description}</p>
              )}
            </div>

            {/* Questions */}
            <div className="space-y-3">
              {section.questions.map((question) => (
                <QuestionInput
                  key={question.id}
                  question={question}
                  answer={answers[question.id]}
                  error={errors[question.id]}
                  onAnswer={setAnswer}
                  onToggleMultiple={toggleMultiple}
                />
              ))}
            </div>

            {/* Consent card */}
            <SurveyConsentCard
              consent={consent}
              consentAccepted={consentAccepted}
              consentTouched={consentTouched}
              staleConsent={staleConsent}
              onConsentChange={(accepted) => {
                setConsentAccepted(accepted)
                setConsentTouched(true)
              }}
            />

            {/* Status messages */}
            {submitting && (
              <div className="mt-5 flex items-center gap-2 text-xs text-slate-500" role="status" aria-live="polite">
                <Loader2 className="size-3.5 animate-spin" />
                <span>Submitting your response...</span>
              </div>
            )}
            {submitError && (
              <div className="mt-5 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700" role="alert" aria-live="assertive">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <span>{submitError}</span>
              </div>
            )}

            {/* Navigation */}
            <div className="mt-6 flex items-center justify-between">
              <div className="text-xs text-slate-400">Consent notice version {consent.version}</div>
              <div className="flex gap-2">
                {!isFirst && (
                  <Button type="button" variant="outline" onClick={goPrev} className="h-10 gap-2 rounded-lg px-5 text-sm">
                    <ArrowLeft className="size-4" data-icon="inline-start" />
                    Previous
                  </Button>
                )}
                {!isLast ? (
                  <Button type="button" onClick={goNext} className="h-10 gap-2 rounded-lg bg-indigo-600 px-6 text-sm font-medium text-white shadow-sm transition-all hover:bg-indigo-700 hover:shadow-md">
                    Next
                    <ArrowRight className="size-4" data-icon="inline-end" />
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    disabled={submitting || !consentAccepted || staleConsent || retryBlocked}
                    className="h-10 gap-2 rounded-lg bg-emerald-600 px-6 text-sm font-medium text-white shadow-sm transition-all hover:bg-emerald-700 hover:shadow-md"
                  >
                    {submitting ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <>
                        Submit
                        <ArrowRight className="size-4" data-icon="inline-end" />
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
            {retryBlocked && (
              <p className="mt-2 text-right text-xs text-slate-500" role="status" aria-live="polite">
                Please wait {retryRemaining} seconds before trying again.
              </p>
            )}
          </div>
        </form>
      </fieldset>

      {/* Validation alert dialog */}
      <Dialog open={validationAlertOpen} onOpenChange={(open) => !submitting && setValidationAlertOpen(open)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-600">
              <AlertCircle className="size-5" />
              Missing Information
            </DialogTitle>
            <DialogDescription className="pt-2 text-[14.5px] leading-relaxed text-slate-600">
              Please complete all required questions before proceeding to the next section. Missing fields have been highlighted in red.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-2">
            <Button type="button" disabled={submitting} onClick={() => setValidationAlertOpen(false)} className="border-0 bg-indigo-600 text-white shadow-sm hover:bg-indigo-700">
              Got it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
