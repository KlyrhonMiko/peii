import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const mocks = vi.hoisted(() => ({
  signInWithOAuth: vi.fn(),
  createSurveySupabaseServerClient: vi.fn(),
}))

vi.mock("@/lib/supabase/survey-server", () => ({
  createSurveySupabaseServerClient: mocks.createSurveySupabaseServerClient,
}))

import { POST } from "./route"

describe("POST /auth/survey/google/start", () => {
  beforeEach(() => {
    vi.stubEnv("APP_ORIGIN", "http://localhost:3000")
    vi.stubEnv("SUPABASE_URL", "https://project.supabase.co")
    vi.stubEnv("SURVEY_OAUTH_STATE_KEY", "a-test-signing-key")
    mocks.signInWithOAuth.mockResolvedValue({
      data: {
        provider: "google",
        url: "https://project.supabase.co/auth/v1/authorize?provider=google",
        flowId: "flow-12345678",
      },
      error: null,
    })
    mocks.createSurveySupabaseServerClient.mockResolvedValue({
      auth: { signInWithOAuth: mocks.signInWithOAuth },
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  it("returns the validated provider URL as no-store JSON and sets signed state", async () => {
    const token = "distribution-token"
    const response = await POST(
      new NextRequest("http://localhost:3000/auth/survey/google/start", {
        method: "POST",
        body: new URLSearchParams({ returnTo: `/survey/${token}` }),
        headers: { origin: "http://localhost:3000", "content-type": "application/x-www-form-urlencoded" },
      }),
    )

    expect(mocks.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: "http://localhost:3000/auth/survey/google/callback",
        scopes: "openid email profile",
      },
    })
    expect(response.status).toBe(200)
    expect(response.headers.get("location")).toBeNull()
    expect(response.headers.get("cache-control")).toBe("no-store")
    await expect(response.json()).resolves.toEqual({
      url: "https://project.supabase.co/auth/v1/authorize?provider=google",
    })
    const setCookie = response.headers.get("set-cookie") ?? ""
    expect(setCookie).toContain("peii-survey-oauth-state=")
    expect(setCookie).not.toContain(token)
  })

  it.each([
    { name: "mismatched Origin", origin: "https://attacker.example" },
    { name: "null Origin", origin: "null" },
  ])("denies a $name without contacting Supabase", async ({ origin }) => {
    const response = await POST(
      new NextRequest("http://localhost:3000/auth/survey/google/start", {
        method: "POST",
        body: new URLSearchParams({ returnTo: "/survey/token" }),
        headers: { origin },
      }),
    )

    expect(response.status).toBe(303)
    expect(response.headers.get("location")).toBe("http://localhost:3000/survey/auth-error")
    expect(mocks.signInWithOAuth).not.toHaveBeenCalled()
  })

  it("rejects an unsafe return path without contacting Supabase", async () => {
    const response = await POST(
      new NextRequest("http://localhost:3000/auth/survey/google/start", {
        method: "POST",
        body: new URLSearchParams({ returnTo: "https://evil.example/survey/token" }),
        headers: { origin: "http://localhost:3000" },
      }),
    )

    expect(response.status).toBe(303)
    expect(response.headers.get("location")).toBe("http://localhost:3000/survey/auth-error")
    expect(mocks.signInWithOAuth).not.toHaveBeenCalled()
  })

  it.each([
    "not-a-url",
    "https://attacker.example/auth/v1/authorize?provider=google",
    "https://project.supabase.co/auth/v1/authorize?provider=github",
  ])("rejects an invalid provider URL without setting state (%s)", async (url) => {
    mocks.signInWithOAuth.mockResolvedValueOnce({
      data: { provider: "google", url, flowId: "flow-12345678" },
      error: null,
    })

    const response = await POST(
      new NextRequest("http://localhost:3000/auth/survey/google/start", {
        method: "POST",
        body: new URLSearchParams({ returnTo: "/survey/distribution-token" }),
        headers: {
          origin: "http://localhost:3000",
          "content-type": "application/x-www-form-urlencoded",
        },
      }),
    )

    expect(response.status).toBe(303)
    expect(response.headers.get("location")).toBe("http://localhost:3000/survey/auth-error")
    expect(response.headers.get("set-cookie")).toBeNull()
  })
})
