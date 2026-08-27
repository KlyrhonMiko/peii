import { describe, expect, it } from "vitest"

import { getSurveyRetentionState } from "./utils"

describe("getSurveyRetentionState", () => {
  it("uses the editor defaults for a new survey", () => {
    expect(getSurveyRetentionState()).toEqual({
      retentionEnabled: true,
      retentionDays: 1825,
    })
  })

  it("maps the server survey retention policy for editing", () => {
    expect(getSurveyRetentionState({ retentionEnabled: false, retentionDays: 90 })).toEqual({
      retentionEnabled: false,
      retentionDays: 90,
    })
  })
})
