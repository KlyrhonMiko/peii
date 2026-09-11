import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const verifyOtp = vi.fn()
  const getClaims = vi.fn()
  const signOut = vi.fn()
  const createSupabaseServerClient = vi.fn(async () => ({ auth: { getClaims, signOut, verifyOtp } }))
  return { createSupabaseServerClient, getClaims, signOut, verifyOtp }
})

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: mocks.createSupabaseServerClient }))

import { GET } from "./route"

describe("GET /auth/confirm", () => {
  beforeEach(() => {
    vi.stubEnv("APP_ORIGIN", "http://localhost:3000")
    mocks.verifyOtp.mockReset()
    mocks.getClaims.mockReset()
    mocks.signOut.mockReset()
    mocks.createSupabaseServerClient.mockClear()
    vi.stubEnv("PASSWORD_RESET_GRANT_SECRET", "0123456789abcdef0123456789abcdef")
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("verifies a recovery token hash server-side before redirecting", async () => {
    mocks.verifyOtp.mockResolvedValue({ data: { session: { access_token: "recovery-token" } }, error: null })
    mocks.getClaims.mockResolvedValue({
      data: { claims: { session_id: "123e4567-e89b-42d3-a456-426614174000", sub: "123e4567-e89b-42d3-a456-426614174001" } },
      error: null,
    })
    const request = new NextRequest(
      "http://localhost:3000/auth/confirm?token_hash=one-time-token&type=recovery&next=/reset-password",
    )

    const response = await GET(request)

    expect(mocks.verifyOtp).toHaveBeenCalledWith({ token_hash: "one-time-token", type: "recovery" })
    expect(mocks.getClaims).toHaveBeenCalledWith("recovery-token")
    expect(response.headers.get("location")).toBe("http://localhost:3000/reset-password")
    expect(response.cookies.get("peii_password_reset_grant")?.value).toContain(".")
  })

  it("rejects a PKCE code without a token hash", async () => {
    const request = new NextRequest("http://localhost:3000/auth/confirm?code=pkce-code")

    const response = await GET(request)

    expect(mocks.createSupabaseServerClient).not.toHaveBeenCalled()
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/login?error=confirmation",
    )
  })

  it("rejects a backslash-based external destination", async () => {
    mocks.verifyOtp.mockResolvedValue({ data: { session: { access_token: "recovery-token" } }, error: null })
    mocks.getClaims.mockResolvedValue({
      data: { claims: { session_id: "123e4567-e89b-42d3-a456-426614174000", sub: "123e4567-e89b-42d3-a456-426614174001" } },
      error: null,
    })
    const request = new NextRequest(
      "http://attacker.example/auth/confirm?token_hash=one-time-token&type=recovery&next=/%5Cevil.example",
    )

    const response = await GET(request)

    expect(response.headers.get("location")).toBe("http://localhost:3000/reset-password")
  })

  it("does not issue a grant when verified claims are unavailable", async () => {
    mocks.verifyOtp.mockResolvedValue({ data: { session: { access_token: "recovery-token" } }, error: null })
    mocks.getClaims.mockResolvedValue({ data: { claims: null }, error: null })
    mocks.signOut.mockResolvedValue({ error: null })

    const response = await GET(new NextRequest("http://localhost:3000/auth/confirm?token_hash=one-time-token&type=invite"))

    expect(response.headers.get("location")).toBe("http://localhost:3000/login?error=confirmation")
    expect(response.cookies.get("peii_password_reset_grant")).toBeUndefined()
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" })
  })

  it("clears the verified OTP session when reset-grant issuance fails", async () => {
    mocks.verifyOtp.mockResolvedValue({ data: { session: { access_token: "recovery-token" } }, error: null })
    mocks.getClaims.mockResolvedValue({
      data: { claims: { session_id: "123e4567-e89b-42d3-a456-426614174000", sub: "123e4567-e89b-42d3-a456-426614174001" } },
      error: null,
    })
    mocks.signOut.mockResolvedValue({ error: null })
    vi.stubEnv("PASSWORD_RESET_GRANT_SECRET", "replace_with_a_dedicated_random_32_byte_value")

    const response = await GET(new NextRequest("http://localhost:3000/auth/confirm?token_hash=one-time-token&type=recovery"))

    expect(response.headers.get("location")).toBe("http://localhost:3000/login?error=confirmation")
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" })
  })
})
