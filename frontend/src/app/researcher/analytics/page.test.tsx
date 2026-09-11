import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { PEIIAnalyticsResponse, Survey, SurveyResponseAggregate } from "@/lib/surveys"

const mocks = vi.hoisted(() => ({
  fetchSurveys: vi.fn(),
  fetchPEII: vi.fn(),
  fetchResponseAggregates: vi.fn(),
}))

vi.mock("@/lib/surveys", () => ({
  TRACER_STUDY_SURVEY_TITLE: "GRADUATE TRACER STUDY SURVEY",
  fetchSurveys: mocks.fetchSurveys,
  fetchPEII: mocks.fetchPEII,
  fetchResponseAggregates: mocks.fetchResponseAggregates,
}))

vi.mock("@/components/DashboardFilters", () => ({
  DashboardFilters: ({ onFilterChange }: { onFilterChange: (filters: { batch: string, department: string, degree: string }) => void }) => <>
    <button onClick={() => onFilterChange({ batch: "2023", department: "College of Arts and Sciences", degree: "Bachelor of Arts in Psychology" })}>Psychology 2023</button>
    <button onClick={() => onFilterChange({ batch: "2024", department: "All Departments", degree: "All Degrees" })}>Batch 2024</button>
    <button onClick={() => onFilterChange({ batch: "2025", department: "All Departments", degree: "All Degrees" })}>Batch 2025</button>
  </>,
  departmentDegrees: {},
}))
vi.mock("@/components/ClientFeedbackClassificationChart", () => ({
  ClientFeedbackClassificationChart: ({ data }: { data: unknown[] }) => <div>Classifications: {data.length}</div>,
}))
vi.mock("@/components/ClientDemographicsOverview", () => ({
  ClientDemographicsOverview: ({ demographics }: { demographics: { total_responses: number } }) => (
    <div>Demographic responses: {demographics.total_responses}</div>
  ),
}))
vi.mock("@/components/ClientPEIIHistoricalTrendChart", () => ({
  ClientPEIIHistoricalTrendChart: () => null,
}))
vi.mock("@/components/ClientDomainGainChart", () => ({
  ClientDomainGainChart: () => null,
}))
vi.mock("@/components/ClientKeyOutcomes", () => ({
  ClientKeyOutcomes: ({ distribution }: { distribution: SurveyResponseAggregate | null }) => <div>Outcome total: {distribution?.total ?? "missing"}</div>,
}))
vi.mock("@/components/ClientDegreeAlignment", () => ({
  ClientDegreeAlignment: () => null,
}))
vi.mock("@/components/ClientPEIIDimensionsTrendChart", () => ({
  ClientPEIIDimensionsTrendChart: () => null,
}))
vi.mock("@/components/ClientCurriculumFeedback", () => ({
  ClientCurriculumFeedback: ({
    feedbacks,
    qualitativeFeedbackTotal,
    onRefresh,
  }: {
    feedbacks: unknown[]
    qualitativeFeedbackTotal: number
    onRefresh?: () => void
  }) => (
    <div>
      <div>Feedback count: {feedbacks.length}</div>
      <div>Feedback total: {qualitativeFeedbackTotal}</div>
      <button onClick={onRefresh}>Refresh feedback</button>
    </div>
  ),
}))

vi.mock("html-to-image", () => ({ toPng: vi.fn().mockResolvedValue("data:image/png;base64,test") }))

import AnalyticsPage from "./page"

const activeSurvey: Survey = {
  id: "survey-1",
  surveyId: "survey-1",
  title: "GRADUATE TRACER STUDY SURVEY",
  status: "Active",
  responses: 12,
  dateCreated: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  isDeleted: false,
  retentionEnabled: true,
  retentionDays: 1825,
}

