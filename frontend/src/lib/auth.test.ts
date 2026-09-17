import { beforeEach, describe, expect, it, vi } from "vitest"

const FACTOR_ID = "11111111-1111-4111-8111-111111111111"
const mocks = vi.hoisted(() => {
  const redirect = vi.fn((destination: string): never => {
    throw new Error(`REDIRECT:${destination}`)
  })
  const getClaims = vi.fn()
  const getSession = vi.fn()
  const listFactors = vi.fn()
  const getAuthenticatorAssuranceLevel = vi.fn()
  const createSupabaseServerClient = vi.fn(async () => ({
    auth: {
      getClaims,
      getSession,
      mfa: { getAuthenticatorAssuranceLevel, listFactors },
    },
  }))
  return { createSupabaseServerClient, getAuthenticatorAssuranceLevel, getClaims, getSession, listFactors, redirect }
})

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }))
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: mocks.createSupabaseServerClient }))

import { getPortalMfaStatus, requirePortalUser } from "./auth"

function session() {
  return { data: { session: { access_token: "access" } } }
}

function claims(amr: unknown[] = ["password"]) {
  return { data: { claims: { amr } } }
}

describe("portal authentication MFA guard", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubEnv("APP_ORIGIN", "http://localhost:3000")
    vi.stubEnv("BACKEND_INTERNAL_URL", "http://backend.test")
    mocks.redirect.mockClear()
    mocks.getClaims.mockReset()
    mocks.getClaims.mockResolvedValue(claims())
    mocks.getSession.mockReset()
    mocks.getSession.mockResolvedValue(session())
    mocks.getAuthenticatorAssuranceLevel.mockReset()
    mocks.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal1" },
      error: null,
    })
    mocks.listFactors.mockReset()
    mocks.listFactors.mockResolvedValue({ data: { all: [], phone: [], totp: [], webauthn: [] }, error: null })
  })

  it("redirects an AAL1 session with a verified factor before calling the portal API", async () => {
    mocks.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal2" },
      error: null,
    })
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    await expect(requirePortalUser("portal.access", "/settings?tab=security")).rejects.toThrow(
      "REDIRECT:/mfa/verify?returnTo=%2Fsettings%3Ftab%3Dsecurity",
    )
    expect(mocks.getAuthenticatorAssuranceLevel).toHaveBeenCalledWith("access")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("recognizes the backend mfa_required envelope when assurance metadata is stale", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: null,
      message: "Additional authentication is required.",
      errors: { code: "mfa_required" },
      meta: null,
    }), { status: 403, headers: { "Content-Type": "application/json" } })))

    await expect(requirePortalUser("portal.access", "/researcher/dashboard")).rejects.toThrow(
      "REDIRECT:/mfa/verify?returnTo=%2Fresearcher%2Fdashboard",
    )
  })

  it("keeps ordinary permission failures on the access-denied path", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: null,
      message: "You do not have permission to perform this action.",
      errors: null,
      meta: null,
    }), { status: 403, headers: { "Content-Type": "application/json" } })))

    await expect(requirePortalUser("portal.access", "/admin/users")).rejects.toThrow("REDIRECT:/access-denied")
  })

  it("does not treat the isolated OAuth respondent boundary as a portal session", async () => {
    mocks.getClaims.mockResolvedValue(claims([{ method: "oauth" }]))
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    await expect(requirePortalUser("portal.access", "/researcher/dashboard")).rejects.toThrow("REDIRECT:/?login=true")
    expect(mocks.getAuthenticatorAssuranceLevel).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("returns only verified TOTP metadata for the Settings page", async () => {
    mocks.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal2", nextLevel: "aal2" },
      error: null,
    })
    mocks.listFactors.mockResolvedValue({
      data: {
        all: [
          { id: FACTOR_ID, factor_type: "totp", status: "verified", friendly_name: "Laptop", created_at: "2026-09-17T00:00:00Z", updated_at: "2026-09-17T00:00:00Z" },
          { id: "22222222-2222-4222-8222-222222222222", factor_type: "totp", status: "unverified", friendly_name: "Pending", created_at: "2026-09-17T00:00:00Z", updated_at: "2026-09-17T00:00:00Z" },
        ],
        phone: [],
        totp: [{ id: FACTOR_ID, factor_type: "totp", status: "verified", friendly_name: "Laptop", created_at: "2026-09-17T00:00:00Z", updated_at: "2026-09-17T00:00:00Z" }],
        webauthn: [],
      },
      error: null,
    })

    await expect(getPortalMfaStatus()).resolves.toEqual({
      factors: [{ id: FACTOR_ID, friendlyName: "Laptop", createdAt: "2026-09-17T00:00:00Z", updatedAt: "2026-09-17T00:00:00Z" }],
      currentLevel: "aal2",
      nextLevel: "aal2",
    })
    expect(mocks.getAuthenticatorAssuranceLevel).toHaveBeenCalledWith("access")
  })
})
