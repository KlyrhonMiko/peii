import { NextRequest } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getClaims: vi.fn(),
  getSession: vi.fn(),
  createSurveySupabaseServerClient: vi.fn(),
}))

vi.mock("@/lib/supabase/survey-server", () => ({
  createSurveySupabaseServerClient: mocks.createSurveySupabaseServerClient,
}))

import { GET, PATCH, POST } from "./route"

const context = (token: string) => ({ params: Promise.resolve({ token }) })

describe("focused survey BFF", () => {
  const mockSurveyClient = () => {
    mocks.createSurveySupabaseServerClient.mockResolvedValue({
      auth: { getClaims: mocks.getClaims, getSession: mocks.getSession },
    })
  }

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it("requires the isolated survey session without forwarding browser credentials", async () => {
    vi.stubEnv("BACKEND_INTERNAL_URL", "http://backend:8000/api/v1")
    mocks.getClaims.mockResolvedValue({ data: { claims: null } })
    mocks.getSession.mockResolvedValue({ data: { session: null } })
    mockSurveyClient()
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    const response = await GET(
      new NextRequest("http://localhost:3000/api/survey/token", {
        headers: { authorization: "Bearer browser-token", cookie: "portal=secret" },
      }),
      context("token"),
    )

    expect(response.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(await response.json()).toMatchObject({ errors: { code: "google_login_required" } })
  })

  it("requires an exact same-origin POST and forwards only safe headers plus the server bearer", async () => {
    vi.stubEnv("APP_ORIGIN", "http://localhost:3000")
    vi.stubEnv("BACKEND_INTERNAL_URL", "http://backend:8000/api/v1")
    mocks.getClaims.mockResolvedValue({ data: { claims: { sub: "user" } } })
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: "survey-token" } } })
    mockSurveyClient()
    const fetchMock = vi.fn<typeof fetch>(async () => new Response('{"data":{"accepted":true}}', { status: 201 }))
    vi.stubGlobal("fetch", fetchMock)

    const rejected = await POST(
      new NextRequest("http://localhost:3000/api/survey/token", {
        method: "POST",
        headers: { origin: "https://evil.example", authorization: "Bearer browser-token", cookie: "secret=1" },
        body: "{}",
      }),
      context("token"),
    )
    expect(rejected.status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()

    const response = await POST(
      new NextRequest("http://localhost:3000/api/survey/token", {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          authorization: "Bearer browser-token",
          cookie: "secret=1",
          "content-type": "application/json",
          "idempotency-key": "request-key",
          "x-request-id": "must-not-forward",
        },
        body: "{}",
      }),
      context("token"),
    )

    expect(response.status).toBe(201)
    const call = fetchMock.mock.calls[0]
    expect(call).toBeDefined()
    const headers = new Headers(call?.[1]?.headers)
    expect(headers.get("authorization")).toBe("Bearer survey-token")
    expect(headers.get("content-type")).toBe("application/json")
    expect(headers.get("idempotency-key")).toBe("request-key")
    expect(headers.get("cookie")).toBeNull()
    expect(headers.get("x-request-id")).toBeNull()
    expect(response.headers.get("cache-control")).toBe("no-store")

    const patchResponse = await PATCH(
      new NextRequest("http://localhost:3000/api/survey/token", {
        method: "PATCH",
        headers: {
          origin: "http://localhost:3000",
          authorization: "Bearer browser-token",
          cookie: "secret=1",
          "content-type": "application/json",
          "idempotency-key": "phase-two-key",
        },
        body: JSON.stringify({ answers: { "question-1": "answer" } }),
      }),
      context("token"),
    )

    expect(patchResponse.status).toBe(201)
    const patchCall = fetchMock.mock.calls[1]
    expect(patchCall?.[0]).toBe("http://backend:8000/api/v1/survey/token/respond")
    const patchHeaders = new Headers(patchCall?.[1]?.headers)
    expect(patchHeaders.get("authorization")).toBe("Bearer survey-token")
    expect(patchHeaders.get("content-type")).toBe("application/json")
    expect(patchHeaders.get("idempotency-key")).toBe("phase-two-key")
    expect(patchHeaders.get("cookie")).toBeNull()
    expect(patchHeaders.get("x-request-id")).toBeNull()
    expect(patchCall?.[1]?.cache).toBe("no-store")
    expect(patchResponse.headers.get("cache-control")).toBe("no-store")
  })

  it("rejects a streamed body over 65536 bytes and aborts upstream headers at 15 seconds", async () => {
    vi.useFakeTimers()
    vi.stubEnv("APP_ORIGIN", "http://localhost:3000")
    vi.stubEnv("BACKEND_INTERNAL_URL", "http://backend:8000/api/v1")
    mocks.getClaims.mockResolvedValue({ data: { claims: { sub: "user" } } })
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: "survey-token" } } })
    mockSurveyClient()
    const fetchMock = vi.fn<typeof fetch>((_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason))
    }))
    vi.stubGlobal("fetch", fetchMock)

    const oversized = await POST(
      new NextRequest("http://localhost:3000/api/survey/token", {
        method: "POST",
        headers: { origin: "http://localhost:3000", "content-length": "65537" },
        body: "x",
      }),
      context("token"),
    )
    expect(oversized.status).toBe(413)
    expect(fetchMock).not.toHaveBeenCalled()

    const pending = GET(
      new NextRequest("http://localhost:3000/api/survey/token"),
      context("token"),
    )
    for (let attempt = 0; attempt < 5 && !fetchMock.mock.calls.length; attempt += 1) await Promise.resolve()
    await vi.advanceTimersByTimeAsync(15000)
    expect((await pending).status).toBe(504)
  })
})
