import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const redirect = vi.fn((destination: string): never => {
    throw new Error(`REDIRECT:${destination}`)
  })
  const setSession = vi.fn()
  const getAuthenticatorAssuranceLevel = vi.fn()
  const getSession = vi.fn()
  const signOut = vi.fn()
  const createSupabaseServerClient = vi.fn(async () => ({
    auth: { getSession, mfa: { getAuthenticatorAssuranceLevel }, setSession, signOut },
  }))
  return { createSupabaseServerClient, getAuthenticatorAssuranceLevel, getSession, redirect, setSession, signOut }
})

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }))
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}))

import { loginAction, logoutAction } from "./actions"

function loginForm() {
  const formData = new FormData()
  formData.set("identifier", "user@example.com")
  formData.set("password", "password")
  formData.set("returnTo", "/researcher/dashboard")
  return formData
}

function response(status: number, headers?: HeadersInit) {
  return new Response(status === 200 ? JSON.stringify({ data: { access_token: "access", refresh_token: "refresh" } }) : null, {
    status,
    ...(headers === undefined ? {} : { headers }),
  })
}

describe("loginAction", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubEnv("BACKEND_INTERNAL_URL", "http://backend.test")
    vi.stubEnv("APP_ORIGIN", "http://localhost:3000")
    mocks.redirect.mockClear()
    mocks.setSession.mockReset()
    mocks.setSession.mockResolvedValue({ error: null })
    mocks.getAuthenticatorAssuranceLevel.mockReset()
    mocks.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal1" },
      error: null,
    })
    mocks.getSession.mockReset()
    mocks.signOut.mockReset()
    mocks.signOut.mockResolvedValue({ error: null })
  })

  it("keeps ordinary credential failures generic", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(401)))

    await expect(loginAction(null, loginForm())).resolves.toEqual({ error: "invalid" })
  })

  it("distinguishes rate limiting without forwarding client IP headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(429, { "Retry-After": "30" }))
    vi.stubGlobal("fetch", fetchMock)

    await expect(loginAction(null, loginForm())).resolves.toEqual({ error: "rate-limited", retryAfter: 30 })
    const request = fetchMock.mock.calls[0]?.[1]
    expect(request).toBeDefined()
    expect(request?.headers).toEqual({ "Content-Type": "application/json" })
  })

  it("distinguishes temporary unavailability without account-specific details", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(503)))

    await expect(loginAction(null, loginForm())).resolves.toEqual({ error: "unavailable", retryAfter: null })
  })

  it("redirects a password session to the requested destination when MFA is not enrolled", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(200)))

    await expect(loginAction(null, loginForm())).rejects.toThrow("REDIRECT:/researcher/dashboard")
    expect(mocks.getAuthenticatorAssuranceLevel).toHaveBeenCalledWith("access")
  })

  it("routes an AAL1 session with a verified factor through the MFA challenge", async () => {
    mocks.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal2" },
      error: null,
    })
    const formData = loginForm()
    formData.set("returnTo", "/settings")
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(200)))

    await expect(loginAction(null, formData)).rejects.toThrow("REDIRECT:/mfa/verify?returnTo=%2Fsettings")
    expect(mocks.getAuthenticatorAssuranceLevel).toHaveBeenCalledWith("access")
  })

  it("falls back to the dashboard for an unsafe login return path", async () => {
    const formData = loginForm()
    formData.set("returnTo", "https://evil.example/steal")
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(200)))

    await expect(loginAction(null, formData)).rejects.toThrow("REDIRECT:/researcher/dashboard")
  })

  it("clears the newly-created session when MFA assurance cannot be checked", async () => {
    mocks.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: null,
      error: new Error("service unavailable"),
    })
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(200)))

    await expect(loginAction(null, loginForm())).resolves.toEqual({ error: "unavailable", retryAfter: null })
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" })
  })
})

describe("logoutAction", () => {
  it("clears the local session when backend logout fails", async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: "access" } },
    })
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })))
    vi.spyOn(console, "error").mockImplementation(() => undefined)

    await expect(logoutAction()).rejects.toThrow("REDIRECT:/")

    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" })
    expect(mocks.redirect).toHaveBeenCalledWith("/")
  })
})
