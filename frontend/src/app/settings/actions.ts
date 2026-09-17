"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePortalUser } from "@/lib/auth"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export type SettingsActionState = { status: "idle" | "success" | "error"; message: string }

async function sendAuthenticatedRequest(path: string, method: "PATCH" | "POST", body?: object): Promise<Response | null> {
  await requirePortalUser("portal.access")
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase.auth.getSession()
  const accessToken = data.session?.access_token
  if (!accessToken) redirect("/?login=true")

  const backendUrl = process.env.BACKEND_INTERNAL_URL
  if (!backendUrl) throw new Error("BACKEND_INTERNAL_URL is not configured")

  try {
    return await fetch(`${backendUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: "no-store",
    })
  } catch {
    return null
  }
}

function requiredText(formData: FormData, key: string, maxLength: number): string | null {
  const value = formData.get(key)
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 && trimmed.length <= maxLength ? trimmed : null
}

function optionalText(formData: FormData, key: string, maxLength: number): string | null | undefined {
  const value = formData.get(key)
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed.length <= maxLength ? trimmed || null : undefined
}

async function errorMessage(response: Response | null, fallback: string): Promise<string> {
  if (!response) return "The service is unavailable. Please try again."
  if (response.status === 401) redirect("/?login=true")
  try {
    const payload: unknown = await response.json()
    if (typeof payload === "object" && payload !== null && "message" in payload && typeof payload.message === "string") {
      return payload.message
    }
  } catch {
    // Keep a stable message when the upstream response is not JSON.
  }
  return fallback
}

export async function updateProfileAction(_state: SettingsActionState, formData: FormData): Promise<SettingsActionState> {
  const username = requiredText(formData, "username", 100)
  const firstName = requiredText(formData, "first_name", 100)
  const lastName = requiredText(formData, "last_name", 100)
  const middleName = optionalText(formData, "middle_name", 100)
  const contact = optionalText(formData, "contact", 50)
  if (!username || !firstName || !lastName || middleName === undefined || contact === undefined) {
    return { status: "error", message: "Check the profile fields and try again." }
  }

  const response = await sendAuthenticatedRequest("/auth/me", "PATCH", {
    username,
    first_name: firstName,
    last_name: lastName,
    middle_name: middleName,
    contact,
  })
  if (!response?.ok) {
    return { status: "error", message: await errorMessage(response, "Profile could not be saved.") }
  }
  revalidatePath("/settings")
  return { status: "success", message: "Profile updated." }
}

export async function requestPasswordReauthenticationAction(_state: SettingsActionState, _formData: FormData): Promise<SettingsActionState> {
  const response = await sendAuthenticatedRequest("/auth/password/reauthenticate", "POST")
  if (!response?.ok) {
    return { status: "error", message: await errorMessage(response, "Verification email could not be sent.") }
  }
  return { status: "success", message: "A verification code was sent to your account email." }
}

export async function changePasswordAction(_state: SettingsActionState, formData: FormData): Promise<SettingsActionState> {
  const nonce = requiredText(formData, "nonce", 512)
  const password = formData.get("password")
  const confirmation = formData.get("confirmation")
  if (!nonce || typeof password !== "string" || password.length < 12 || password.length > 256 || password !== confirmation) {
    return { status: "error", message: "Enter your verification code and matching passwords of at least 12 characters." }
  }

  const response = await sendAuthenticatedRequest("/auth/password/change", "POST", { nonce, password })
  if (!response?.ok) {
    return { status: "error", message: await errorMessage(response, "Password could not be changed.") }
  }
  return { status: "success", message: "Password changed. Keep your new password secure." }
}

export async function signOutEverywhereAction(_state: SettingsActionState, _formData: FormData): Promise<SettingsActionState> {
  const response = await sendAuthenticatedRequest("/auth/logout", "POST")
  if (!response?.ok) {
    return { status: "error", message: await errorMessage(response, "Could not sign out everywhere. Please try again.") }
  }
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut({ scope: "local" })
  redirect("/")
}
