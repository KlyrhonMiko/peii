import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const redirect = vi.fn((destination: string): never => {
    throw new Error(`REDIRECT:${destination}`)
  })
  const cookieStore = { get: vi.fn(), set: vi.fn() }
  const cookies = vi.fn(async () => cookieStore)
  const getSession = vi.fn()
  const signOut = vi.fn()
  const createSupabaseServerClient = vi.fn(async () => ({ auth: { getSession, signOut } }))
  return { cookieStore, cookies, createSupabaseServerClient, getSession, redirect, signOut }
})

vi.mock("next/headers", () => ({ cookies: mocks.cookies }))
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }))
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: mocks.createSupabaseServerClient }))

import { resetPasswordAction } from "./actions"
import { issuePasswordResetGrant } from "@/lib/password-reset-grant"

function form() {
  const value = new FormData()
  value.set("password", "a secure password")
  value.set("confirmation", "a secure password")
  return value
}

describe("resetPasswordAction", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubEnv("BACKEND_INTERNAL_URL", "http://backend.test")
    vi.stubEnv("PASSWORD_RESET_GRANT_SECRET", "0123456789abcdef0123456789abcdef")
    mocks.cookieStore.get.mockReturnValue({
      value: issuePasswordResetGrant(
        "123e4567-e89b-42d3-a456-426614174001",
        "123e4567-e89b-42d3-a456-426614174000",
        "recovery",
      ),
    })
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: "recovery-session" } } })
    mocks.signOut.mockResolvedValue({ error: null })
  })

  it("uses the dedicated reset endpoint, then clears recovery authority with local-only sign-out", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    await expect(resetPasswordAction(form())).rejects.toThrow("REDIRECT:/login?password=reset")

    expect(fetchMock).toHaveBeenCalledWith(
      "http://backend.test/auth/password/reset",
      expect.objectContaining({ body: expect.stringContaining('"grant"') }),
    )
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" })
    expect(mocks.cookieStore.set).toHaveBeenCalledWith(
      "peii_password_reset_grant",
      "",
      expect.objectContaining({ maxAge: 0, path: "/reset-password" }),
    )
  })

  it.each([
    ["backend failure", () => Promise.resolve(new Response(null, { status: 502 }))],
    ["transport failure", () => Promise.reject(new Error("network unavailable"))],
  ])("clears local authority after a %s without reporting reset success", async (_label, fetchResult) => {
    vi.stubGlobal("fetch", vi.fn(fetchResult))

    await expect(resetPasswordAction(form())).rejects.toThrow("REDIRECT:/login?error=reset-retry")

    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" })
    expect(mocks.cookieStore.set).toHaveBeenCalledWith(
      "peii_password_reset_grant",
      "",
      expect.objectContaining({ maxAge: 0, path: "/reset-password" }),
    )
  })

  it("does not report reset success when local cleanup returns an error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })))
    mocks.signOut.mockResolvedValue({ error: new Error("cleanup failed") })

    await expect(resetPasswordAction(form())).rejects.toThrow("REDIRECT:/login?error=reset-retry")

    expect(mocks.cookieStore.set).toHaveBeenCalledWith(
      "peii_password_reset_grant",
      "",
      expect.objectContaining({ maxAge: 0, path: "/reset-password" }),
    )
  })
})
