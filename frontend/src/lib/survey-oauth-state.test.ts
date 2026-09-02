import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import {
  createSurveyOAuthState,
  SURVEY_OAUTH_STATE_COOKIE,
  validateSurveyReturnPath,
  verifySurveyOAuthState,
} from "./survey-oauth-state"

describe("survey OAuth state", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("round-trips a tokenized survey return path without putting it in provider state", () => {
    vi.stubEnv("SURVEY_OAUTH_STATE_KEY", "a-test-signing-key")
    const state = createSurveyOAuthState("/survey/distribution-token", "flow-12345678", 1_000)

    expect(state).not.toContain("distribution-token")
    expect(verifySurveyOAuthState(state, 1_001)).toEqual({
      returnTo: "/survey/distribution-token",
      flowId: "flow-12345678",
      expiresAt: 601_000,
    })
    expect(SURVEY_OAUTH_STATE_COOKIE).toBe("peii-survey-oauth-state")
  })

  it("rejects tampered, expired, malformed, and unsafe state", () => {
    vi.stubEnv("SURVEY_OAUTH_STATE_KEY", "a-test-signing-key")
    const state = createSurveyOAuthState("/survey/distribution-token", "flow-12345678", 1_000)

    expect(verifySurveyOAuthState(`${state}tampered`, 1_001)).toBeNull()
    expect(verifySurveyOAuthState(state, 601_000)).toBeNull()
    expect(verifySurveyOAuthState("not-a-state", 1_001)).toBeNull()
    expect(validateSurveyReturnPath("https://evil.example/survey/token")).toBeNull()
    expect(validateSurveyReturnPath("/survey/token?next=https://evil.example")).toBeNull()
    expect(validateSurveyReturnPath("/survey/%2Fother")).toBeNull()
    expect(validateSurveyReturnPath("/researcher/dashboard")).toBeNull()
  })

  it("keeps concurrent PKCE flow IDs bound to their own signed return states", () => {
    vi.stubEnv("SURVEY_OAUTH_STATE_KEY", "a-test-signing-key")
    const first = createSurveyOAuthState("/survey/first-token", "flow-first123", 1_000)
    const second = createSurveyOAuthState("/survey/second-token", "flow-second", 1_000)

    expect(verifySurveyOAuthState(first, 1_001)).toMatchObject({
      returnTo: "/survey/first-token",
      flowId: "flow-first123",
    })
    expect(verifySurveyOAuthState(second, 1_001)).toMatchObject({
      returnTo: "/survey/second-token",
      flowId: "flow-second",
    })
  })
})
