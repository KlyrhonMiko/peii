import "server-only"

import { cache } from "react"
import { redirect } from "next/navigation"

import { createSupabaseServerClient } from "@/lib/supabase/server"

export interface PortalUser {
  id: string
  user_id: string
  email: string
  username: string
  first_name: string
  last_name: string
  permissions: string[]
  roles: string[]
}

export async function requirePortalUser(permission?: string): Promise<PortalUser> {
  const user = await getPortalUser()
  if (permission && !user.permissions.includes(permission)) redirect("/access-denied")
  return user
}

/**
 * Resolves the current portal user once per request. React's per-request cache
 * deduplicates the Supabase session lookups and the backend /auth/me call across
 * layout and page guards (and between permission variants).
 */
const getPortalUser = cache(async (): Promise<PortalUser> => {
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

  const response = await fetch(`${backendUrl}/auth/me`, {
    headers: { Authorization: `Bearer ${session.session.access_token}` },
    cache: "no-store",
  })
  if (response.status === 401) redirect("/?login=true")
  if (!response.ok) redirect("/access-denied")
  const payload: unknown = await response.json()
  if (!isPortalUserEnvelope(payload)) throw new Error("Backend returned an invalid current-user response")
  return payload.data
})

function isPortalUserEnvelope(value: unknown): value is { data: PortalUser } {
  if (typeof value !== "object" || value === null || !("data" in value)) return false
  const data = value.data
  return typeof data === "object" && data !== null && "permissions" in data && Array.isArray(data.permissions)
}
