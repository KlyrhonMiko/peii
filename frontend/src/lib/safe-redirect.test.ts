import { afterEach, describe, expect, it, vi } from "vitest"

import { safeInternalPath } from "./safe-redirect"

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
