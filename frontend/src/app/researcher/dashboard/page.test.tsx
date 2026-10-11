import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, expect, it, vi } from "vitest"

import DashboardPage from "./page"
import { departmentDegrees } from "@/lib/degree-programs"

const surveyMocks = vi.hoisted(() => ({
  fetchSurveys: vi.fn(),
  fetchPEII: vi.fn(),
}))

const alumniMocks = vi.hoisted(() => ({
  fetchAlumniTotals: vi.fn(),
}))

vi.mock("@/lib/surveys", async () => {
  const actual = await vi.importActual<typeof import("@/lib/surveys")>("@/lib/surveys")
  return { ...actual, ...surveyMocks }
})

vi.mock("@/lib/alumni-counts", async () => {
  const actual = await vi.importActual<typeof import("@/lib/alumni-counts")>("@/lib/alumni-counts")
  return { ...actual, ...alumniMocks }
})

beforeEach(() => {
  alumniMocks.fetchAlumniTotals.mockReset()
  alumniMocks.fetchAlumniTotals.mockResolvedValue(null)
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

it("shows respondents over alumni and the response rate overall, per cohort, and per college", async () => {
  const nursing = "Bachelor of Science in Nursing"
  const bsit = "Bachelor of Science in Information Technology"
  const engineering = "Bachelor of Science in Electronics Engineering"
  const knownZeros = Object.fromEntries(Object.values(departmentDegrees).flat().map((degree) => [degree, 0]))
  alumniMocks.fetchAlumniTotals.mockResolvedValue({
    alumni_total: 3835,
    by_batch: { "2023": 1120, "2024": 730, "2025": 841, "2026": 1144 },
    by_batch_college: {
      "2023": { "College of Nursing": 74, "College of Computer Studies": 289 },
      "2024": { "College of Nursing": 54, "College of Computer Studies": 156 },
      "2025": { "College of Nursing": 80, "College of Computer Studies": 161 },
      "2026": { "College of Nursing": 120 },
    },
    by_batch_degree: {
      "2023": { ...knownZeros, [nursing]: 74, [bsit]: 289, [engineering]: 757 },
      "2024": { ...knownZeros, [nursing]: 54, [bsit]: 156, [engineering]: 520 },
      "2025": { ...knownZeros, [nursing]: 80, [bsit]: 161, [engineering]: 600 },
      "2026": { ...knownZeros, [nursing]: 120, [engineering]: 1024 },
    },
  })
  surveyMocks.fetchPEII.mockResolvedValue({
    cohort_result: { batch_year: "All Batches", domains: [], peii_score: 0 },
    demographics: {
      total_responses: 121,
      gender_distribution: {},
      location_distribution: {},
      department_distribution: {},
      batch_distribution: { "2023": 38, "2024": 42, "2025": 41 },
      batch_college_distribution: {
        "2023": { "College of Nursing": 4, "College of Computer Studies": 18 },
        "2024": { "College of Computer Studies": 20 },
        "2025": { "College of Computer Studies": 10 },
      },
      batch_degree_distribution: {
        "2023": { [nursing]: 4, [bsit]: 18, [engineering]: 16 },
        "2024": { [bsit]: 20, [engineering]: 22 },
        "2025": { [bsit]: 10, [engineering]: 31 },
      },
    },
    qualitative_feedback_total: 0,
    qualitative_feedback_truncated: false,
  })

  render(<DashboardPage />)

  const picker = await screen.findByLabelText("Survey")
  fireEvent.click(picker)
  fireEvent.click(await screen.findByRole("button", { name: /Tracer study A/ }))

  // 2026 has alumni but no responses, so the overall rate covers 2023-2025 only.
  expect(await screen.findByText("121 / 2,691 respondents")).toBeInTheDocument()
  expect(screen.getByText("Response rate: 4.5%")).toBeInTheDocument()
  expect(screen.queryByRole("list", { name: "Response rate by batch" })).not.toBeInTheDocument()

  const toggle = screen.getByRole("button", { name: /Total Responses/ })
  expect(toggle).toHaveAttribute("aria-expanded", "false")
  fireEvent.click(toggle)
  expect(toggle).toHaveAttribute("aria-expanded", "true")

  // Defaults to the per-batch view only.
  expect(screen.getByRole("button", { name: "By batch" })).toHaveAttribute("aria-pressed", "true")
  expect(screen.queryByRole("list", { name: "Response rate by college" })).not.toBeInTheDocument()
  expect(screen.getByRole("listitem", { name: "Batch 2023: 38 / 1,120 respondents, response rate 3.4%" })).toBeInTheDocument()
  expect(screen.getByText("38 / 1,120")).toBeInTheDocument()
  expect(screen.getByRole("listitem", { name: "Batch 2026: 0 / 1,144 respondents, response rate 0.0%" })).toHaveTextContent("no responses yet")
  expect(screen.getByText(/Batch 2026 has no responses yet, so its 1,144 recorded alumni/)).toBeInTheDocument()

  fireEvent.click(screen.getByRole("button", { name: "By college" }))
  expect(screen.queryByRole("list", { name: "Response rate by batch" })).not.toBeInTheDocument()
  expect(screen.getByRole("listitem", { name: "College of Computer Studies: 48 / 606 respondents, response rate 7.9%" })).toBeInTheDocument()
  expect(screen.getByRole("listitem", { name: "College of Nursing: 4 / 208 respondents, response rate 1.9%" })).toHaveTextContent("Nursing")

  fireEvent.click(toggle)
  expect(screen.queryByRole("list", { name: "Response rate by college" })).not.toBeInTheDocument()
  expect(alumniMocks.fetchAlumniTotals).toHaveBeenCalledWith(
    { batch: "All Batches", department: "All Departments", degree: "All Degrees" },
    expect.any(AbortSignal),
  )
})

it("keeps the sample-size label when no alumni total covers the filters", async () => {
  surveyMocks.fetchPEII.mockResolvedValue({
    cohort_result: { batch_year: "All Batches", domains: [], peii_score: 0 },
    demographics: {
      total_responses: 412,
      gender_distribution: {},
      location_distribution: {},
      department_distribution: {},
    },
    qualitative_feedback_total: 0,
    qualitative_feedback_truncated: false,
  })

  render(<DashboardPage />)

  const picker = await screen.findByLabelText("Survey")
  fireEvent.click(picker)
  fireEvent.click(await screen.findByRole("button", { name: /Tracer study A/ }))

  expect(await screen.findByText("Sample Size Reliability")).toBeInTheDocument()
  expect(screen.queryByText(/Response rate:/)).not.toBeInTheDocument()
})
