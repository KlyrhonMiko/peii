import { beforeEach, describe, expect, it, vi } from "vitest"

const FACTOR_ID = "11111111-1111-4111-8111-111111111111"
const mocks = vi.hoisted(() => {
  const redirect = vi.fn((destination: string): never => {
    throw new Error(`REDIRECT:${destination}`)
  })
  const requirePortalUser = vi.fn()
  const getPortalMfaChallenge = vi.fn()
  const getSession = vi.fn()
  const refreshSession = vi.fn()
  const enroll = vi.fn()
  const challenge = vi.fn()
  const verify = vi.fn()
  const unenroll = vi.fn()
  const listFactors = vi.fn()
  const getAuthenticatorAssuranceLevel = vi.fn()
  const createSupabaseServerClient = vi.fn(async () => ({
    auth: {
      getSession,
      mfa: { challenge, enroll, getAuthenticatorAssuranceLevel, listFactors, unenroll, verify },
      refreshSession,
    },
  }))
  return {
    challenge,
    createSupabaseServerClient,
    enroll,
    getAuthenticatorAssuranceLevel,
    getPortalMfaChallenge,
    getSession,
    listFactors,
    redirect,
    refreshSession,
    requirePortalUser,
    unenroll,
    verify,
  }
})

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/auth", () => ({
  getPortalMfaChallenge: mocks.getPortalMfaChallenge,
  requirePortalUser: mocks.requirePortalUser,
}))
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: mocks.createSupabaseServerClient }))

import {
  enrollTotpAction,
  unenrollTotpAction,
  verifyMfaChallengeAction,
  verifyTotpEnrollmentAction,
  type MfaActionState,
} from "./actions"

const initial: MfaActionState = { status: "idle", message: "" }

function form(values: Record<string, string>): FormData {
  const formData = new FormData()
  for (const [key, value] of Object.entries(values)) formData.set(key, value)
  return formData
}

