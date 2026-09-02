import { NextResponse, type NextRequest } from "next/server"
import type { CookieMethodsServer, CookieOptions } from "@supabase/ssr"
import type { Session } from "@supabase/supabase-js"

import {
  createSurveySupabaseServerClient,
  SURVEY_AUTH_COOKIE_PREFIX,
  SURVEY_CODE_VERIFIER_COOKIE_NAME,
  surveyCookieOptions,
} from "@/lib/supabase/survey-server"
import {
  SURVEY_OAUTH_STATE_COOKIE,
  surveyOAuthStateClearOptions,
  verifySurveyOAuthState,
} from "@/lib/survey-oauth-state"
import { applicationOrigin } from "@/lib/safe-redirect"

const ATTESTATION_TIMEOUT_MS = 15_000
const PROVIDER_ERROR_PARAMS = ["error", "error_code", "error_description", "error_reason"]

interface PendingCookie {
  value: string
  options: CookieOptions
}

function authErrorRedirect(): NextResponse {
  return NextResponse.redirect(
    new URL("/survey/auth-error", applicationOrigin()),
    { status: 303 },
  )
}

function clearState(response: NextResponse): void {
  response.cookies.set(SURVEY_OAUTH_STATE_COOKIE, "", surveyOAuthStateClearOptions)
}

function clearCodeVerifier(response: NextResponse): void {
  response.cookies.set(SURVEY_CODE_VERIFIER_COOKIE_NAME, "", {
    ...surveyCookieOptions,
    maxAge: 0,
    expires: new Date(0),
  })
}

function clearSurveyCookies(request: NextRequest, response: NextResponse): void {
  const names = new Set(
    request.cookies
      .getAll()
      .map(({ name }) => name)
      .filter((name) => name.startsWith(SURVEY_AUTH_COOKIE_PREFIX)),
  )
  names.add(SURVEY_CODE_VERIFIER_COOKIE_NAME)
  for (const name of names) {
    response.cookies.set(name, "", {
      ...surveyCookieOptions,
      maxAge: 0,
      expires: new Date(0),
    })
  }
}

function deferredCookieMethods(
  request: NextRequest,
  pending: Map<string, PendingCookie>,
): CookieMethodsServer {
  return {
    getAll: () => request.cookies.getAll(),
    setAll: (values) => {
      values.forEach(({ name, value, options }) => {
        pending.set(name, { value, options })
      })
    },
  }
}

function commitPendingCookies(
  response: NextResponse,
  pending: Map<string, PendingCookie>,
): void {
  pending.forEach(({ value, options }, name) => {
    response.cookies.set(name, value, { ...options, ...surveyCookieOptions })
  })
}

function isAttestationAcknowledgement(value: unknown): boolean {
  if (typeof value !== "object" || value === null || !("data" in value)) return false
  const data = value.data
  return typeof data === "object" && data !== null && "attested" in data && data.attested === true
}

function sessionCredentials(session: Session | null):
  | { accessToken: string; refreshToken: string; providerToken: string }
  | null {
  if (!session) return null
  if (
    typeof session.access_token !== "string" ||
    typeof session.refresh_token !== "string" ||
    typeof session.provider_token !== "string" ||
    !session.provider_token
  ) return null
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    providerToken: session.provider_token,
  }
}

export async function GET(request: NextRequest) {
  const state = verifySurveyOAuthState(
    request.cookies.get(SURVEY_OAUTH_STATE_COOKIE)?.value,
  )
  const code = request.nextUrl.searchParams.get("code")
  const hasProviderError = PROVIDER_ERROR_PARAMS.some((parameter) => request.nextUrl.searchParams.has(parameter))
  if (hasProviderError || !state || !code) {
    const response = authErrorRedirect()
    clearState(response)
    return response
  }

  const pending = new Map<string, PendingCookie>()
  let supabase: Awaited<ReturnType<typeof createSurveySupabaseServerClient>> | undefined
  try {
    supabase = await createSurveySupabaseServerClient(deferredCookieMethods(request, pending))
    const { data, error } = await supabase.auth.exchangeCodeForSession(code, { flowId: state.flowId })
    const credentials = sessionCredentials(data.session)
    if (error || !credentials) throw new Error("Survey authentication failed")

    const backendUrl = process.env.BACKEND_INTERNAL_URL
    if (!backendUrl) throw new Error("Backend is not configured")
    const attestationController = new AbortController()
    const attestationTimeoutId = setTimeout(
      () => attestationController.abort(new DOMException("Survey attestation timed out.", "TimeoutError")),
      ATTESTATION_TIMEOUT_MS,
    )
    let attestationResponse: Response
    try {
      attestationResponse = await fetch(
        `${backendUrl.replace(/\/$/u, "")}/auth/survey/google/attest`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${credentials.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ provider_token: credentials.providerToken }),
          cache: "no-store",
          signal: AbortSignal.any([request.signal, attestationController.signal]),
        },
      )
    } finally {
      clearTimeout(attestationTimeoutId)
    }
    if (!attestationResponse.ok) throw new Error("Survey authentication could not be verified")
    const attestationPayload: unknown = await attestationResponse.json()
    if (!isAttestationAcknowledgement(attestationPayload)) {
      throw new Error("Survey authentication could not be verified")
    }

    // exchangeCodeForSession receives provider_token by design. Re-save only the
    // access/refresh pair after attestation so it cannot remain in session cookies.
    pending.clear()
    const { error: scrubError } = await supabase.auth.setSession({
      access_token: credentials.accessToken,
      refresh_token: credentials.refreshToken,
    })
    if (scrubError) throw new Error("Survey authentication could not be stored")

    const response = NextResponse.redirect(new URL(state.returnTo, applicationOrigin()), { status: 303 })
    commitPendingCookies(response, pending)
    clearCodeVerifier(response)
    clearState(response)
    return response
  } catch (error) {
    if (request.signal.aborted) throw error
    if (supabase) {
      try {
        await supabase.auth.signOut()
      } catch {
        // The response still clears the isolated cookies below.
      }
    }
    const response = authErrorRedirect()
    clearSurveyCookies(request, response)
    clearState(response)
    return response
  }
}
