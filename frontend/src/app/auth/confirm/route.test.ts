import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const verifyOtp = vi.fn()
  const createSupabaseServerClient = vi.fn(async () => ({ auth: { verifyOtp } }))
  return { createSupabaseServerClient, verifyOtp }
})

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: mocks.createSupabaseServerClient }))

import { GET } from "./route"

describe("GET /auth/confirm", () => {
  beforeEach(() => {
    mocks.verifyOtp.mockReset()
    mocks.createSupabaseServerClient.mockClear()
  })

  it("verifies a recovery token hash server-side before redirecting", async () => {
    mocks.verifyOtp.mockResolvedValue({ error: null })
    const request = new NextRequest(
      "http://localhost:3000/auth/confirm?token_hash=one-time-token&type=recovery&next=/reset-password",
    )

    const response = await GET(request)

    expect(mocks.verifyOtp).toHaveBeenCalledWith({ token_hash: "one-time-token", type: "recovery" })
    expect(response.headers.get("location")).toBe("http://localhost:3000/reset-password")
  })

  it("rejects a PKCE code without a token hash", async () => {
    const request = new NextRequest("http://localhost:3000/auth/confirm?code=pkce-code")

    const response = await GET(request)

    expect(mocks.createSupabaseServerClient).not.toHaveBeenCalled()
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/login?error=confirmation",
    )
  })
})
