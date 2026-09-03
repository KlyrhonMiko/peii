import { describe, expect, it } from "vitest"

import {
  buildEraseAllResponsesPayload,
  canSortSurveysByResponseCount,
  formatSurveyResponseCount,
  getSurveyCapabilities,
  getSurveyResponseResourceId,
} from "./SurveyManagement"

describe("survey response count privacy helpers", () => {
  it("labels suppressed counts for aggregate-capable users", () => {
    expect(formatSurveyResponseCount(null, true)).toBe("Suppressed")
  })

  it("labels unavailable counts for users without aggregate access", () => {
    expect(formatSurveyResponseCount(null, false)).toBe("Unavailable")
  })

  it("does not expose response sorting without an exact-count capability", () => {
    expect(canSortSurveysByResponseCount({ readRaw: false, export: false, erase: false })).toBe(false)
    expect(canSortSurveysByResponseCount({ readRaw: true, export: false, erase: false })).toBe(true)
    expect(canSortSurveysByResponseCount({ readRaw: false, export: true, erase: false })).toBe(true)
    expect(canSortSurveysByResponseCount({ readRaw: false, export: false, erase: true })).toBe(true)
  })

  it("does not create an erase-all payload from a suppressed count", () => {
    expect(buildEraseAllResponsesPayload(null)).toBeNull()
    expect(buildEraseAllResponsesPayload(5)).toEqual({
      scope: "all",
      expected_response_count: 5,
      confirmation: "ERASE_ALL_RESPONSES",
    })
  })
})

describe("getSurveyCapabilities", () => {
  it.each([
    { hasPermission: false, csvExportEnabled: false, expectedExport: false },
    { hasPermission: false, csvExportEnabled: true, expectedExport: false },
    { hasPermission: true, csvExportEnabled: false, expectedExport: false },
    { hasPermission: true, csvExportEnabled: true, expectedExport: true },
  ])(
    "enables export only when permission and CSV export feature flag are enabled",
    ({ hasPermission, csvExportEnabled, expectedExport }) => {
      const permissions = hasPermission ? ["survey_responses.export"] : []

      expect(getSurveyCapabilities(permissions, csvExportEnabled).export).toBe(expectedExport)
    },
  )

  it("allows a read-only user to reveal archived survey rows without management", () => {
    expect(getSurveyCapabilities(["surveys.read", "survey_responses.erase"], false)).toMatchObject({
      read: true,
      manage: false,
      erase: true,
    })
  })

  it("maps each survey capability to its exact permission", () => {
    expect(getSurveyCapabilities([
      "surveys.read",
      "surveys.manage",
      "survey_responses.read_aggregates",
      "survey_responses.read_raw",
      "survey_responses.read_identity",
      "survey_responses.export",
    ], true)).toEqual({
      read: true,
      manage: true,
      readAggregates: true,
       readRaw: true,
       readIdentity: true,
      export: true,
      erase: false,
    })
  })

  it("does not grant capabilities for near-match permissions", () => {
    expect(getSurveyCapabilities([
      "surveys.manage.any",
      "survey_responses.read_raw.extra",
      "survey_responses.exported",
      "survey_responses.erase.extra",
    ], true)).toEqual({
      read: false,
      manage: false,
       readAggregates: false,
       readRaw: false,
       readIdentity: false,
       export: false,
      erase: false,
    })
  })
})

describe("getSurveyResponseResourceId", () => {
  it("uses the UUID instead of the human-readable survey ID for nested response routes", () => {
    expect(getSurveyResponseResourceId({
      id: "01a034ce-a0ad-7fa1-bb0f-4518b10f39cc",
      surveyId: "SURV-GP241P",
    })).toBe("01a034ce-a0ad-7fa1-bb0f-4518b10f39cc")
  })
})
