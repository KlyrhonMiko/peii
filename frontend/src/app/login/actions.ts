"use server"

import { redirect } from "next/navigation"

import { safeInternalPath } from "@/lib/safe-redirect"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export async function loginAction(formData: FormData) {
  const identifier = formData.get("identifier")
  const password = formData.get("password")
  if (typeof identifier !== "string" || typeof password !== "string") {
    redirect("/login?error=invalid")
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
    redirectLoginError("rate-limited", response)
  }
  if (response.status === 503) {
    redirectLoginError("unavailable", response)
  }
  if (!response.ok) {
    redirect("/login?error=invalid")
  }
  const body: unknown = await response.json()
  if (!isSessionEnvelope(body)) {
    throw new Error("Backend returned an invalid authentication response")
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.setSession(body.data)
  if (error) {
    redirect("/login?error=invalid")
  }
  redirect(safeInternalPath(formData.get("returnTo")))
}

export async function logoutAction() {
  const supabase = await createSupabaseServerClient()
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
  await supabase.auth.signOut()
  redirect("/login")
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

function redirectLoginError(error: "rate-limited" | "unavailable", response: Response): never {
  const params = new URLSearchParams({ error })
  const retryAfter = parseRetryAfter(response.headers.get("Retry-After"))
  if (retryAfter !== null) params.set("retryAfter", String(retryAfter))
  redirect(`/login?${params.toString()}`)
}

function parseRetryAfter(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value)) return null
  const seconds = Number(value)
  return Number.isSafeInteger(seconds) && seconds > 0 ? seconds : null
}
