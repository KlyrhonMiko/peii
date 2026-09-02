import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  createServerClient: vi.fn(),
}))

vi.mock("next/headers", () => ({ cookies: mocks.cookies }))
vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.createServerClient }))

import {
  createSurveySupabaseServerClient,
  surveySupabaseCookieOptions,
} from "./survey-server"

describe("survey Supabase SSR client", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  it("uses an isolated secure HttpOnly cookie namespace and the anonymous server key", async () => {
    vi.stubEnv("SUPABASE_URL", "https://project.supabase.co")
    vi.stubEnv("SUPABASE_ANON_KEY", "anon-key")
    const cookieStore = { getAll: vi.fn(() => []), set: vi.fn() }
    mocks.cookies.mockResolvedValue(cookieStore)
    mocks.createServerClient.mockReturnValue({})

    await createSurveySupabaseServerClient()

    expect(mocks.createServerClient).toHaveBeenCalledWith(
      "https://project.supabase.co",
      "anon-key",
      expect.objectContaining({
        cookieOptions: surveySupabaseCookieOptions,
         auth: { flowType: "pkce", detectSessionInUrl: false },
      }),
    )
    expect(surveySupabaseCookieOptions).toMatchObject({
      name: "peii-survey-auth-token",
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    })
    expect(surveySupabaseCookieOptions.name).not.toBe("sb-auth-token")
  })
})
