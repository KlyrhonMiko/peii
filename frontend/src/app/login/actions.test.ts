import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const redirect = vi.fn((destination: string): never => {
    throw new Error(`REDIRECT:${destination}`)
  })
  const setSession = vi.fn()
  const createSupabaseServerClient = vi.fn(async () => ({ auth: { setSession } }))
  return { createSupabaseServerClient, redirect, setSession }
})

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }))
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}))

import { loginAction } from "./actions"

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
    mocks.redirect.mockClear()
    mocks.setSession.mockReset()
    mocks.setSession.mockResolvedValue({ error: null })
  })

  it("keeps ordinary credential failures generic", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(401)))

    await expect(loginAction(loginForm())).rejects.toThrow("REDIRECT:/login?error=invalid")
  })

  it("distinguishes rate limiting without forwarding client IP headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(429, { "Retry-After": "30" }))
    vi.stubGlobal("fetch", fetchMock)

    await expect(loginAction(loginForm())).rejects.toThrow(
      "REDIRECT:/login?error=rate-limited&retryAfter=30",
    )
    const request = fetchMock.mock.calls[0]?.[1]
    expect(request).toBeDefined()
    expect(request?.headers).toEqual({ "Content-Type": "application/json" })
  })

  it("distinguishes temporary unavailability without account-specific details", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(503)))

    await expect(loginAction(loginForm())).rejects.toThrow("REDIRECT:/login?error=unavailable")
  })
})
