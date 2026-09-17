"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { getPortalMfaChallenge, requirePortalUser, type PortalMfaStatus } from "@/lib/auth"
import { safeMfaReturnTo } from "@/lib/safe-redirect"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export async function getMfaChallengeAction(): Promise<PortalMfaStatus> {
  return await getPortalMfaChallenge()
}

const MFA_CODE_PATTERN = /^\d{6}$/
const MFA_FACTOR_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DEFAULT_FRIENDLY_NAME = "PEII Authenticator"

export interface MfaEnrollment {
  factorId: string
  friendlyName: string
  qrCode: string
  secret: string
}

export type MfaActionState = {
  status: "idle" | "success" | "error"
  message: string
  enrollment?: MfaEnrollment
}

export async function enrollTotpAction(
  _state: MfaActionState,
  formData: FormData,
): Promise<MfaActionState> {
  if (formData.get("intent") === "cancel") {
    const factorId = factorIdFromForm(formData)
    if (!factorId) return { status: "error", message: "That unfinished setup could not be identified." }

    const { supabase } = await authenticatedPortalClient()
    const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors()
    const factor = factors?.all.find(
      (candidate) => candidate.id === factorId && candidate.factor_type === "totp" && candidate.status === "unverified",
    )
    if (factorsError || !factor) {
      return { status: "error", message: "That unfinished setup could not be cancelled. Refresh and try again." }
    }
    const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id })
    if (error) return { status: "error", message: "That unfinished setup could not be cancelled. Please try again." }
    return { status: "idle", message: "" }
  }

  const friendlyName = friendlyNameFromForm(formData)
  if (!friendlyName) {
    return { status: "error", message: "Enter a name for this authenticator." }
  }

  const { supabase } = await authenticatedPortalClient()
  // The provider retains abandoned, unverified enrollments. Discard them
  // before creating a fresh factor so a retry cannot exhaust the factor limit.
  const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors()
  if (factorsError || !factors) {
    return { status: "error", message: "Authenticator setup could not be started. Please try again." }
  }
  for (const factor of factors.all) {
    if (factor.factor_type !== "totp" || factor.status !== "unverified") continue
    const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id })
    if (error) {
      return { status: "error", message: "Authenticator setup could not be started. Please try again." }
    }
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName,
  })
  const qrCode = normalizeQrCode(data?.totp?.qr_code)
  if (error || !data || data.type !== "totp" || !data.totp || !qrCode) {
    return { status: "error", message: "Authenticator setup could not be started. Please try again." }
  }

  return {
    status: "success",
    message: "Scan the QR code, or enter the setup key, then verify a six-digit code.",
    enrollment: {
      factorId: data.id,
      friendlyName,
      qrCode,
      secret: data.totp.secret,
    },
  }
}

export async function verifyTotpEnrollmentAction(
  _state: MfaActionState,
  formData: FormData,
): Promise<MfaActionState> {
  const factorId = factorIdFromForm(formData)
  const code = codeFromForm(formData)
  if (!factorId || !code) {
    return { status: "error", message: "Enter the six-digit code from your authenticator app." }
  }

  const { supabase } = await authenticatedPortalClient()
  const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId })
  if (challengeError || !challenge?.id) {
    return { status: "error", message: "The authenticator code could not be verified. Try again." }
  }

  const { data: verifiedSession, error: verifyError } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code,
  })
  if (verifyError || !verifiedSession?.access_token) {
    return { status: "error", message: "That authenticator code is invalid or expired." }
  }

  const { data: assurance, error: assuranceError } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel(verifiedSession.access_token)
  if (assuranceError || assurance?.currentLevel !== "aal2") {
    return { status: "error", message: "The authenticator was not fully verified. Please try again." }
  }

  revalidatePath("/settings")
  return { status: "success", message: "Authenticator app verified. Other active sessions were signed out." }
}

