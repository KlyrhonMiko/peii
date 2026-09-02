import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { CookieMethodsServer } from "@supabase/ssr"

vi.mock("server-only", () => ({}))

import { createSurveyOAuthState, SURVEY_OAUTH_STATE_COOKIE } from "@/lib/survey-oauth-state"

const mocks = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
  setSession: vi.fn(),
  signOut: vi.fn(),
  createSurveySupabaseServerClient: vi.fn(),
}))

vi.mock("@/lib/supabase/survey-server", () => ({
  createSurveySupabaseServerClient: mocks.createSurveySupabaseServerClient,
  SURVEY_AUTH_COOKIE_PREFIX: "peii-survey-auth-token",
  SURVEY_CODE_VERIFIER_COOKIE_NAME: "peii-survey-auth-token-code-verifier",
  surveyCookieOptions: {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: false,
  },
  surveySupabaseCookieOptions: {
    name: "peii-survey-auth-token",
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: false,
  },
}))

import { GET } from "./route"

const session = {
  access_token: "supabase-access-token",
  refresh_token: "supabase-refresh-token",
  provider_token: "google-provider-token",
  expires_in: 3600,
  token_type: "bearer" as const,
  user: { id: "user-id" },
}

describe("GET /auth/survey/google/callback", () => {
  beforeEach(() => {
    vi.stubEnv("APP_ORIGIN", "http://localhost:3000")
    vi.stubEnv("SURVEY_OAUTH_STATE_KEY", "a-test-signing-key")
    vi.stubEnv("BACKEND_INTERNAL_URL", "http://backend:8000/api/v1")
    mocks.exchangeCodeForSession.mockResolvedValue({ data: { session }, error: null })
    mocks.setSession.mockResolvedValue({ data: { session: { ...session, provider_token: undefined } }, error: null })
    mocks.signOut.mockResolvedValue({ error: null })
    mocks.createSurveySupabaseServerClient.mockResolvedValue({
      auth: {
        exchangeCodeForSession: mocks.exchangeCodeForSession,
        setSession: mocks.setSession,
        signOut: mocks.signOut,
      },
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it("attests the provider token server-to-server and re-saves a token-scrubbed session", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { attested: true }, message: "ok", errors: null, meta: {} }), { status: 200 }),
    ))
    const state = createSurveyOAuthState("/survey/distribution-token", "flow-12345678", Date.now())
    const request = new NextRequest(
      `http://localhost:3000/auth/survey/google/callback?code=pkce-code`,
    )
    request.cookies.set(SURVEY_OAUTH_STATE_COOKIE, state)

    const response = await GET(request)

    expect(response.headers.get("location")).toBe("http://localhost:3000/survey/distribution-token")
    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith("pkce-code", { flowId: "flow-12345678" })
    expect(mocks.setSession).toHaveBeenCalledWith({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    })
    const fetchCall = vi.mocked(fetch).mock.calls[0]
    expect(fetchCall).toBeDefined()
    expect(fetchCall?.[0]).toBe("http://backend:8000/api/v1/auth/survey/google/attest")
    expect(fetchCall?.[1]).toMatchObject({
      method: "POST",
      headers: {
        Authorization: "Bearer supabase-access-token",
        "Content-Type": "application/json",
      },
    })
    expect((fetchCall?.[1]?.body as string)).toBe(JSON.stringify({ provider_token: "google-provider-token" }))
    expect(response.headers.get("set-cookie") ?? "").not.toContain("google-provider-token")
  })

  it.each([
    "missing-state",
    "expired-state",
    "tampered-state",
  ])("clears state and uses a generic safe error for %s", async (caseName) => {
    const value = caseName === "missing-state"
      ? null
      : caseName === "expired-state"
        ? createSurveyOAuthState("/survey/token", "flow-12345678", Date.now() - 601_000)
        : `${createSurveyOAuthState("/survey/token", "flow-12345678", Date.now())}tampered`
    const request = new NextRequest(
      "http://localhost:3000/auth/survey/google/callback?code=pkce-code",
    )
    if (value) request.cookies.set(SURVEY_OAUTH_STATE_COOKIE, value)

    const response = await GET(request)

    expect(response.headers.get("location")).toBe("http://localhost:3000/survey/auth-error")
    expect(response.headers.get("set-cookie") ?? "").toContain(`${SURVEY_OAUTH_STATE_COOKIE}=`)
    expect(response.headers.get("location")).not.toContain("token")
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled()
  })

  it("clears the survey session and does not leak provider details when attestation fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ data: null, message: "failed", errors: { code: "google_attestation_failed" }, meta: {} }),
      { status: 401 },
    )))
    const state = createSurveyOAuthState("/survey/sensitive-token", "flow-12345678", Date.now())
    const request = new NextRequest(
      "http://localhost:3000/auth/survey/google/callback?code=pkce-code",
    )
    request.cookies.set(SURVEY_OAUTH_STATE_COOKIE, state)

    const response = await GET(request)

    expect(response.headers.get("location")).toBe("http://localhost:3000/survey/auth-error")
    expect(mocks.signOut).toHaveBeenCalledOnce()
    expect(response.headers.get("location")).not.toContain("sensitive-token")
    expect(response.headers.get("location")).not.toContain("google-provider-token")
  })

  it("rejects provider OAuth errors with a generic redirect", async () => {
    const request = new NextRequest(
      "http://localhost:3000/auth/survey/google/callback?error=access_denied&error_description=contains-sensitive-details",
    )

    const response = await GET(request)

    expect(response.headers.get("location")).toBe("http://localhost:3000/survey/auth-error")
    expect(response.headers.get("location")).not.toContain("sensitive-details")
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled()
  })

  it("does not expire an existing survey auth cookie after committing a fresh session", async () => {
    let cookieMethods: CookieMethodsServer | undefined
    mocks.createSurveySupabaseServerClient.mockImplementation((methods: CookieMethodsServer) => {
      cookieMethods = methods
      return Promise.resolve({
        auth: {
          exchangeCodeForSession: mocks.exchangeCodeForSession,
          setSession: mocks.setSession,
          signOut: mocks.signOut,
        },
      })
    })
    mocks.exchangeCodeForSession.mockImplementation(async () => {
      await cookieMethods?.setAll?.([
        { name: "peii-survey-auth-token", value: "provider-session", options: {} },
      ])
      return { data: { session }, error: null }
    })
    mocks.setSession.mockImplementation(async () => {
      await cookieMethods?.setAll?.([
        { name: "peii-survey-auth-token", value: "fresh-session", options: {} },
      ])
      return { data: { session: { ...session, provider_token: undefined } }, error: null }
    })

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { attested: true }, message: "ok", errors: null, meta: {} }), { status: 200 }),
    ))
    const state = createSurveyOAuthState("/survey/distribution-token", "flow-12345678", Date.now())
    const request = new NextRequest(
      "http://localhost:3000/auth/survey/google/callback?code=pkce-code",
      { headers: { cookie: "peii-survey-auth-token=old-session" } },
    )
    request.cookies.set(SURVEY_OAUTH_STATE_COOKIE, state)

    const response = await GET(request)
    const setCookie = response.headers.get("set-cookie") ?? ""

    expect(setCookie).toContain("peii-survey-auth-token=fresh-session")
    expect(setCookie).not.toContain("peii-survey-auth-token=;")
  })

  it("times out a stalled attestation request", async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn<typeof fetch>((_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason))
    }))
    vi.stubGlobal("fetch", fetchMock)
    const state = createSurveyOAuthState("/survey/distribution-token", "flow-12345678", Date.now())
    const request = new NextRequest(
      "http://localhost:3000/auth/survey/google/callback?code=pkce-code",
    )
    request.cookies.set(SURVEY_OAUTH_STATE_COOKIE, state)

    const pending = GET(request)
    for (let attempt = 0; attempt < 5 && !fetchMock.mock.calls.length; attempt += 1) await Promise.resolve()
    await vi.advanceTimersByTimeAsync(15_000)

    const response = await pending
    expect(response.headers.get("location")).toBe("http://localhost:3000/survey/auth-error")
    expect(fetchMock).toHaveBeenCalledOnce()
  })
})
