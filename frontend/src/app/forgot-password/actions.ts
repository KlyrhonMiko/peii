"use server"

import { redirect } from "next/navigation"

export async function requestPasswordRecoveryAction(formData: FormData) {
  const email = formData.get("email")
  if (typeof email !== "string") redirect("/forgot-password?error=invalid")
  const backendUrl = process.env.BACKEND_INTERNAL_URL
  if (!backendUrl) throw new Error("BACKEND_INTERNAL_URL is not configured")
  await fetch(`${backendUrl}/auth/password/recover`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
    cache: "no-store",
  })
  redirect("/forgot-password?sent=1")
}
