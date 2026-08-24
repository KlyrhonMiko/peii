import { afterEach, describe, expect, it, vi } from "vitest"

const mockApi = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  raw: { get: vi.fn() },
}))

vi.mock("@/lib/api", () => ({ api: mockApi }))

import {
  buildSurveyListQuery,
  createDistribution,
  eraseResponses,
  exportResponses,
  fetchResponseAggregates,
  mapDistribution,
  rotateDistribution,
} from "./surveys"

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

describe("distribution API operations", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  it("sends an explicit expiry when creating a distribution", async () => {
    mockApi.post.mockResolvedValue({
      data: {
        id: "distribution-id",
        survey_id: "survey-id",
        status: "active",
        is_active: true,
        expires_at: "2030-01-02T03:04:05.000Z",
        revoked_at: null,
        created_at: "2026-01-01T00:00:00Z",
        token: "one-time-token",
      },
    })

    await createDistribution("survey-id", "2030-01-02T03:04:05.000Z")

    expect(mockApi.post).toHaveBeenCalledWith(
      "/surveys/survey-id/distributions/",
      { expires_at: "2030-01-02T03:04:05.000Z" },
    )
  })

  it("sends an explicit expiry when rotating a distribution", async () => {
    mockApi.post.mockResolvedValue({
      data: {
        id: "replacement-id",
        survey_id: "survey-id",
        status: "active",
        is_active: true,
        expires_at: "2031-02-03T04:05:06.000Z",
        revoked_at: null,
        created_at: "2026-01-01T00:00:00Z",
        token: "replacement-token",
      },
    })

    await rotateDistribution(
      "survey-id",
      "distribution-id",
      "2031-02-03T04:05:06.000Z",
    )

    expect(mockApi.post).toHaveBeenCalledWith(
      "/surveys/survey-id/distributions/distribution-id/rotate",
      { expires_at: "2031-02-03T04:05:06.000Z" },
    )
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

  it("uses the exact export endpoint", async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {})
    const createObjectURL = vi.fn(() => "blob:export")
    const revokeObjectURL = vi.fn()
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL })
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL })
    mockApi.raw.get.mockResolvedValue(new Response("id\n1\n"))

    await exportResponses("survey-id")

    expect(mockApi.raw.get).toHaveBeenCalledWith("/surveys/survey-id/responses/export")
    expect(createObjectURL).toHaveBeenCalledOnce()
    expect(click).toHaveBeenCalledOnce()
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