const analyticsResponse: PEIIAnalyticsResponse = {
  outcome_distributions: { employment_stability: { question_id: "post", question_text: "Post", question_type: "scale", total: 3, cells: [] }, degree_alignment: null },
  cohort_result: {
    batch_year: "2025",
    domains: [{ dimension: "Employment", pre_grad: 1, post_grad: 2 }],
    peii_score: 1,
    peii_index: 50,
  },
  baseline_result: null,
  historical_trend: [{ batch_year: "2025", peii_score: 1 }],
  demographics: {
    total_responses: 12,
    gender_distribution: {},
    location_distribution: {},
    department_distribution: {},
  },
  feedback_classification: {
    classifications: [{ dimension: "Employment", positive: 1, neutral: 0, negative: 0 }],
  },
  qualitative_feedback: [{
    response_id: "response-1",
    question_id: "question-1",
    question_text: "Feedback",
    response_text: "Helpful program",
    sentiment_score: 1,
    is_false_positive: false,
  }],
  qualitative_feedback_total: 3,
  qualitative_feedback_truncated: true,
}

const aggregates: SurveyResponseAggregate[] = [{
  question_id: "question-1",
  question_text: "Employment status",
  question_type: "single_choice",
  total: 12,
  cells: [],
}]

describe("AnalyticsPage", () => {
  beforeEach(() => {
    mocks.fetchSurveys.mockReset()
    mocks.fetchPEII.mockReset()
    mocks.fetchResponseAggregates.mockReset()
    mocks.fetchSurveys.mockResolvedValue({
      surveys: [activeSurvey],
      pagination: { total: 1, count: 1, limit: 100, offset: 0, has_next: false, has_prev: false },
    })
    mocks.fetchPEII.mockResolvedValue(analyticsResponse)
    mocks.fetchResponseAggregates.mockResolvedValue(aggregates)
  })

  it("clears stale analytics when feedback refresh finds no active tracer survey", async () => {
    render(<AnalyticsPage />)

    await screen.findByText("Demographic responses: 12")
    expect(mocks.fetchResponseAggregates).not.toHaveBeenCalled()
    expect(screen.getByText("Total Responses")).toBeInTheDocument()
    expect(screen.getByText("Outcome total: 3")).toBeInTheDocument()
    expect(screen.getByText("Feedback count: 1")).toBeInTheDocument()
    expect(screen.getByText("Feedback total: 3")).toBeInTheDocument()

    mocks.fetchSurveys.mockResolvedValue({
      surveys: [],
      pagination: { total: 0, count: 0, limit: 100, offset: 0, has_next: false, has_prev: false },
    })
    fireEvent.click(screen.getByRole("button", { name: "Refresh feedback" }))

    await screen.findByText("No Analytics Data Found")
    await waitFor(() => {
      expect(screen.queryByText("Total Responses")).not.toBeInTheDocument()
      expect(screen.queryByText("Demographic responses: 12")).not.toBeInTheDocument()
      expect(screen.queryByText("Outcome total: 3")).not.toBeInTheDocument()
      expect(screen.queryByText("Feedback count: 1")).not.toBeInTheDocument()
      expect(screen.queryByText("Feedback total: 3")).not.toBeInTheDocument()
    })
  })
})


it("ignores an older filter result and supplies the same filtered outcomes to export", async () => {
  mocks.fetchSurveys.mockResolvedValue({ surveys: [activeSurvey] })
  mocks.fetchPEII.mockResolvedValue(analyticsResponse)
  render(<AnalyticsPage />)
  await screen.findByText("Outcome total: 3")
  let resolveOld!: (value: PEIIAnalyticsResponse) => void
  mocks.fetchPEII.mockImplementation((_id: string, filters: { batch: string }) => filters.batch === "2024"
    ? new Promise<PEIIAnalyticsResponse>(resolve => { resolveOld = resolve })
    : Promise.resolve({ ...analyticsResponse, outcome_distributions: { employment_stability: { ...aggregates[0], total: 7 }, degree_alignment: null } }))
  fireEvent.click(screen.getByRole("button", { name: "Batch 2024" }))
  await waitFor(() => expect(resolveOld).toBeDefined())
  expect(screen.queryByText("Outcome total: 3")).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "Batch 2025" }))
  await screen.findByText("Outcome total: 7")
  await act(async () => { resolveOld(analyticsResponse) })
  expect(screen.queryByText("Outcome total: 3")).not.toBeInTheDocument()
  vi.useFakeTimers()
  fireEvent.click(screen.getByRole("button", { name: "Export" }))
  expect(screen.getAllByText("Outcome total: 7")).toHaveLength(2)
  mocks.fetchPEII.mockClear()
  fireEvent.click(screen.getByRole("button", { name: "Batch 2024" }))
  expect(mocks.fetchPEII).not.toHaveBeenCalled()
  expect(screen.getAllByText("Outcome total: 7")).toHaveLength(2)
  vi.clearAllTimers()
  vi.useRealTimers()
})

