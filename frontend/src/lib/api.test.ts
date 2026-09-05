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
})
