"use server"

import { redirect } from "next/navigation"

import { safeMfaReturnTo } from "@/lib/safe-redirect"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export type LoginState = {
  error?: "invalid" | "rate-limited" | "unavailable";
  retryAfter?: number | null;
} | null

export async function loginAction(state: LoginState, formData: FormData): Promise<LoginState> {
  const identifier = formData.get("identifier")
  const password = formData.get("password")
  if (typeof identifier !== "string" || typeof password !== "string") {
    return { error: "invalid" }
  }

  const backendUrl = process.env.BACKEND_INTERNAL_URL
  if (!backendUrl) {
    throw new Error("BACKEND_INTERNAL_URL is not configured")
  }
  const response = await fetch(`${backendUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password }),
    cache: "no-store",
  })
  if (response.status === 429) {
    const retryAfter = parseRetryAfter(response.headers.get("Retry-After"))
    return { error: "rate-limited", retryAfter }
  }
  if (response.status === 503) {
    const retryAfter = parseRetryAfter(response.headers.get("Retry-After"))
    return { error: "unavailable", retryAfter }
  }
  if (!response.ok) {
    return { error: "invalid" }
  }
  const body: unknown = await response.json()
  if (!isSessionEnvelope(body)) {
    throw new Error("Backend returned an invalid authentication response")
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.setSession(body.data)
  if (error) {
    return { error: "invalid" }
  }

  const { data: assurance, error: assuranceError } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel(body.data.access_token)
  if (assuranceError || !assurance) {
    await supabase.auth.signOut({ scope: "local" })
    return { error: "unavailable", retryAfter: null }
  }

  const destination = safeMfaReturnTo(formData.get("returnTo"))
  if (assurance.currentLevel !== "aal2" && assurance.nextLevel === "aal2") {
    redirect(`/mfa/verify?returnTo=${encodeURIComponent(destination)}`)
  }
  redirect(destination)
}

export async function logoutAction() {
  const supabase = await createSupabaseServerClient()
  try {
    const { data } = await supabase.auth.getSession()
    if (data.session) {
      const backendUrl = process.env.BACKEND_INTERNAL_URL
      if (!backendUrl) throw new Error("BACKEND_INTERNAL_URL is not configured")
      const response = await fetch(`${backendUrl}/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${data.session.access_token}` },
        cache: "no-store",
      })
      if (!response.ok) throw new Error("Backend logout failed")
    }
  } catch (error) {
    console.error(
      "Backend logout did not complete; clearing the local session.",
      error instanceof Error ? error.name : "UnknownError",
    )
  } finally {
    await supabase.auth.signOut({ scope: "local" })
  }
  redirect("/")
}

function isSessionEnvelope(
  value: unknown,
): value is { data: { access_token: string; refresh_token: string } } {
  if (typeof value !== "object" || value === null || !("data" in value)) return false
  const data = value.data
  return (
    typeof data === "object" &&
    data !== null &&
    "access_token" in data &&
    "refresh_token" in data &&
    typeof data.access_token === "string" &&
    typeof data.refresh_token === "string"
  )
}

function parseRetryAfter(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value)) return null
  const seconds = Number(value)
  return Number.isSafeInteger(seconds) && seconds > 0 ? seconds : null
}
