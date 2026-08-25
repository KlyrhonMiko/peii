import type { Metadata } from "next"

import { ClientSurveyForm } from "@/components/ClientSurveyForm"
import {
  parsePublicSurveyEnvelope,
  parseRetryAfter,
  type PublicSurvey,
} from "@/lib/public-survey"

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? ""

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
}

type SurveyLoadResult =
  | { kind: "ready"; survey: PublicSurvey }
  | { kind: "unavailable" }
  | { kind: "rate-limited"; retryAfter: number | null }
  | { kind: "temporarily-unavailable"; retryAfter: number | null }

async function getSurvey(token: string): Promise<SurveyLoadResult> {
  try {
    const res = await fetch(`${API_BASE}/survey/${encodeURIComponent(token)}`, {
      cache: "no-store",
    })
    if (res.status === 429) {
      return { kind: "rate-limited", retryAfter: parseRetryAfter(res.headers.get("Retry-After")) }
    }
    if (res.status >= 500) {
      return { kind: "temporarily-unavailable", retryAfter: parseRetryAfter(res.headers.get("Retry-After")) }
    }
    if (!res.ok) return { kind: "unavailable" }
    const survey = parsePublicSurveyEnvelope(await res.json())
    return survey && survey.sections.length > 0
      ? { kind: "ready", survey }
      : { kind: "unavailable" }
  } catch {
    return { kind: "temporarily-unavailable", retryAfter: null }
  }
}

export default async function SurveyPage({
  params,
}: {
  params: Promise<{ alumniToken: string }>
}) {
  const { alumniToken } = await params
  const result = await getSurvey(alumniToken)

  if (result.kind !== "ready") {
    const retryAfter = "retryAfter" in result ? result.retryAfter : null
    return <SurveyLoadError kind={result.kind} retryAfter={retryAfter} />
  }

  return (
    <ClientSurveyForm
      key={alumniToken}
      title={result.survey.title}
      description={result.survey.description}
      consent={result.survey.consent}
      sections={result.survey.sections}
      token={alumniToken}
    />
  )
}

function SurveyLoadError({
  kind,
  retryAfter,
}: {
  kind: Exclude<SurveyLoadResult, { kind: "ready" }>["kind"]
  retryAfter: number | null
}) {
  const isUnavailable = kind === "unavailable"
  const isRateLimited = kind === "rate-limited"
  const heading = isUnavailable
    ? "This survey is unavailable"
    : isRateLimited
      ? "Too many requests"
      : "Survey temporarily unavailable"
  const message = isUnavailable
    ? "This link may have expired, been revoked, or the survey is no longer accepting responses."
    : isRateLimited
      ? "Please wait before trying to load this survey again."
      : "We could not load this survey right now."
  const retryMessage = isUnavailable
    ? null
    : retryAfter === null
      ? "Please try again later."
      : `Please try again in ${retryAfter} seconds.`

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f0f2f5] p-6">
      <div
        className="max-w-md rounded-xl bg-white p-8 text-center shadow-sm ring-1 ring-black/[0.04]"
        role="alert"
        aria-live="polite"
      >
        <h1 className="text-lg font-semibold text-slate-900">{heading}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">{message}</p>
        {retryMessage && <p className="mt-4 text-sm leading-6 text-slate-600">{retryMessage}</p>}
        {isUnavailable && (
          <p className="mt-4 text-xs text-slate-500">
            Please contact the person who shared this link if you believe this is unexpected.
          </p>
        )}
      </div>
    </main>
  )
}
