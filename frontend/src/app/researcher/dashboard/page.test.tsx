import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, expect, it, vi } from "vitest"

import DashboardPage from "./page"

const surveyMocks = vi.hoisted(() => ({
  fetchSurveys: vi.fn(),
  fetchPEII: vi.fn(),
}))

vi.mock("@/lib/surveys", async () => {
  const actual = await vi.importActual<typeof import("@/lib/surveys")>("@/lib/surveys")
  return { ...actual, ...surveyMocks }
})

beforeEach(() => {
  surveyMocks.fetchSurveys.mockReset()
  surveyMocks.fetchPEII.mockReset()
  surveyMocks.fetchSurveys
    .mockResolvedValueOnce({
      surveys: [{ id: "survey-a", surveyId: "SURV-A", title: "Tracer study A" }],
      pagination: { has_next: true },
    })
    .mockResolvedValueOnce({
      surveys: [{ id: "survey-b", surveyId: "SURV-B", title: "Graduate outcomes B" }],
      pagination: { has_next: false },
    })
  surveyMocks.fetchPEII.mockResolvedValue({
    cohort_result: { batch_year: "All Batches", domains: [], peii_score: 0 },
    demographics: null,
    qualitative_feedback_total: 0,
    qualitative_feedback_truncated: false,
  })
})

it("waits for a survey choice and loads analytics for each selected active survey", async () => {
  render(<DashboardPage />)

  const picker = await screen.findByLabelText("Survey")
  await screen.findByText("Select an active survey to view its dashboard.")
  expect(surveyMocks.fetchPEII).not.toHaveBeenCalled()
  expect(surveyMocks.fetchSurveys).toHaveBeenCalledWith(
    { status: "Active", limit: 100, offset: 0 },
    expect.any(AbortSignal),
  )
  expect(surveyMocks.fetchSurveys).toHaveBeenCalledWith(
    { status: "Active", limit: 100, offset: 100 },
    expect.any(AbortSignal),
  )

  fireEvent.change(picker, { target: { value: "survey-a" } })
  await waitFor(() => expect(surveyMocks.fetchPEII).toHaveBeenCalledWith(
    "survey-a",
    { batch: "All Batches", department: "All Departments", degree: "All Degrees" },
    expect.any(AbortSignal),
  ))

  fireEvent.change(picker, { target: { value: "survey-b" } })
  await waitFor(() => expect(surveyMocks.fetchPEII).toHaveBeenLastCalledWith(
    "survey-b",
    { batch: "All Batches", department: "All Departments", degree: "All Degrees" },
    expect.any(AbortSignal),
  ))
})
