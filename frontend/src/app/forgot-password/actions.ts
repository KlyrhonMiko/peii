"use server"

import { redirect } from "next/navigation"

export async function requestPasswordRecoveryAction(formData: FormData) {
  const email = formData.get("email")
  if (typeof email !== "string") redirect("/forgot-password?error=invalid")
  const backendUrl = process.env.BACKEND_INTERNAL_URL
  if (!backendUrl) throw new Error("BACKEND_INTERNAL_URL is not configured")
  const response = await fetch(`${backendUrl}/auth/password/recover`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
    cache: "no-store",
  })
  if (!response.ok) {
    const params = new URLSearchParams({ error: "retry-later" })
    const retryAfter = parseRetryAfter(response.headers.get("Retry-After"))
    if (retryAfter !== null) params.set("retryAfter", String(retryAfter))
    redirect(`/forgot-password?${params.toString()}`)
  }
  redirect("/forgot-password?sent=1")
}

function parseRetryAfter(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value)) return null
  const seconds = Number(value)
  return Number.isSafeInteger(seconds) && seconds > 0 ? seconds : null
}
