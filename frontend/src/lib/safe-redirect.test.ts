import { afterEach, describe, expect, it, vi } from "vitest"

import { safeInternalPath, safeMfaReturnTo } from "./safe-redirect"

describe("safeInternalPath", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("preserves a local destination", () => {
    vi.stubEnv("APP_ORIGIN", "https://peii.example.gov.ph")

    expect(safeInternalPath("/reset-password?source=email")).toBe("/reset-password?source=email")
  })

  it.each(["//evil.example", "/\\evil.example", "https://evil.example"])(
    "falls back for an external destination: %s",
    (value) => {
      vi.stubEnv("APP_ORIGIN", "https://peii.example.gov.ph")

      expect(safeInternalPath(value)).toBe("/researcher/dashboard")
    },
  )
})

describe("safeMfaReturnTo", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it.each(["/mfa/verify", "/mfa/verify?returnTo=%2Fmfa%2Fverify"])(
    "replaces a self-referential challenge destination: %s",
    (value) => {
      vi.stubEnv("APP_ORIGIN", "https://peii.example.gov.ph")

      expect(safeMfaReturnTo(value)).toBe("/researcher/dashboard")
    },
  )

  it("preserves a different safe portal destination", () => {
    vi.stubEnv("APP_ORIGIN", "https://peii.example.gov.ph")

    expect(safeMfaReturnTo("/settings")).toBe("/settings")
  })
})
