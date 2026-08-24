import { describe, expect, it } from "vitest"

import { getSurveyCapabilities, getSurveyResponseResourceId } from "./SurveyManagement"

describe("getSurveyCapabilities", () => {
  it("maps each survey capability to its exact permission", () => {
    expect(getSurveyCapabilities([
      "surveys.manage",
      "survey_distributions.manage",
      "survey_responses.read_aggregates",
      "survey_responses.export",
    ])).toEqual({
      manage: true,
      distributionManage: true,
      readAggregates: true,
      readRaw: false,
      export: true,
      erase: false,
    })
  })

  it("does not grant capabilities for near-match permissions", () => {
    expect(getSurveyCapabilities([
      "surveys.manage.any",
      "survey_distributions.manage.owner",
      "survey_responses.read_raw_member",
      "survey_responses.exported",
      "survey_responses.erase.owner",
    ])).toEqual({
      manage: false,
      distributionManage: false,
      readAggregates: false,
      readRaw: false,
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
