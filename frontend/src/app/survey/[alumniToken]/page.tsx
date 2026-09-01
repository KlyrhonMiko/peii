import type { Metadata } from "next"

import { ShieldCheck } from "lucide-react"

import { ClientSurveyForm } from "@/components/ClientSurveyForm"
import { SurveyGoogleLoginButton } from "@/components/public-survey/SurveyGoogleLoginButton"
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card"
import {
  parsePublicSurveyEnvelope,
  parseRetryAfter,
  type PublicSurvey,
} from "@/lib/public-survey"
import { createSurveySupabaseServerClient } from "@/lib/supabase/survey-server"

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
}

type SurveyLoadResult =
  | { kind: "ready"; survey: PublicSurvey }
  | { kind: "auth-required" }
  | { kind: "unavailable" }
  | { kind: "rate-limited"; retryAfter: number | null }
  | { kind: "temporarily-unavailable"; retryAfter: number | null }

async function getSurvey(token: string, accessToken: string): Promise<SurveyLoadResult> {
  try {
    const backendUrl = process.env.BACKEND_INTERNAL_URL
    if (!backendUrl) return { kind: "temporarily-unavailable", retryAfter: null }
    const res = await fetch(
      `${backendUrl.replace(/\/$/u, "")}/survey/${encodeURIComponent(token)}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      },
    )
    if (res.status === 401) return { kind: "auth-required" }
    if (res.status === 429) {
      return { kind: "rate-limited", retryAfter: parseRetryAfter(res.headers.get("Retry-After")) }
    }
    if (res.status >= 500) {
      return {
        kind: "temporarily-unavailable",
        retryAfter: parseRetryAfter(res.headers.get("Retry-After")),
      }
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
  let accessToken: string | null = null

  try {
    const supabase = await createSurveySupabaseServerClient()
    const [claimsResult, sessionResult] = await Promise.all([
      supabase.auth.getClaims(),
      supabase.auth.getSession(),
    ])
    if (claimsResult?.data?.claims && sessionResult?.data?.session?.access_token) {
      accessToken = sessionResult.data.session.access_token
    }
  } catch {
    accessToken = null
  }

  if (!accessToken) return <SurveyAuthInterstitial token={alumniToken} />

  const result = await getSurvey(alumniToken, accessToken)
  if (result.kind === "auth-required") return <SurveyAuthInterstitial token={alumniToken} />

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

function SurveyAuthInterstitial({ token }: { token: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="gap-3">
          <div className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ShieldCheck aria-hidden="true" />
          </div>
          <h1 className="font-heading text-base leading-snug font-medium">Continue with Google</h1>
          <CardDescription>
            A verified Google sign-in is required before the survey questions are displayed.
            Your verified email and display name will be stored with your response, and
            authorized researchers can identify you. Your identity also limits participation
            to one response per Google account for this survey. Withdrawal removes your answers
            and direct identity, but retains a survey-scoped pseudonymous deduplication value so
            the account cannot submit again; administrative erasure clears that value.
            Short-lived sign-in proof data is deleted after it expires. This identified survey
            does not promise anonymity or confidentiality. Review the full privacy and retention
            notice before submitting.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SurveyGoogleLoginButton returnTo={`/survey/${token}`} />
        </CardContent>
      </Card>
    </main>
  )
}

function SurveyLoadError({
  kind,
  retryAfter,
}: {
  kind: Exclude<SurveyLoadResult, { kind: "ready" | "auth-required" }>["kind"]
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
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="max-w-md rounded-xl bg-card p-8 text-center shadow-sm ring-1 ring-foreground/10" role="alert" aria-live="polite">
        <h1 className="text-lg font-semibold text-foreground">{heading}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{message}</p>
        {retryMessage && <p className="mt-4 text-sm leading-6 text-muted-foreground">{retryMessage}</p>}
        {isUnavailable && (
          <p className="mt-4 text-xs text-muted-foreground">
            Please contact the person who shared this link if you believe this is unexpected.
          </p>
        )}
      </div>
    </main>
  )
}
