import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const FACTOR_ID = "11111111-1111-4111-8111-111111111111"
const mocks = vi.hoisted(() => ({
  getPortalMfaChallenge: vi.fn(),
  redirect: vi.fn((destination: string): never => {
    throw new Error(`REDIRECT:${destination}`)
  }),
}))

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }))
vi.mock("@/lib/auth", () => ({ getPortalMfaChallenge: mocks.getPortalMfaChallenge }))
vi.mock("@/app/login/actions", () => ({ logoutAction: vi.fn() }))
vi.mock("@/components/MfaVerifyForm", () => ({
  MfaVerifyForm: ({ factors, returnTo }: { factors: Array<{ friendlyName: string }>; returnTo: string }) => (
    <div data-testid="mfa-form">{factors.map((factor) => factor.friendlyName).join(",")}|{returnTo}</div>
  ),
}))

import MfaVerifyPage from "./page"

const factor = {
  id: FACTOR_ID,
  friendlyName: "Laptop authenticator",
  createdAt: "2026-09-17T00:00:00Z",
  updatedAt: "2026-09-17T00:00:00Z",
}

describe("MFA verification page", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubEnv("APP_ORIGIN", "http://localhost:3000")
    mocks.redirect.mockClear()
    mocks.getPortalMfaChallenge.mockReset()
    mocks.getPortalMfaChallenge.mockResolvedValue({
      factors: [factor],
      currentLevel: "aal1",
      nextLevel: "aal2",
    })
  })

  it("passes a safe return path and available verified factors to the form", async () => {
    render(await MfaVerifyPage({ searchParams: Promise.resolve({ returnTo: "/settings?tab=security" }) }))

    expect(screen.getByTestId("mfa-form")).toHaveTextContent("Laptop authenticator|/settings?tab=security")
  })

  it("does not loop when MFA is required but no supported TOTP factor is available", async () => {
    mocks.getPortalMfaChallenge.mockResolvedValue({ factors: [], currentLevel: "aal1", nextLevel: "aal2" })

    render(await MfaVerifyPage({ searchParams: Promise.resolve({ returnTo: "/settings" }) }))

    expect(screen.getByText("Additional verification unavailable")).toBeInTheDocument()
    expect(mocks.redirect).not.toHaveBeenCalled()
  })

  it("returns an already-verified session to the safe destination", async () => {
    mocks.getPortalMfaChallenge.mockResolvedValue({ factors: [factor], currentLevel: "aal2", nextLevel: "aal2" })

    await expect(MfaVerifyPage({ searchParams: Promise.resolve({ returnTo: "/settings" }) })).rejects.toThrow("REDIRECT:/settings")
  })

  it("returns to the destination when no second factor is required", async () => {
    mocks.getPortalMfaChallenge.mockResolvedValue({ factors: [], currentLevel: "aal1", nextLevel: "aal1" })

    await expect(MfaVerifyPage({ searchParams: Promise.resolve({ returnTo: "/settings" }) })).rejects.toThrow("REDIRECT:/settings")
  })
})
