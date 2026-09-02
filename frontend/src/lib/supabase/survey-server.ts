import "server-only"

import { createServerClient, type CookieMethodsServer } from "@supabase/ssr"
import { cookies } from "next/headers"

import type { SupabaseClient } from "@supabase/supabase-js"

export const SURVEY_AUTH_COOKIE_NAME = "peii-survey-auth-token"
export const SURVEY_AUTH_COOKIE_PREFIX = `${SURVEY_AUTH_COOKIE_NAME}`
export const SURVEY_CODE_VERIFIER_COOKIE_NAME = `${SURVEY_AUTH_COOKIE_NAME}-code-verifier`

export const surveyCookieOptions = {
  httpOnly: true,
  path: "/",
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
}

export const surveySupabaseCookieOptions = {
  name: SURVEY_AUTH_COOKIE_NAME,
  ...surveyCookieOptions,
}

function settings() {
  const url = process.env.SUPABASE_URL
  // SUPABASE_ANON_KEY is the survey flow's explicit contract. Keep the existing
  // publishable key as a local/deployment compatibility fallback.
  const key = process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) throw new Error("Survey Supabase Auth is not configured")
  return { url, key }
}

export async function createSurveySupabaseServerClient(
  cookieMethods?: CookieMethodsServer,
): Promise<SupabaseClient> {
  const cookieStore = cookieMethods ? null : await cookies()
  const { url, key } = settings()

  return createServerClient(url, key, {
    cookieOptions: surveySupabaseCookieOptions,
    auth: {
      flowType: "pkce",
      detectSessionInUrl: false,
    },
    cookies: cookieMethods ?? {
      getAll() {
        return cookieStore?.getAll() ?? []
      },
      setAll(values) {
        try {
          values.forEach(({ name, value, options }) => {
            cookieStore?.set(name, value, { ...options, ...surveyCookieOptions })
          })
        } catch {
          // Server Components cannot persist refreshed cookies; route handlers can.
        }
      },
    },
  })
}
