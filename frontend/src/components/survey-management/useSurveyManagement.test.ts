import { act, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  fetchSurveys: vi.fn(),
  fetchSurvey: vi.fn(),
  fetchResponses: vi.fn(),
  fetchResponseAggregates: vi.fn(),
  eraseResponses: vi.fn(),
}))

vi.mock("@/lib/surveys", async () => {
  const actual = await vi.importActual<typeof import("@/lib/surveys")>("@/lib/surveys")
  return {
    ...actual,
    fetchSurveys: mocks.fetchSurveys,
    fetchSurvey: mocks.fetchSurvey,
    fetchResponses: mocks.fetchResponses,
    fetchResponseAggregates: mocks.fetchResponseAggregates,
    eraseResponses: mocks.eraseResponses,
  }
})

import type { Survey, SurveyResponse, SurveyResponseAggregate } from "@/lib/surveys"
import { useSurveyManagement } from "./useSurveyManagement"

const survey: Survey = {
  id: "survey-uuid",
  surveyId: "SURV-001",
  title: "Alumni survey",
  status: "Inactive",
  responses: 1,
  dateCreated: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  isDeleted: false,
  retentionEnabled: true,
  retentionDays: 1825,
}

const aggregate: SurveyResponseAggregate = {
  question_id: "question-1",
  question_text: "How was it?",
  question_type: "single_choice",
  total: 1,
  cells: [{ value: "Good", count: 1, rank: null, row: null }],
}

const response: SurveyResponse = {
  id: "response-1",
  surveyId: survey.id,
  distributionId: null,
  createdAt: "2026-02-01T00:00:00Z",
  answers: { "question-1": "Good" },
}

function listResult(currentSurvey: Survey) {
  return {
    surveys: [currentSurvey],
    pagination: {
      total: 1,
      count: 1,
      limit: 20,
      offset: 0,
      has_next: false,
      has_prev: false,
    },
  }
}

describe("useSurveyManagement aggregate loading", () => {
  beforeEach(() => {
    mocks.fetchSurveys.mockResolvedValue(listResult(survey))
    mocks.fetchResponses.mockResolvedValue({
      responses: [response],
      pagination: {
        total: 1,
        count: 1,
        limit: 25,
        offset: 0,
        has_next: false,
        has_prev: false,
      },
    })
    mocks.fetchResponseAggregates.mockResolvedValue([aggregate])
    mocks.eraseResponses.mockResolvedValue({
      scope: "selected",
      requested_count: 1,
      erased_count: 1,
    })
    vi.spyOn(window, "confirm").mockReturnValue(true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  it.each(["Active", "Inactive"] as const)(
    "requests aggregate data when opening a %s survey",
    async (status) => {
      const currentSurvey = { ...survey, status }
      mocks.fetchSurveys.mockResolvedValueOnce(listResult(currentSurvey))

      const { result } = renderHook(() => useSurveyManagement({
        permissions: ["survey_responses.read_aggregates"],
        csvExportEnabled: false,
      }))

      await waitFor(() => expect(result.current.state.surveys).toEqual([currentSurvey]))

      act(() => {
        result.current.actions.handleViewResponses(currentSurvey)
      })

      await waitFor(() => expect(mocks.fetchResponseAggregates).toHaveBeenCalledWith(currentSurvey.id))
    },
  )

  it.each(["Active", "Inactive"] as const)(
    "refreshes aggregate data after erasing a selected response from a %s survey",
    async (status) => {
      const currentSurvey = { ...survey, status }
      mocks.fetchSurveys.mockResolvedValueOnce(listResult(currentSurvey))
      mocks.fetchSurvey.mockResolvedValue(currentSurvey)

      const { result } = renderHook(() => useSurveyManagement({
        permissions: [
          "survey_responses.read_aggregates",
          "survey_responses.read_raw",
          "survey_responses.erase",
        ],
        csvExportEnabled: false,
      }))

      await waitFor(() => expect(result.current.state.surveys).toEqual([currentSurvey]))
      await act(async () => {
        await result.current.actions.handleLoadRawResponses(currentSurvey)
      })
      act(() => {
        result.current.actions.setSelectedResponseIds([response.id])
      })

      await act(async () => {
        await result.current.actions.handleEraseResponses(currentSurvey, "selected")
      })

      await waitFor(() => expect(mocks.fetchResponseAggregates).toHaveBeenCalledWith(currentSurvey.id))
    },
  )
})
