import "server-only"

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
  const backendUrl = process.env.BACKEND_INTERNAL_URL
  if (!backendUrl) throw new Error("BACKEND_INTERNAL_URL is not configured")
  const supabase = await createSupabaseServerClient()
  const { data: claims } = await supabase.auth.getClaims()
  const { data: session } = await supabase.auth.getSession()
  if (!claims?.claims || !session.session?.access_token) redirect("/?login=true")

  const response = await fetch(`${backendUrl}/auth/me`, {
    headers: { Authorization: `Bearer ${session.session.access_token}` },
    cache: "no-store",
  })
  if (response.status === 401) redirect("/?login=true")
  if (!response.ok) redirect("/access-denied")
  const payload: unknown = await response.json()
  if (!isPortalUserEnvelope(payload)) throw new Error("Backend returned an invalid current-user response")
  if (permission && !payload.data.permissions.includes(permission)) redirect("/access-denied")
  return payload.data
}

function isPortalUserEnvelope(value: unknown): value is { data: PortalUser } {
  if (typeof value !== "object" || value === null || !("data" in value)) return false
  const data = value.data
  return typeof data === "object" && data !== null && "permissions" in data && Array.isArray(data.permissions)
}
