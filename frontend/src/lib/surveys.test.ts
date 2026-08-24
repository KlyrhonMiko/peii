import { describe, expect, it } from "vitest"

import { buildSurveyListQuery, mapDistribution } from "./surveys"

describe("mapDistribution", () => {
  it("maps tokenless distribution metadata", () => {
    const distribution = mapDistribution({
      id: "distribution-id",
      survey_id: "survey-id",
      status: "active",
      is_active: true,
      expires_at: "2099-01-01T00:00:00Z",
      revoked_at: null,
      created_at: "2026-01-01T00:00:00Z",
    })

    expect(distribution).toEqual({
      id: "distribution-id",
      surveyId: "survey-id",
      status: "active",
      isActive: true,
      expiresAt: "2099-01-01T00:00:00Z",
      revokedAt: null,
      createdAt: "2026-01-01T00:00:00Z",
    })
    expect("token" in distribution).toBe(false)
  })
})

describe("buildSurveyListQuery", () => {
  it("serializes supported survey list filters", () => {
    expect(buildSurveyListQuery({
      includeArchived: true,
      search: "alumni survey",
      status: "Active",
      targetCohort: "Class of 2024",
      sortBy: "responses_count",
      sortOrder: "desc",
      limit: 20,
      offset: 40,
    })).toBe(
      "?include_deleted=true&search=alumni+survey&status=Active&target_cohort=Class+of+2024&sort_by=responses_count&sort_order=desc&limit=20&offset=40",
    )
  })
})
