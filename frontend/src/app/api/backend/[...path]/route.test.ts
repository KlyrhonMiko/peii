import { NextRequest } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const getClaims = vi.fn()
  const getSession = vi.fn()
  const createSupabaseServerClient = vi.fn(async () => ({ auth: { getClaims, getSession } }))
  return { createSupabaseServerClient, getClaims, getSession }
})

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: mocks.createSupabaseServerClient }))

import { GET, PATCH, POST } from "./route"

const context = (path: string[]) => ({ params: Promise.resolve({ path }) })

describe("backend BFF", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it("rejects unsafe requests without the trusted origin", async () => {
    vi.stubEnv("BACKEND_INTERNAL_URL", "http://backend:8000/api/v1")
    vi.stubEnv("APP_ORIGIN", "http://localhost:3000")
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    const response = await PATCH(
      new NextRequest("http://localhost:3000/api/backend/users/USER-123", { method: "PATCH" }),
      context(["users", "USER-123"]),
    )

    expect(response.status).toBe(403)
    expect(mocks.createSupabaseServerClient).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("rejects unsafe requests from another origin", async () => {
    vi.stubEnv("BACKEND_INTERNAL_URL", "http://backend:8000/api/v1")
    vi.stubEnv("APP_ORIGIN", "http://localhost:3000")
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    const response = await PATCH(
      new NextRequest("http://localhost:3000/api/backend/users/USER-123", {
        method: "PATCH",
        headers: { origin: "https://evil.example" },
      }),
      context(["users", "USER-123"]),
    )

    expect(response.status).toBe(403)
    expect(mocks.createSupabaseServerClient).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("forwards unsafe requests from the trusted origin", async () => {
    vi.stubEnv("BACKEND_INTERNAL_URL", "http://backend:8000/api/v1")
    vi.stubEnv("APP_ORIGIN", "http://localhost:3000")
    mocks.getClaims.mockResolvedValue({ data: { claims: { sub: "user-id" } } })
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: "access-token" } } })
    const fetchMock = vi.fn(async () => new Response('{"data":null}'))
    vi.stubGlobal("fetch", fetchMock)

    const response = await PATCH(
      new NextRequest("http://localhost:3000/api/backend/users/USER-123", {
        method: "PATCH",
        headers: { origin: "http://localhost:3000" },
      }),
      context(["users", "USER-123"]),
    )

    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it("rejects auth routes before creating a session or calling the backend", async () => {
    vi.stubEnv("BACKEND_INTERNAL_URL", "http://backend:8000/api/v1")
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    const response = await POST(
      new NextRequest("http://localhost:3000/api/backend/auth/login", { method: "POST" }),
      context(["auth", "login"]),
    )

    expect(response.status).toBe(404)
    expect(mocks.createSupabaseServerClient).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("forwards an allowed survey request without upstream cookies", async () => {
    vi.stubEnv("BACKEND_INTERNAL_URL", "http://backend:8000/api/v1")
    mocks.getClaims.mockResolvedValue({ data: { claims: { sub: "user-id" } } })
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: "access-token" } } })
    const fetchMock = vi.fn(async () =>
      new Response('{"data":[]}', {
        headers: { "content-type": "application/json", "set-cookie": "internal=value" },
      }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const response = await GET(
      new NextRequest("http://localhost:3000/api/backend/surveys/?limit=20"),
      context(["surveys"]),
    )

    expect(fetchMock).toHaveBeenCalledWith(
      "http://backend:8000/api/v1/surveys/?limit=20",
      expect.objectContaining({ method: "GET" }),
    )
    expect(response.headers.get("set-cookie")).toBeNull()
    expect(await response.text()).toBe('{"data":[]}')
  })

  it("normalizes collection routes to the backend trailing-slash form", async () => {
    vi.stubEnv("BACKEND_INTERNAL_URL", "http://backend:8000/api/v1")
    mocks.getClaims.mockResolvedValue({ data: { claims: { sub: "user-id" } } })
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: "access-token" } } })
    const fetchMock = vi.fn(async () => new Response('{"data":[]}'))
    vi.stubGlobal("fetch", fetchMock)

    await GET(
      new NextRequest("http://localhost:3000/api/backend/surveys?status=Active"),
      context(["surveys"]),
    )

    expect(fetchMock).toHaveBeenCalledWith(
      "http://backend:8000/api/v1/surveys/?status=Active",
      expect.objectContaining({ method: "GET" }),
    )
  })

  it("forwards export content headers but never forwards upstream cookies", async () => {
    vi.stubEnv("BACKEND_INTERNAL_URL", "http://backend:8000/api/v1")
    mocks.getClaims.mockResolvedValue({ data: { claims: { sub: "user-id" } } })
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: "access-token" } } })
    const fetchMock = vi.fn(async () => new Response("id,title\n1,Survey\n", {
      headers: {
        "content-type": "text/csv",
        "content-disposition": "attachment; filename=responses.csv",
        "cache-control": "no-store",
        "pragma": "no-cache",
        "x-content-type-options": "nosniff",
        "referrer-policy": "no-referrer",
        "x-request-id": "request-id",
        "set-cookie": "backend-session=secret",
      },
    }))
    vi.stubGlobal("fetch", fetchMock)

    const response = await GET(
      new NextRequest("http://localhost:3000/api/backend/surveys/survey-id/responses/export"),
      context(["surveys", "survey-id", "responses", "export"]),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toBe("text/csv")
    expect(response.headers.get("content-disposition")).toBe("attachment; filename=responses.csv")
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(response.headers.get("x-request-id")).toBe("request-id")
    expect(response.headers.get("set-cookie")).toBeNull()
    expect(await response.text()).toBe("id,title\n1,Survey\n")
  })

  it("forwards erasure bodies and idempotency keys from the trusted origin", async () => {
    vi.stubEnv("BACKEND_INTERNAL_URL", "http://backend:8000/api/v1")
    vi.stubEnv("APP_ORIGIN", "http://localhost:3000")
    mocks.getClaims.mockResolvedValue({ data: { claims: { sub: "user-id" } } })
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: "access-token" } } })
    const fetchMock = vi.fn(async () => new Response('{"data":{"erased_count":1}}'))
    vi.stubGlobal("fetch", fetchMock)
    const body = JSON.stringify({
      scope: "selected",
      response_ids: ["response-id"],
      confirmation: "ERASE_SELECTED_RESPONSES",
    })

    const response = await POST(
      new NextRequest("http://localhost:3000/api/backend/surveys/survey-id/responses/erase", {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          "content-type": "application/json",
          "idempotency-key": "erase-request-key",
        },
        body,
      }),
      context(["surveys", "survey-id", "responses", "erase"]),
    )

    expect(response.status).toBe(200)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const headers = new Headers(init.headers)
    expect(url).toBe("http://backend:8000/api/v1/surveys/survey-id/responses/erase")
    expect(headers.get("idempotency-key")).toBe("erase-request-key")
    expect(headers.get("authorization")).toBe("Bearer access-token")
    expect(await new Response(init.body).text()).toBe(body)
  })

  it("rejects erasure requests from an untrusted origin before forwarding them", async () => {
    vi.stubEnv("BACKEND_INTERNAL_URL", "http://backend:8000/api/v1")
    vi.stubEnv("APP_ORIGIN", "http://localhost:3000")
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    const response = await POST(
      new NextRequest("http://localhost:3000/api/backend/surveys/survey-id/responses/erase", {
        method: "POST",
        headers: {
          origin: "https://evil.example",
          "idempotency-key": "erase-request-key",
        },
        body: "{}",
      }),
      context(["surveys", "survey-id", "responses", "erase"]),
    )

    expect(response.status).toBe(403)
    expect(mocks.createSupabaseServerClient).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
