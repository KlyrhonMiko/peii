"use server"

import { redirect } from "next/navigation"
import { cookies } from "next/headers"

import {
  PASSWORD_RESET_GRANT_COOKIE,
  passwordResetGrantCookieOptions,
  verifyPasswordResetGrant,
} from "@/lib/password-reset-grant"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export async function resetPasswordAction(formData: FormData) {
  const password = formData.get("password")
  const confirmation = formData.get("confirmation")
  if (typeof password !== "string" || password.length < 12 || password !== confirmation) {
    redirect("/reset-password?error=invalid")
  }
  const cookieStore = await cookies()
  const grant = cookieStore.get(PASSWORD_RESET_GRANT_COOKIE)?.value
  if (!grant || !verifyPasswordResetGrant(grant)) redirect("/login?error=confirmation")
  const backendUrl = process.env.BACKEND_INTERNAL_URL
  if (!backendUrl) throw new Error("BACKEND_INTERNAL_URL is not configured")
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase.auth.getSession()
  if (!data.session?.access_token) redirect("/login?error=confirmation")
  let backendResetConfirmed = false
  let localCleanupConfirmed = false
  try {
    const response = await fetch(`${backendUrl}/auth/password/reset`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password, grant }),
      cache: "no-store",
    })
    backendResetConfirmed = response.ok
  } catch {
    // The recovery session may already have been consumed; cleanup still must run.
  } finally {
    try {
      const { error } = await supabase.auth.signOut({ scope: "local" })
      localCleanupConfirmed = error === null
    } catch {
      // Continue to clear the one-time grant and return the safe recovery state.
    }
    cookieStore.set(PASSWORD_RESET_GRANT_COOKIE, "", {
      ...passwordResetGrantCookieOptions,
      maxAge: 0,
    })
  }
  if (backendResetConfirmed && localCleanupConfirmed) redirect("/login?password=reset")
  redirect("/login?error=reset-retry")
}
