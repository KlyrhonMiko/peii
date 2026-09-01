"use client"

import { type FormEvent, useEffect, useRef, useState } from "react"
import Link from "next/link"
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
  ArrowLeft,
  ArrowRight,
  Loader2,
  CheckCircle,
  AlertCircle,
  Copy,
  Printer,
} from "lucide-react"

import {
  createPublicSurveySubmission,
  generateWithdrawalCode,
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
  const [submittedWithdrawalCode, setSubmittedWithdrawalCode] = useState<string | null>(null)
  const idempotencyKey = useRef<string | null>(null)
  const withdrawalCode = useRef<string | null>(null)
  const [codeCopied, setCodeCopied] = useState(false)
  const submittingRef = useRef(false)

  const copyWithdrawalCode = async (code: string) => {
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable")
      await navigator.clipboard.writeText(code)
      setCodeCopied(true)
    } catch {
      setCodeCopied(false)
    }
  }

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
    const code = submittedWithdrawalCode
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center py-12 px-4">
        <div className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm sm:p-10">
          <div className="mx-auto mb-6 flex size-12 items-center justify-center rounded-full bg-zinc-100">
            <CheckCircle className="size-6 text-zinc-900" />
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-900">Response Submitted</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-zinc-500">
            Thank you for completing the survey. Your feedback has been recorded.
          </p>
          {code && (
            <section
              aria-labelledby="withdrawal-code-heading"
              className="mt-8 rounded-xl border-2 border-zinc-900 bg-zinc-50 p-5 text-left"
            >
              <h3 id="withdrawal-code-heading" className="text-sm font-semibold text-zinc-900">
                Save this code for later
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-600">
                This code is required to withdraw your response later. Keep it somewhere safe; it cannot be recovered for you.
              </p>
              <code
                aria-label="Private withdrawal code"
                className="mt-4 block select-all break-all rounded-lg bg-white px-3 py-3 text-center font-mono text-sm font-semibold tracking-wide text-zinc-900 ring-1 ring-zinc-200"
              >
                {code}
              </code>
              <div className="mt-4 flex flex-wrap justify-center gap-2 print:hidden">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void copyWithdrawalCode(code)}
                  className="h-9 gap-2 rounded-lg border-zinc-200 px-3 text-xs"
                  aria-label="Copy withdrawal code"
                >
                  <Copy data-icon="inline-start" />
                  {codeCopied ? "Copied" : "Copy code"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => window.print()}
                  className="h-9 gap-2 rounded-lg border-zinc-200 px-3 text-xs"
                >
                  <Printer data-icon="inline-start" />
                  Print
                </Button>
              </div>
            </section>
          )}
          <p className="mt-6 text-sm text-zinc-600">
            Need to withdraw your response?{" "}
            <Link href="/survey/withdraw" className="font-semibold text-zinc-900 underline underline-offset-4">
              Withdraw a response
            </Link>
          </p>
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
      const code = withdrawalCode.current ?? generateWithdrawalCode()
      withdrawalCode.current = code
      const response = await fetch(`/api/survey/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey.current,
        },
        body: JSON.stringify(createPublicSurveySubmission(submittedAnswers, consent.version, code)),
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
        } else if (response.status === 409 && errorCode === "already_submitted") {
          setSubmitError("This response has already been submitted. To withdraw it, use the private withdrawal code before trying again.")
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
      setSubmittedWithdrawalCode(code)
      withdrawalCode.current = null
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
    <div className="min-h-screen bg-zinc-50 py-12 md:py-24">
      <fieldset disabled={submitting} aria-busy={submitting} className="contents">
        <form onSubmit={onSubmit} noValidate>
          <div className={`mx-auto w-full max-w-[640px] px-4 ${submitting ? "pointer-events-none opacity-90" : ""}`}>
            
            {/* Minimal Header */}
            <div className="mb-12">
              <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">{title}</h1>
              {description && (
                <p className="mt-3 text-[15px] leading-relaxed text-zinc-500">{description}</p>
              )}
            </div>

            {/* Subtle Progress Indicator */}
            <div className="mb-10">
              <div className="flex items-end justify-between text-[13px] font-medium text-zinc-500">
                <div className="flex flex-col gap-1">
                  <span className="text-zinc-900">{section.title || `Section ${sectionIdx + 1}`}</span>
                  <span className="text-[12px] text-zinc-400 font-normal">
                    {Object.keys(answers).length} of {sections.reduce((total, current) => total + current.questions.length, 0)} answered
                  </span>
                </div>
                <span>{Math.round(((sectionIdx + 1) / sections.length) * 100)}%</span>
              </div>
              <div className="mt-3 h-px w-full bg-zinc-200">
                <div
                  className="h-full bg-zinc-900 transition-all duration-300"
                  style={{ width: `${((sectionIdx + 1) / sections.length) * 100}%` }}
                />
              </div>
              {section.description && (
                <p className="mt-6 text-[15px] leading-relaxed text-zinc-600">
                  {section.description}
                </p>
              )}
            </div>

            {/* Questions Container */}
            <div className="space-y-6">
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
            <div className="mt-6">
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
            </div>

            {submitError && (
              <div className="mt-6 flex items-center gap-2 text-[13.5px] font-medium text-red-500" role="alert" aria-live="assertive">
                <AlertCircle className="size-4 shrink-0" />
                <span>{submitError}</span>
              </div>
            )}

            {/* Navigation */}
            <div className="mt-10 flex items-center justify-between border-t border-zinc-200 pt-6">
              <div className="text-[12px] text-zinc-400">Consent version {consent.version}</div>
              <div className="flex gap-3">
                {!isFirst && (
                  <Button type="button" variant="outline" onClick={goPrev} className="h-10 gap-2 rounded-lg border-zinc-200 px-5 text-sm text-zinc-700 hover:bg-zinc-50">
                    <ArrowLeft className="size-4" data-icon="inline-start" />
                    Previous
                  </Button>
                )}
                {!isLast ? (
                  <Button type="button" onClick={goNext} className="h-10 gap-2 rounded-lg bg-zinc-900 px-6 text-sm font-medium text-white shadow-sm transition-all hover:bg-zinc-800">
                    Next
                    <ArrowRight className="size-4" data-icon="inline-end" />
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    disabled={submitting || !consentAccepted || staleConsent || retryBlocked}
                    className="h-10 gap-2 rounded-lg bg-zinc-900 px-6 text-sm font-medium text-white shadow-sm transition-all hover:bg-zinc-800 disabled:opacity-50"
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
              <p className="mt-3 text-right text-[13px] text-zinc-500" role="status" aria-live="polite">
                Please wait {retryRemaining} seconds before trying again.
              </p>
            )}
          </div>
        </form>
      </fieldset>

      {/* Validation alert dialog */}
      <Dialog open={validationAlertOpen} onOpenChange={(open) => !submitting && setValidationAlertOpen(open)}>
        <DialogContent className="max-w-md border-0 rounded-2xl shadow-[0_16px_40px_-12px_rgba(0,0,0,0.1)] p-6" showCloseButton={true}>
          <div className="flex flex-col items-center gap-4 text-center pb-2">
            <div className="flex size-12 items-center justify-center rounded-full bg-red-100 ring-[6px] ring-red-50 text-red-600 mb-1">
              <AlertCircle className="size-5" />
            </div>
            <DialogHeader className="flex flex-col items-center">
              <DialogTitle className="text-xl font-semibold text-slate-900 tracking-tight">
                Missing Information
              </DialogTitle>
              <DialogDescription className="text-[15px] text-slate-500 mt-2 leading-relaxed max-w-[95%] text-center">
                Please complete all required questions before proceeding to the next section.
              </DialogDescription>
            </DialogHeader>
          </div>
          <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-center gap-3 sm:space-x-0 w-full mt-4">
            <Button
              type="button"
              disabled={submitting}
              onClick={() => setValidationAlertOpen(false)}
              className="bg-zinc-900 text-white hover:bg-zinc-800 font-medium w-full sm:w-auto h-11 px-8 rounded-xl active:scale-[0.97] transition-all duration-200 ease-out"
            >
              Got it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
