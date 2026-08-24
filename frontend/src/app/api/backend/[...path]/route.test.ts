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
})
