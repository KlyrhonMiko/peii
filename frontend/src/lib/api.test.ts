import { beforeEach, describe, expect, it, vi } from "vitest"

import { api } from "./api"

describe("api requests", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("prepares an export through the same-origin proxy", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: { download_url: "https://storage.example.test/x" },
        message: "Export prepared.",
        errors: null,
        meta: { request_id: "req-1" },
      }),
    })
    vi.stubGlobal("fetch", fetchMock)

    const result = await api.get<{ download_url: string }>("/surveys/survey-id/responses/export")

    expect(result.data?.download_url).toBe("https://storage.example.test/x")
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("/api/backend/surveys/survey-id/responses/export")
    expect(init.method).toBe("GET")
  })

  it("propagates caller cancellation instead of reporting a timeout", async () => {
    const fetchMock = vi.fn((_url: string, init: RequestInit) => new Promise((_, reject) => {
      init.signal?.addEventListener("abort", () => {
        reject(new DOMException("Cancelled", "AbortError"))
      })
    }))
    vi.stubGlobal("fetch", fetchMock)
    const controller = new AbortController()

    const pending = api.get("/surveys/", { signal: controller.signal, timeout: 10_000 })
    controller.abort()

    await expect(pending).rejects.toMatchObject({ name: "AbortError" })
  })

  it("passes text bodies through raw requests without JSON quoting", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    vi.stubGlobal("fetch", fetchMock)

    await api.raw.post("/surveys/survey-id/responses/import", "submitted_at,q-1\n", {
      headers: { "Content-Type": "text/csv; charset=utf-8" },
    })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.body).toBe("submitted_at,q-1\n")
    expect(init.headers).toEqual({ "Content-Type": "text/csv; charset=utf-8" })
  })
})
