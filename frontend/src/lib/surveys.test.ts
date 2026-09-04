import { afterEach, describe, expect, it, vi } from "vitest"

const mockApi = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  raw: { get: vi.fn() },
}))

vi.mock("@/lib/api", () => ({ api: mockApi }))

import {
  buildSurveyListQuery,
  createSurvey,
  createSurveyWithStructure,
  eraseResponses,
  exportResponses,
  fetchResponseAggregates,
  fetchResponses,
  fetchResponsesWithIdentity,
  mapSurvey,
  updateSurvey,
} from "./surveys"

describe("mapSurvey", () => {
  it("preserves a privacy-suppressed response count as null", () => {
    const survey = mapSurvey({
      id: "survey-uuid",
      survey_id: "SURV-001",
      title: "Alumni survey",
      description: null,
      status: "Active",
      target_cohort: null,
      retention_enabled: false,
      retention_days: 90,
      responses_count: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      is_deleted: false,
      deleted_at: null,
      performed_by: null,
    })

    expect(survey.responses).toBeNull()
    expect(survey.retentionEnabled).toBe(false)
    expect(survey.retentionDays).toBe(90)
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

describe("survey retention API operations", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("sends the backend retention defaults when creating a survey", async () => {
    mockApi.post.mockResolvedValue({ data: {
      id: "survey-id",
      survey_id: "SURV-001",
      title: "Alumni survey",
      status: "Inactive",
      target_cohort: null,
      description: null,
      retention_enabled: true,
      retention_days: 1825,
      responses_count: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      is_deleted: false,
      deleted_at: null,
      performed_by: null,
    } })

    await createSurvey({ title: "Alumni survey" })

    expect(mockApi.post).toHaveBeenCalledWith("/surveys/", {
      title: "Alumni survey",
      retention_enabled: true,
      retention_days: 1825,
    })
  })

  it("sends retention defaults for structured survey creation", async () => {
    mockApi.post.mockResolvedValue({ data: {
      id: "survey-id",
      survey_id: "SURV-001",
      title: "Alumni survey",
      status: "Inactive",
      target_cohort: null,
      description: null,
      retention_enabled: true,
      retention_days: 1825,
      responses_count: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      is_deleted: false,
      deleted_at: null,
      performed_by: null,
    } })

    await createSurveyWithStructure({ title: "Alumni survey", sections: [] })

    expect(mockApi.post).toHaveBeenCalledWith("/surveys/with-structure", {
      title: "Alumni survey",
      retention_enabled: true,
      retention_days: 1825,
      sections: [],
    })
  })

  it("forwards retention fields when updating a survey", async () => {
    mockApi.patch.mockResolvedValue({ data: {
      id: "survey-id",
      survey_id: "SURV-001",
      title: "Alumni survey",
      status: "Inactive",
      target_cohort: null,
      description: null,
      retention_enabled: false,
      retention_days: 90,
      responses_count: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      is_deleted: false,
      deleted_at: null,
      performed_by: null,
    } })

    await updateSurvey("survey-id", { retention_enabled: false, retention_days: 90 })

    expect(mockApi.patch).toHaveBeenCalledWith("/surveys/survey-id", {
      retention_enabled: false,
      retention_days: 90,
    })
  })
})

describe("response privacy API operations", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("uses the exact aggregate endpoint", async () => {
    mockApi.get.mockResolvedValue({ data: [] })

    await fetchResponseAggregates("survey-id")

    expect(mockApi.get).toHaveBeenCalledWith("/surveys/survey-id/responses/aggregates")
  })

  it("fetches one response page with serialized filters and pagination", async () => {
    mockApi.get.mockResolvedValue({
      data: [],
      meta: {
        pagination: {
          total: 125,
          count: 25,
          limit: 25,
          offset: 50,
          has_next: true,
          has_prev: true,
        },
      },
    })

    const result = await fetchResponses("survey-id", {
      limit: 25,
      offset: 50,
      sortBy: "created_at",
      sortOrder: "asc",
      submittedFrom: "2026-01-01T00:00:00Z",
      submittedBefore: "2026-02-01T00:00:00Z",
    })

    expect(mockApi.get).toHaveBeenCalledTimes(1)
    expect(mockApi.get).toHaveBeenCalledWith(
      "/surveys/survey-id/responses/?limit=25&offset=50&sort_by=created_at&sort_order=asc&submitted_from=2026-01-01T00%3A00%3A00Z&submitted_before=2026-02-01T00%3A00%3A00Z",
    )
    expect(result.pagination).toEqual({
      total: 125,
      count: 25,
      limit: 25,
      offset: 50,
      has_next: true,
      has_prev: true,
    })
  })

  it("keeps identity reads on a separate capability-gated endpoint and type", async () => {
    mockApi.get.mockResolvedValue({
      data: [{
        id: "response-id",
        survey_id: "survey-id",
        answers: {},
        created_at: "2026-01-01T00:00:00Z",
        provider: "google",
        email: "alumni@example.test",
        display_name: "Alumni Respondent",
        email_verified: true,
        identity_captured_at: "2026-01-01T00:00:00Z",
      }],
      meta: { pagination: { total: 1, count: 1, limit: 25, offset: 0, has_next: false, has_prev: false } },
    })

    const result = await fetchResponsesWithIdentity("survey-id")

    expect(mockApi.get).toHaveBeenCalledWith("/surveys/survey-id/responses/identity")
    expect(result.responses[0]).toMatchObject({ email: "alumni@example.test", displayName: "Alumni Respondent" })
    expect(result.responses[0]).not.toHaveProperty("authUserId")
    expect(result.responses[0]).not.toHaveProperty("respondentKeyDigest")
    expect("email" in ({} as import("./surveys").SurveyResponse)).toBe(false)
  })

  it("prepares an export and returns its signed download URL", async () => {
    mockApi.get.mockResolvedValue({
      data: {
        export_id: "e1",
        response_count: 1,
        answer_row_count: 1,
        download_url: "https://storage.example.test/x",
        expires_at: "2026-09-04T00:00:00",
        filename: "survey.csv",
      },
    })

    const result = await exportResponses("survey-id")

    expect(mockApi.get).toHaveBeenCalledWith("/surveys/survey-id/responses/export")
    expect(result.download_url).toBe("https://storage.example.test/x")
    expect(mockApi.raw.get).not.toHaveBeenCalled()
  })

  it("uses the exact erase endpoint and forwards the idempotency key", async () => {
    mockApi.post.mockResolvedValue({
      data: { scope: "selected", requested_count: 1, erased_count: 1 },
    })
    const payload = {
      scope: "selected" as const,
      response_ids: ["response-id"],
      confirmation: "ERASE_SELECTED_RESPONSES" as const,
    }

    await eraseResponses("survey-id", payload, "request-key")

    expect(mockApi.post).toHaveBeenCalledWith(
      "/surveys/survey-id/responses/erase",
      payload,
      { headers: { "Idempotency-Key": "request-key" } },
    )
  })
})