it("clears outcomes on a failed filter request and never requests global aggregates", async () => {
  mocks.fetchSurveys.mockResolvedValue({ surveys: [activeSurvey] })
  mocks.fetchPEII.mockResolvedValue(analyticsResponse)
  mocks.fetchResponseAggregates.mockClear()
  const errorLog = vi.spyOn(console, "error").mockImplementation(() => {})
  render(<AnalyticsPage />)
  await screen.findByText("Outcome total: 3")
  mocks.fetchPEII.mockRejectedValue(new Error("Unavailable"))
  fireEvent.click(screen.getByRole("button", { name: "Batch 2024" }))
  await screen.findByRole("heading", { name: "Unable to load analytics" })
  expect(screen.queryByText("Outcome total: 3")).not.toBeInTheDocument()
  expect(screen.queryByText("No Analytics Data Found")).not.toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Export" })).toBeDisabled()
  expect(mocks.fetchResponseAggregates).not.toHaveBeenCalled()
  mocks.fetchPEII.mockResolvedValue(analyticsResponse)
  fireEvent.click(screen.getByRole("button", { name: "Retry" }))
  await screen.findByText("Outcome total: 3")
  expect(mocks.fetchPEII).toHaveBeenLastCalledWith(activeSurvey.id, { batch: "2024", department: "All Departments", degree: "All Degrees" })
  expect(screen.queryByRole("heading", { name: "Unable to load analytics" })).not.toBeInTheDocument()
  errorLog.mockRestore()
})

it("shows a missing filtered answer without substituting global data", async () => {
  mocks.fetchSurveys.mockResolvedValue({ surveys: [activeSurvey] })
  mocks.fetchPEII.mockResolvedValue({ ...analyticsResponse, outcome_distributions: { employment_stability: null, degree_alignment: null } })
  render(<AnalyticsPage />)
  await screen.findByText("Outcome total: missing")
})


it("labels both posters and all download filenames with the selected degree", async () => {
  mocks.fetchSurveys.mockResolvedValue({ surveys: [activeSurvey] })
  mocks.fetchPEII.mockResolvedValue(analyticsResponse)
  const downloads: string[] = []
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function(this: HTMLAnchorElement) { downloads.push(this.download) })
  render(<AnalyticsPage />)
  await screen.findByText("Outcome total: 3")
  fireEvent.click(screen.getByRole("button", { name: "Psychology 2023" }))
  await screen.findByText("Outcome total: 3")
  fireEvent.click(screen.getByRole("button", { name: "Export" }))
  expect(screen.getAllByText("Bachelor of Arts in Psychology")).toHaveLength(2)
  await waitFor(() => expect(downloads).toHaveLength(2), { timeout: 4000 })
  fireEvent.click(screen.getByTitle("Export Key Outcomes as Image"))
  await waitFor(() => expect(downloads).toHaveLength(3))
  for (const filename of downloads) {
    expect(filename).toContain("2023")
    expect(filename).toContain("College of Arts and Sciences")
    expect(filename).toContain("Bachelor of Arts in Psychology")
  }
  click.mockRestore()
})


it("shows a valid empty cohort separately from a request failure", async () => {
  mocks.fetchSurveys.mockResolvedValue({ surveys: [activeSurvey] })
  mocks.fetchPEII.mockResolvedValue(analyticsResponse)
  render(<AnalyticsPage />)
  await screen.findByText("Outcome total: 3")
  mocks.fetchPEII.mockResolvedValue({ ...analyticsResponse, demographics: { ...analyticsResponse.demographics, total_responses: 0 }, outcome_distributions: { employment_stability: null, degree_alignment: null } })
  fireEvent.click(screen.getByRole("button", { name: "Batch 2024" }))
  await screen.findByRole("heading", { name: "No Analytics Data Found" })
  expect(screen.queryByRole("heading", { name: "Unable to load analytics" })).not.toBeInTheDocument()
  expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument()
  expect(screen.queryByText("Outcome total: 3")).not.toBeInTheDocument()
})