export async function unenrollTotpAction(
  _state: MfaActionState,
  formData: FormData,
): Promise<MfaActionState> {
  const factorId = factorIdFromForm(formData)
  if (!factorId) {
    return { status: "error", message: "That authenticator could not be identified." }
  }

  const { supabase, accessToken } = await authenticatedPortalClient()
  const { data: assurance, error: assuranceError } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel(accessToken)
  if (assuranceError || assurance?.currentLevel !== "aal2") {
    return { status: "error", message: "Verify your authenticator code before removing it." }
  }

  const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors()
  const factor = factors?.totp.find((candidate) => candidate.id === factorId && candidate.status === "verified")
  if (factorsError || !factor) {
    return { status: "error", message: "That authenticator could not be removed. Refresh and try again." }
  }

  const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id })
  if (error) {
    return { status: "error", message: "That authenticator could not be removed. Please try again." }
  }

  // Removing the final factor can leave the current cookie holding an AAL2 JWT.
  // Refresh it before the Settings page is rendered so the session reflects the
  // new factor state and cannot retain a stale elevated assurance level.
  const { error: refreshError } = await supabase.auth.refreshSession()
  if (refreshError) {
    return { status: "error", message: "The authenticator was removed, but the session could not be refreshed. Sign in again." }
  }

  revalidatePath("/settings")
  return { status: "success", message: "Authenticator app removed." }
}

export async function verifyMfaChallengeAction(
  _state: MfaActionState,
  formData: FormData,
): Promise<MfaActionState> {
  const returnTo = safeMfaReturnTo(formData.get("returnTo"))
  const factorId = factorIdFromForm(formData)
  const code = codeFromForm(formData)
  if (!factorId || !code) {
    return { status: "error", message: "Enter the six-digit code from your authenticator app." }
  }

  const { supabase } = await authenticatedChallengeClient()
  const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors()
  const factor = factors?.totp.find((candidate) => candidate.id === factorId && candidate.status === "verified")
  if (factorsError || !factor) {
    return { status: "error", message: "That authenticator is not available. Refresh and try again." }
  }

  const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
    factorId: factor.id,
  })
  if (challengeError || !challenge?.id) {
    return { status: "error", message: "The authenticator code could not be verified. Try again." }
  }

  const { data: verifiedSession, error: verifyError } = await supabase.auth.mfa.verify({
    factorId: factor.id,
    challengeId: challenge.id,
    code,
  })
  if (verifyError || !verifiedSession?.access_token) {
    return { status: "error", message: "That authenticator code is invalid or expired." }
  }

  const { data: assurance, error: assuranceError } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel(verifiedSession.access_token)
  if (assuranceError || assurance?.currentLevel !== "aal2") {
    return { status: "error", message: "The authenticator was not fully verified. Please try again." }
  }

  redirect(returnTo)
}

async function authenticatedPortalClient() {
  await requirePortalUser("portal.access", "/settings")
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase.auth.getSession()
  const accessToken = data.session?.access_token
  if (!accessToken) redirect("/?login=true")
  return { supabase, accessToken }
}

async function authenticatedChallengeClient() {
  // This helper intentionally does not call requirePortalUser: an AAL1 session
  // with a verified factor must reach this page to complete the second factor.
  await getPortalMfaChallenge()
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase.auth.getSession()
  const accessToken = data.session?.access_token
  if (!accessToken) redirect("/?login=true")
  return { supabase, accessToken }
}

function friendlyNameFromForm(formData: FormData): string | null {
  const value = formData.get("friendly_name")
  if (value === null) return DEFAULT_FRIENDLY_NAME
  if (typeof value !== "string") return null
  const friendlyName = value.trim()
  return friendlyName.length > 0 && friendlyName.length <= 100 ? friendlyName : null
}

function factorIdFromForm(formData: FormData): string | null {
  const value = formData.get("factor_id")
  return typeof value === "string" && MFA_FACTOR_ID_PATTERN.test(value) ? value : null
}

function codeFromForm(formData: FormData): string | null {
  const value = formData.get("code")
  return typeof value === "string" && MFA_CODE_PATTERN.test(value) ? value : null
}

function normalizeQrCode(value: unknown): string | null {
  if (typeof value !== "string") return null
  const comma = value.indexOf(",")
  if (comma < 0 || !/^data:image\/svg\+xml(?:;[^,]*)?$/i.test(value.slice(0, comma))) return null

  const payload = value.slice(comma + 1).trim()
  if (!payload) return null
  // Supabase may return raw XML in the data URI. Encode it so Next/Image does
  // not reject the trailing newline and the browser can parse the URI safely.
  return payload.startsWith("<")
    ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(payload)}`
    : `${value.slice(0, comma)},${payload}`
}
