import "server-only"

import { cache } from "react"
import { redirect } from "next/navigation"

import { safeMfaReturnTo } from "@/lib/safe-redirect"
import { createSupabaseServerClient } from "@/lib/supabase/server"

const DEFAULT_PORTAL_RETURN_TO = "/researcher/dashboard"

export interface PortalUser {
  id: string
  user_id: string
  email: string
  username: string
  first_name: string
  last_name: string
  middle_name: string | null
  contact: string | null
  permissions: string[]
  roles: string[]
}

export interface PortalMfaFactor {
  id: string
  friendlyName: string
  createdAt: string
  updatedAt: string
}

export interface PortalMfaStatus {
  factors: PortalMfaFactor[]
  currentLevel: string | null
  nextLevel: string | null
}

export async function requirePortalUser(
  permission?: string,
  returnTo = DEFAULT_PORTAL_RETURN_TO,
): Promise<PortalUser> {
  const user = await getPortalUser(returnTo)
  if (permission && !user.permissions.includes(permission)) redirect("/access-denied")
  return user
}

/**
 * Resolves the current portal user once per request. React's per-request cache
 * deduplicates the Supabase session lookups and the backend /auth/me call across
 * layout and page guards (and between permission variants).
 */
const getPortalUser = cache(async (returnTo: string): Promise<PortalUser> => {
  const backendUrl = process.env.BACKEND_INTERNAL_URL
  if (!backendUrl) throw new Error("BACKEND_INTERNAL_URL is not configured")
  const supabase = await createSupabaseServerClient()
  const [claimsResult, sessionResult] = await Promise.all([
    supabase.auth.getClaims(),
    supabase.auth.getSession(),
  ])
  const claims = claimsResult.data
  const session = sessionResult.data
  if (!claims?.claims || !session.session?.access_token) redirect("/?login=true")

  if (hasOAuthAuthenticationMethod(claims.claims.amr)) redirect("/?login=true")

  const { data: assurance, error: assuranceError } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel(session.session.access_token)
  if (assuranceError || !assurance) redirect("/access-denied")
  if (assurance.currentLevel !== "aal2" && assurance.nextLevel === "aal2") {
    redirectToMfa(returnTo)
  }

  const response = await fetch(`${backendUrl}/auth/me`, {
    headers: { Authorization: `Bearer ${session.session.access_token}` },
    cache: "no-store",
  })
  if (await isMfaRequiredResponse(response)) redirectToMfa(returnTo)
  if (response.status === 401) redirect("/?login=true")
  if (!response.ok) redirect("/access-denied")
  const payload: unknown = await response.json()
  if (!isPortalUserEnvelope(payload)) throw new Error("Backend returned an invalid current-user response")
  return payload.data
})

/**
 * Reads only the verified TOTP metadata needed by the Settings screen.
 * Enrollment secrets and QR payloads never leave the enrollment action.
 */
export const getPortalMfaStatus = cache(async (): Promise<PortalMfaStatus> => {
  const supabase = await createSupabaseServerClient()
  const [{ data: claimsResult }, { data: sessionData }] = await Promise.all([
    supabase.auth.getClaims(),
    supabase.auth.getSession(),
  ])
  const accessToken = sessionData.session?.access_token
  if (!claimsResult?.claims || !accessToken) redirect("/?login=true")
  if (hasOAuthAuthenticationMethod(claimsResult.claims.amr)) redirect("/?login=true")

  const [{ data: factors, error: factorsError }, { data: assurance, error: assuranceError }] =
    await Promise.all([
      supabase.auth.mfa.listFactors(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(accessToken),
    ])
  if (factorsError || assuranceError || !factors || !assurance) {
    throw new Error("Unable to read authenticator status")
  }

  return {
    factors: factors.totp
      .filter((factor) => factor.status === "verified")
      .map((factor) => ({
        id: factor.id,
        friendlyName: factor.friendly_name?.trim() || "Authenticator app",
        createdAt: factor.created_at,
        updatedAt: factor.updated_at,
      })),
    currentLevel: assurance.currentLevel,
    nextLevel: assurance.nextLevel,
  }
})

/**
 * Authenticates the portal MFA challenge page without calling the portal API.
 * This is intentionally separate from requirePortalUser because an AAL1 session
 * with a verified factor must be allowed to reach the challenge itself.
 */
export const getPortalMfaChallenge = cache(async (): Promise<PortalMfaStatus> => {
  const supabase = await createSupabaseServerClient()
  const [{ data: claimsResult }, { data: sessionResult }] = await Promise.all([
    supabase.auth.getClaims(),
    supabase.auth.getSession(),
  ])
  const claims = claimsResult
  const session = sessionResult
  const accessToken = session.session?.access_token
  if (!claims?.claims || !accessToken) redirect("/?login=true")
  if (hasOAuthAuthenticationMethod(claims.claims.amr)) redirect("/?login=true")

  const [{ data: factors, error: factorsError }, { data: assurance, error: assuranceError }] =
    await Promise.all([
      supabase.auth.mfa.listFactors(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(accessToken),
    ])
  if (factorsError || assuranceError || !factors || !assurance) {
    throw new Error("Unable to read authenticator status")
  }

  return {
    factors: factors.totp
      .filter((factor) => factor.status === "verified")
      .map((factor) => ({
        id: factor.id,
        friendlyName: factor.friendly_name?.trim() || "Authenticator app",
        createdAt: factor.created_at,
        updatedAt: factor.updated_at,
      })),
    currentLevel: assurance.currentLevel,
    nextLevel: assurance.nextLevel,
  }
})

function hasOAuthAuthenticationMethod(value: unknown): boolean {
  if (!Array.isArray(value)) return false
  return value.some((entry) => {
    if (typeof entry === "string") return entry.toLowerCase() === "oauth"
    if (typeof entry !== "object" || entry === null || !("method" in entry)) return false
    return typeof entry.method === "string" && entry.method.toLowerCase() === "oauth"
  })
}

function redirectToMfa(returnTo: string): never {
  redirect(`/?mfa=true&returnTo=${encodeURIComponent(safeMfaReturnTo(returnTo))}`)
}

async function isMfaRequiredResponse(response: Response): Promise<boolean> {
  if (response.status !== 401 && response.status !== 403) return false
  try {
    const payload: unknown = await response.json()
    return hasMfaRequiredCode(payload)
  } catch {
    return false
  }
}

function hasMfaRequiredCode(value: unknown): boolean {
  if (Array.isArray(value)) return value.some((entry) => hasMfaRequiredCode(entry))
  if (typeof value !== "object" || value === null) return false
  if ("code" in value && value.code === "mfa_required") return true
  return "errors" in value && hasMfaRequiredCode(value.errors)
}

function isPortalUserEnvelope(value: unknown): value is { data: PortalUser } {
  if (typeof value !== "object" || value === null || !("data" in value)) return false
  const data = value.data
  return typeof data === "object" && data !== null && "permissions" in data && Array.isArray(data.permissions)
}
