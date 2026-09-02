import { NextResponse, type NextRequest } from "next/server"

import { createSurveySupabaseServerClient } from "@/lib/supabase/survey-server"
import {
  createSurveyOAuthState,
  SURVEY_OAUTH_STATE_COOKIE,
  surveyOAuthStateCookieOptions,
  validateSurveyReturnPath,
} from "@/lib/survey-oauth-state"
import { applicationOrigin } from "@/lib/safe-redirect"

const SURVEY_GOOGLE_CALLBACK_PATH = "/auth/survey/google/callback"

function providerAuthorizationUrl(value: unknown, returnTo: string): string | null {
  if (typeof value !== "string") return null

  let providerUrl: URL
  let supabaseUrl: URL
  try {
    providerUrl = new URL(value)
    supabaseUrl = new URL(process.env.SUPABASE_URL ?? "")
  } catch {
    return null
  }

  const token = returnTo.slice("/survey/".length)
  let decodedToken = token
  try {
    decodedToken = decodeURIComponent(token)
  } catch {
    return null
  }

  if (
    providerUrl.origin !== supabaseUrl.origin ||
    providerUrl.pathname !== "/auth/v1/authorize" ||
    providerUrl.searchParams.get("provider") !== "google" ||
    providerUrl.username ||
    providerUrl.password ||
    providerUrl.hash ||
    value.includes(token) ||
    value.includes(decodedToken)
  ) {
    return null
  }

  return providerUrl.toString()
}

function authErrorRedirect(): NextResponse {
  return NextResponse.redirect(
    new URL("/survey/auth-error", applicationOrigin()),
    { status: 303 },
  )
}

export async function POST(request: NextRequest) {
  try {
    if (request.headers.get("origin") !== applicationOrigin()) return authErrorRedirect()

    const returnTo = validateSurveyReturnPath((await request.formData()).get("returnTo"))
    if (!returnTo) return authErrorRedirect()

    const supabase = await createSurveySupabaseServerClient()
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${applicationOrigin()}${SURVEY_GOOGLE_CALLBACK_PATH}`,
        scopes: "openid email profile",
      },
    })
    const providerUrl = providerAuthorizationUrl(data?.url, returnTo)
    if (error || !providerUrl || !data?.flowId) return authErrorRedirect()
    const state = createSurveyOAuthState(returnTo, data.flowId)

    const response = NextResponse.json(
      { url: providerUrl },
      { headers: { "Cache-Control": "no-store", Pragma: "no-cache" } },
    )
    response.cookies.set(SURVEY_OAUTH_STATE_COOKIE, state, surveyOAuthStateCookieOptions)
    return response
  } catch {
    return authErrorRedirect()
  }
}
