import { describe, expect, it } from "vitest"

import { formatBackendUtcTimestamp, parseBackendUtcTimestamp } from "./dates"

describe("backend UTC timestamps", () => {
  it("treats timezone-free backend values as UTC", () => {
    const value = "2026-09-14T13:22:23.347795"

    expect(parseBackendUtcTimestamp(value).toISOString()).toBe("2026-09-14T13:22:23.347Z")
    expect(formatBackendUtcTimestamp(value)).toBe(new Date(`${value}Z`).toLocaleString("en-US"))
  })

  it("preserves timestamps that already include an offset", () => {
    const value = "2026-09-14T13:22:23+08:00"

    expect(parseBackendUtcTimestamp(value).toISOString()).toBe("2026-09-14T05:22:23.000Z")
  })
})
