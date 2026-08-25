import { beforeEach, describe, expect, it, vi } from "vitest"

const redirect = vi.hoisted(() =>
  vi.fn((destination: string): never => {
    throw new Error(`REDIRECT:${destination}`)
  }),
)

vi.mock("next/navigation", () => ({ redirect }))

import { requestPasswordRecoveryAction } from "./actions"

function recoveryForm() {
  const formData = new FormData()
  formData.set("email", "user@example.com")
  return formData
}

function response(status: number, headers?: HeadersInit) {
  return new Response(null, headers === undefined ? { status } : { status, headers })
}

describe("requestPasswordRecoveryAction", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubEnv("BACKEND_INTERNAL_URL", "http://backend.test")
    redirect.mockClear()
  })

  it("does not present rate limiting as successful delivery", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(429, { "Retry-After": "45" })))

    await expect(requestPasswordRecoveryAction(recoveryForm())).rejects.toThrow(
      "REDIRECT:/forgot-password?error=retry-later&retryAfter=45",
    )
  })

  it("does not present temporary unavailability as successful delivery", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(503)))

    await expect(requestPasswordRecoveryAction(recoveryForm())).rejects.toThrow(
      "REDIRECT:/forgot-password?error=retry-later",
    )
  })

  it("does not present provider failures as successful delivery", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(502)))

    await expect(requestPasswordRecoveryAction(recoveryForm())).rejects.toThrow(
      "REDIRECT:/forgot-password?error=retry-later",
    )
  })
})
