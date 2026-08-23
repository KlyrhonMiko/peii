"use server"

import { redirect } from "next/navigation"

import { createSupabaseServerClient } from "@/lib/supabase/server"

export async function resetPasswordAction(formData: FormData) {
  const password = formData.get("password")
  const confirmation = formData.get("confirmation")
  if (typeof password !== "string" || password.length < 12 || password !== confirmation) {
    redirect("/reset-password?error=invalid")
  }
  const backendUrl = process.env.BACKEND_INTERNAL_URL
  if (!backendUrl) throw new Error("BACKEND_INTERNAL_URL is not configured")
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase.auth.getSession()
  if (!data.session?.access_token) redirect("/login?error=confirmation")
  const response = await fetch(`${backendUrl}/auth/password/change`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${data.session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ password }),
    cache: "no-store",
  })
  if (!response.ok) redirect("/reset-password?error=server")
  redirect("/researcher/dashboard")
}
