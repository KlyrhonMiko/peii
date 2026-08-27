"use client"

import { type FormEvent, useState } from "react"
import Link from "next/link"
import { AlertCircle, ArrowLeft, CheckCircle, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  createPublicSurveyWithdrawalRequest,
  parsePublicSurveyWithdrawn,
} from "@/lib/public-survey"

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? ""

type WithdrawalState = "idle" | "submitting" | "success" | "error"

export function WithdrawalForm() {
  const [code, setCode] = useState("")
  const [state, setState] = useState<WithdrawalState>("idle")
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (state === "submitting" || !code.trim()) return

    setState("submitting")
    setError(null)
    try {
      const response = await fetch(`${API_BASE}/survey/responses/withdraw`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createPublicSurveyWithdrawalRequest(code.trim())),
      })
      if (!response.ok) {
        setState("error")
        setError(
          response.status === 422
            ? "Enter a valid withdrawal code and try again."
            : response.status === 404
              ? "We could not find a response for that code. It may be incorrect or already withdrawn."
              : "We could not withdraw your response. Please try again.",
        )
        return
      }
      let payload: unknown
      try {
        payload = await response.json()
      } catch {
        setState("error")
        setError("We could not confirm the withdrawal. Please try again.")
        return
      }
      if (parsePublicSurveyWithdrawn(payload) === null) {
        setState("error")
        setError("We could not confirm the withdrawal. Please try again.")
        return
      }
      setCode("")
      setState("success")
    } catch {
      setState("error")
      setError("We could not withdraw your response. Please try again.")
    }
  }

  if (state === "success") {
    return (
      <div className="text-center" role="status" aria-live="polite">
        <div className="mx-auto mb-5 flex size-12 items-center justify-center rounded-full bg-zinc-100">
          <CheckCircle className="size-6 text-zinc-900" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Response Withdrawn</h1>
        <p className="mt-3 text-sm leading-relaxed text-zinc-600">
          Your response has been withdrawn and its submitted answers are no longer available. It is safe to repeat this request if needed.
        </p>
        <Link href="/" className="mt-6 inline-flex text-sm font-semibold text-zinc-900 underline underline-offset-4">
          Return to PEII
        </Link>
      </div>
    )
  }

  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Withdraw a response</h1>
        <p className="mt-3 text-sm leading-relaxed text-zinc-600">
          Enter the private withdrawal code you saved after submitting your survey. This page does not require a survey link.
        </p>
      </div>
      <form onSubmit={handleSubmit} noValidate>
        <label htmlFor="withdrawal-code" className="text-sm font-medium text-zinc-900">
          Private withdrawal code
        </label>
        <input
          id="withdrawal-code"
          name="withdrawal_code"
          type="text"
          autoComplete="off"
          spellCheck={false}
          value={code}
          onChange={(event) => setCode(event.target.value)}
          aria-invalid={state === "error"}
          aria-describedby={error ? "withdrawal-error" : "withdrawal-help"}
          className="mt-2 h-11 w-full rounded-lg border border-zinc-200 bg-zinc-50/50 px-3 font-mono text-sm text-zinc-900 outline-none transition-all focus:border-zinc-900 focus:bg-white focus:ring-4 focus:ring-zinc-900/5"
        />
        <p id="withdrawal-help" className="mt-2 text-xs leading-relaxed text-zinc-500">
          The code is case-sensitive. It is never placed in this page&apos;s address or sent anywhere except the withdrawal request.
        </p>
        {error && (
          <div id="withdrawal-error" className="mt-4 flex items-start gap-2 text-sm font-medium text-red-600" role="alert" aria-live="assertive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        <Button
          type="submit"
          disabled={state === "submitting" || !code.trim()}
          className="mt-6 h-10 w-full rounded-lg bg-zinc-900 text-sm font-medium text-white hover:bg-zinc-800"
        >
          {state === "submitting" ? <Loader2 className="size-4 animate-spin" /> : "Withdraw response"}
        </Button>
      </form>
      <Link href="/" className="mt-6 inline-flex items-center gap-2 text-sm text-zinc-500 underline underline-offset-4">
        <ArrowLeft className="size-4" data-icon="inline-start" />
        Return to PEII
      </Link>
    </>
  )
}
