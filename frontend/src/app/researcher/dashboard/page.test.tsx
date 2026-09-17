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

it("defaults to the first active PEII Survey across all pages and keeps the picker usable", async () => {
  surveyMocks.fetchSurveys.mockReset()
  surveyMocks.fetchSurveys
    .mockResolvedValueOnce({
      surveys: [{ id: "survey-a", surveyId: "SURV-A", title: "Tracer study A" }],
      pagination: { has_next: true },
    })
    .mockResolvedValueOnce({
      surveys: [
        { id: "survey-b", surveyId: "SURV-B", title: "Annual pEiI Graduate SuRvEy 2026" },
        { id: "survey-c", surveyId: "SURV-C", title: "PEII Survey 2025" },
      ],
      pagination: { has_next: false },
    })

  render(<DashboardPage />)

  const picker = await screen.findByLabelText("Survey")
  await waitFor(() => expect(picker).toHaveTextContent("Annual pEiI Graduate SuRvEy 2026"))
  await waitFor(() => expect(surveyMocks.fetchPEII).toHaveBeenCalledWith(
    "survey-b",
    { batch: "All Batches", department: "All Departments", degree: "All Degrees" },
    expect.any(AbortSignal),
  ))

  fireEvent.click(picker)
  fireEvent.click(await screen.findByRole("button", { name: /Tracer study A/ }))
  await waitFor(() => expect(surveyMocks.fetchPEII).toHaveBeenLastCalledWith(
    "survey-a",
    { batch: "All Batches", department: "All Departments", degree: "All Degrees" },
    expect.any(AbortSignal),
  ))
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

  fireEvent.click(picker)
  fireEvent.click(await screen.findByRole("button", { name: /Tracer study A/ }))
  await waitFor(() => expect(surveyMocks.fetchPEII).toHaveBeenCalledWith(
    "survey-a",
    { batch: "All Batches", department: "All Departments", degree: "All Degrees" },
    expect.any(AbortSignal),
  ))

  fireEvent.click(picker)
  fireEvent.click(await screen.findByRole("button", { name: /Graduate outcomes B/ }))
  await waitFor(() => expect(surveyMocks.fetchPEII).toHaveBeenLastCalledWith(
    "survey-b",
    { batch: "All Batches", department: "All Departments", degree: "All Degrees" },
    expect.any(AbortSignal),
  ))
})