describe("MFA server actions", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubEnv("APP_ORIGIN", "http://localhost:3000")
    mocks.redirect.mockClear()
    mocks.requirePortalUser.mockReset()
    mocks.requirePortalUser.mockResolvedValue({ id: "self" })
    mocks.getPortalMfaChallenge.mockReset()
    mocks.getPortalMfaChallenge.mockResolvedValue({ factors: [], currentLevel: "aal1", nextLevel: "aal2" })
    mocks.getSession.mockReset()
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: "access" } } })
    mocks.refreshSession.mockReset()
    mocks.refreshSession.mockResolvedValue({ data: { session: { access_token: "refreshed" } }, error: null })
    mocks.enroll.mockReset()
    mocks.challenge.mockReset()
    mocks.verify.mockReset()
    mocks.unenroll.mockReset()
    mocks.listFactors.mockReset()
    mocks.listFactors.mockResolvedValue({
      data: { all: [], phone: [], totp: [], webauthn: [] },
      error: null,
    })
    mocks.getAuthenticatorAssuranceLevel.mockReset()
    mocks.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal2", nextLevel: "aal2" },
      error: null,
    })
  })

  it("returns QR and fallback setup data only from an authenticated enrollment action", async () => {
    mocks.enroll.mockResolvedValue({
      data: {
        id: FACTOR_ID,
        type: "totp",
        totp: {
          qr_code: "data:image/svg+xml;utf-8,%3Csvg%3E%3C/svg%3E",
          secret: "setup-secret",
          uri: "otpauth://totp/PEII?secret=setup-secret",
        },
      },
      error: null,
    })

    await expect(enrollTotpAction(initial, form({ friendly_name: "Laptop authenticator" }))).resolves.toEqual({
      status: "success",
      message: "Scan the QR code, or enter the setup key, then verify a six-digit code.",
      enrollment: {
        factorId: FACTOR_ID,
        friendlyName: "Laptop authenticator",
        qrCode: "data:image/svg+xml;utf-8,%3Csvg%3E%3C/svg%3E",
        secret: "setup-secret",
      },
    })
    expect(mocks.requirePortalUser).toHaveBeenCalledWith("portal.access", "/settings")
    expect(mocks.listFactors).toHaveBeenCalled()
    expect(mocks.enroll).toHaveBeenCalledWith({ factorType: "totp", friendlyName: "Laptop authenticator" })
  })

  it("encodes Supabase's raw SVG QR data before sending it to the image component", async () => {
    const rawSvg = '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>\n'
    mocks.enroll.mockResolvedValue({
      data: {
        id: FACTOR_ID,
        type: "totp",
        totp: { qr_code: `data:image/svg+xml;utf-8,${rawSvg}`, secret: "setup-secret" },
      },
      error: null,
    })

    const result = await enrollTotpAction(initial, form({ friendly_name: "Laptop authenticator" }))

    expect(result.status).toBe("success")
    expect(result.enrollment?.qrCode).toBe(
      `data:image/svg+xml;charset=utf-8,${encodeURIComponent(rawSvg.trim())}`,
    )
  })

  it("discards an unfinished factor before starting a replacement setup", async () => {
    mocks.listFactors.mockResolvedValue({
      data: {
        all: [{ id: FACTOR_ID, factor_type: "totp", status: "unverified" }],
        phone: [],
        totp: [],
        webauthn: [],
      },
      error: null,
    })
    mocks.unenroll.mockResolvedValue({ data: { id: FACTOR_ID }, error: null })
    mocks.enroll.mockResolvedValue({
      data: {
        id: "22222222-2222-4222-8222-222222222222",
        type: "totp",
        totp: { qr_code: "data:image/svg+xml;utf-8,%3Csvg%3E%3C/svg%3E", secret: "replacement" },
      },
      error: null,
    })

    const result = await enrollTotpAction(initial, form({ friendly_name: "Replacement" }))

    expect(result.status).toBe("success")
    expect(mocks.unenroll).toHaveBeenCalledWith({ factorId: FACTOR_ID })
    expect(mocks.unenroll.mock.invocationCallOrder[0]).toBeLessThan(mocks.enroll.mock.invocationCallOrder[0] ?? 0)
  })

  it("cancels only an unverified factor and clears the setup response", async () => {
    mocks.listFactors.mockResolvedValue({
      data: {
        all: [{ id: FACTOR_ID, factor_type: "totp", status: "unverified" }],
        phone: [],
        totp: [],
        webauthn: [],
      },
      error: null,
    })
    mocks.unenroll.mockResolvedValue({ data: { id: FACTOR_ID }, error: null })

    await expect(enrollTotpAction(initial, form({ intent: "cancel", factor_id: FACTOR_ID }))).resolves.toEqual(initial)
    expect(mocks.unenroll).toHaveBeenCalledWith({ factorId: FACTOR_ID })
    expect(mocks.enroll).not.toHaveBeenCalled()
  })

  it("will not cancel a verified factor through the setup action", async () => {
    mocks.listFactors.mockResolvedValue({
      data: {
        all: [{ id: FACTOR_ID, factor_type: "totp", status: "verified" }],
        phone: [],
        totp: [{ id: FACTOR_ID, factor_type: "totp", status: "verified" }],
        webauthn: [],
      },
      error: null,
    })

    const result = await enrollTotpAction(initial, form({ intent: "cancel", factor_id: FACTOR_ID }))

    expect(result.status).toBe("error")
    expect(mocks.unenroll).not.toHaveBeenCalled()
  })

  it("does not start enrollment for an invalid name", async () => {
    await expect(enrollTotpAction(initial, form({ friendly_name: "   " }))).resolves.toEqual({
      status: "error",
      message: "Enter a name for this authenticator.",
    })
    expect(mocks.requirePortalUser).not.toHaveBeenCalled()
    expect(mocks.enroll).not.toHaveBeenCalled()
  })

  it("challenges and verifies a six-digit code for a newly enrolled factor", async () => {
    mocks.challenge.mockResolvedValue({ data: { id: "challenge-1" }, error: null })
    mocks.verify.mockResolvedValue({ data: { access_token: "new-access" }, error: null })

    await expect(verifyTotpEnrollmentAction(initial, form({ factor_id: FACTOR_ID, code: "123456" }))).resolves.toMatchObject({
      status: "success",
    })
    expect(mocks.challenge).toHaveBeenCalledWith({ factorId: FACTOR_ID })
    expect(mocks.verify).toHaveBeenCalledWith({ factorId: FACTOR_ID, challengeId: "challenge-1", code: "123456" })
    expect(mocks.getAuthenticatorAssuranceLevel).toHaveBeenCalledWith("new-access")
  })

  it("does not report enrollment success when the provider leaves the session at AAL1", async () => {
    mocks.challenge.mockResolvedValue({ data: { id: "challenge-1" }, error: null })
    mocks.verify.mockResolvedValue({ data: { access_token: "aal1-access" }, error: null })
    mocks.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal2" },
      error: null,
    })

    await expect(verifyTotpEnrollmentAction(initial, form({ factor_id: FACTOR_ID, code: "123456" }))).resolves.toEqual({
      status: "error",
      message: "The authenticator was not fully verified. Please try again.",
    })
  })

  it("rejects malformed verification codes before contacting Supabase", async () => {
    await expect(verifyTotpEnrollmentAction(initial, form({ factor_id: FACTOR_ID, code: "12345x" }))).resolves.toEqual({
      status: "error",
      message: "Enter the six-digit code from your authenticator app.",
    })
    expect(mocks.challenge).not.toHaveBeenCalled()
    expect(mocks.verify).not.toHaveBeenCalled()
  })

  it("requires AAL2 before allowing a verified factor to be removed", async () => {
    mocks.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal2" },
      error: null,
    })

    await expect(unenrollTotpAction(initial, form({ factor_id: FACTOR_ID }))).resolves.toEqual({
      status: "error",
      message: "Verify your authenticator code before removing it.",
    })
    expect(mocks.unenroll).not.toHaveBeenCalled()
  })

  it("removes only a verified TOTP factor after an AAL2 check", async () => {
    mocks.listFactors.mockResolvedValue({
      data: {
        all: [],
        phone: [],
        webauthn: [],
        totp: [{ id: FACTOR_ID, factor_type: "totp", status: "verified" }],
      },
      error: null,
    })
    mocks.unenroll.mockResolvedValue({ data: { id: FACTOR_ID }, error: null })

    await expect(unenrollTotpAction(initial, form({ factor_id: FACTOR_ID }))).resolves.toMatchObject({
      status: "success",
    })
    expect(mocks.getAuthenticatorAssuranceLevel).toHaveBeenCalledWith("access")
    expect(mocks.unenroll).toHaveBeenCalledWith({ factorId: FACTOR_ID })
    expect(mocks.refreshSession).toHaveBeenCalled()
  })

  it("reports a safe recovery path when the post-removal session refresh fails", async () => {
    mocks.listFactors.mockResolvedValue({
      data: {
        all: [],
        phone: [],
        webauthn: [],
        totp: [{ id: FACTOR_ID, factor_type: "totp", status: "verified" }],
      },
      error: null,
    })
    mocks.unenroll.mockResolvedValue({ data: { id: FACTOR_ID }, error: null })
    mocks.refreshSession.mockResolvedValue({ data: { session: null }, error: new Error("refresh failed") })

    await expect(unenrollTotpAction(initial, form({ factor_id: FACTOR_ID }))).resolves.toEqual({
      status: "error",
      message: "The authenticator was removed, but the session could not be refreshed. Sign in again.",
    })
  })

  it("verifies a selected sign-in factor and uses a safe internal return path", async () => {
    mocks.getPortalMfaChallenge.mockResolvedValue({ factors: [], currentLevel: "aal1", nextLevel: "aal2" })
    mocks.listFactors.mockResolvedValue({
      data: {
        all: [],
        phone: [],
        webauthn: [],
        totp: [{ id: FACTOR_ID, factor_type: "totp", status: "verified" }],
      },
      error: null,
    })
    mocks.challenge.mockResolvedValue({ data: { id: "challenge-2" }, error: null })
    mocks.verify.mockResolvedValue({ data: { access_token: "new-access" }, error: null })

    await expect(verifyMfaChallengeAction(initial, form({ factor_id: FACTOR_ID, code: "654321", returnTo: "https://evil.example/" }))).rejects.toThrow(
      "REDIRECT:/researcher/dashboard",
    )
    expect(mocks.getPortalMfaChallenge).toHaveBeenCalled()
    expect(mocks.verify).toHaveBeenCalledWith({ factorId: FACTOR_ID, challengeId: "challenge-2", code: "654321" })
    expect(mocks.getAuthenticatorAssuranceLevel).toHaveBeenCalledWith("new-access")
  })

  it("does not challenge a malformed sign-in factor or code", async () => {
    await expect(verifyMfaChallengeAction(initial, form({ factor_id: "not-a-factor", code: "1234", returnTo: "/settings" }))).resolves.toEqual({
      status: "error",
      message: "Enter the six-digit code from your authenticator app.",
    })
    expect(mocks.getPortalMfaChallenge).not.toHaveBeenCalled()
    expect(mocks.challenge).not.toHaveBeenCalled()
  })
})
