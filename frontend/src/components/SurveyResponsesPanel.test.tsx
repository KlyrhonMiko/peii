import { fireEvent, render, screen } from "@testing-library/react"
import type { ComponentProps } from "react"
import { describe, expect, it, vi } from "vitest"

import type {
  Survey,
  SurveyResponse,
  SurveyResponseAggregate,
} from "@/lib/surveys"
import { SurveyResponsesPanel } from "./SurveyResponsesPanel"

const survey: Survey = {
  id: "survey-uuid",
  surveyId: "SURV-001",
  title: "Alumni survey",
  status: "Closed",
  responses: 4,
  dateCreated: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  isDeleted: false,
  retentionEnabled: true,
  retentionDays: 1825,
  sections: [{
    id: "section-1",
    title: "Experience",
    orderIndex: 0,
    questions: [
      { id: "q-choice", text: "How was it?", type: "single_choice", options: ["Good", "Poor"] },
      { id: "q-text", text: "Tell us more", type: "text" },
    ],
  }],
}

const aggregate: SurveyResponseAggregate = {
  question_id: "q-choice",
  question_text: "How was it?",
  question_type: "single_choice",
  total: 4,
  cells: [
    { value: "Good", count: 3, rank: null, row: null },
    { value: "Poor", count: 1, rank: null, row: null },
  ],
}

const response: SurveyResponse = {
  id: "response-1",
  surveyId: survey.id,
  distributionId: null,
  createdAt: "2026-02-01T00:00:00Z",
  answers: { "q-choice": "Good", "q-text": "Helpful" },
}

function renderPanel(overrides: Partial<ComponentProps<typeof SurveyResponsesPanel>> = {}) {
  const props: ComponentProps<typeof SurveyResponsesPanel> = {
    survey,
    capabilities: { readAggregates: true, readRaw: false, export: false, erase: false },
    aggregates: [aggregate],
    responses: [],
    responsePagination: null,
    aggregateLoading: false,
    rawLoading: false,
    aggregateError: null,
    rawError: null,
    rawLoaded: false,
    selectedResponseIds: [],
    responseAction: null,
    onLoadRaw: vi.fn(),
    onPageChange: vi.fn(),
    onExport: vi.fn(),
    onErase: vi.fn(),
    onToggleSelection: vi.fn(),
    ...overrides,
  }
  return render(<SurveyResponsesPanel {...props} />)
}

describe("SurveyResponsesPanel", () => {
  it.each([
    { total: 1, cells: [{ value: "Good", count: 1, rank: null, row: null }] },
    { total: aggregate.total, cells: aggregate.cells },
  ])("renders exact aggregate values and counts for a total of $total", ({ total, cells }) => {
    const onLoadRaw = vi.fn()

    renderPanel({ onLoadRaw, aggregates: [{ ...aggregate, total, cells }] })

    for (const cell of cells) {
      expect(screen.getByText(String(cell.value))).toBeInTheDocument()
      expect(screen.getByText(`(${cell.count})`)).toBeInTheDocument()
    }
    expect(screen.queryByText(/privacy threshold|at least five/i)).not.toBeInTheDocument()
    expect(onLoadRaw).not.toHaveBeenCalled()
  })

  it("uses neutral empty-state wording when a supported question has no aggregate", () => {
    renderPanel({ aggregates: [] })

    expect(screen.getByText("No aggregate values are available.")).toBeInTheDocument()
    expect(screen.queryByText(/privacy threshold|at least five/i)).not.toBeInTheDocument()
  })

  it.each(["Active", "Inactive"] as const)(
    "renders aggregate results for a %s survey when aggregate access is granted",
    (status) => {
      renderPanel({
        survey: { ...survey, status },
      })

      expect(screen.getByText("Good")).toBeInTheDocument()
      expect(screen.queryByText(/only available after a survey is closed or archived/i)).not.toBeInTheDocument()
    },
  )

  it("loads raw records lazily and paginates one current page at a time", () => {
    const onLoadRaw = vi.fn()
    const onPageChange = vi.fn()

    renderPanel({
      capabilities: { readAggregates: false, readRaw: true, export: false, erase: false },
      aggregates: [],
      onLoadRaw,
      onPageChange,
      responses: [response],
      responsePagination: {
        total: 51,
        count: 1,
        limit: 25,
        offset: 25,
        has_next: true,
        has_prev: true,
      },
      rawLoaded: true,
    })

    expect(screen.getByText("Helpful")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /load raw records/i }))
    expect(onLoadRaw).toHaveBeenCalledWith(25)
    fireEvent.click(screen.getByRole("button", { name: /next page/i }))
    expect(onPageChange).toHaveBeenCalledWith(50)
  })

  it("keeps export visible for an export-only user", () => {
    const onExport = vi.fn()
    renderPanel({
      capabilities: { readAggregates: false, readRaw: false, export: true, erase: false },
      aggregates: [],
      onExport,
    })

    fireEvent.click(screen.getByRole("button", { name: /export/i }))
    expect(onExport).toHaveBeenCalledOnce()
  })

  it("shows erase-all only for archived surveys with an exact count", () => {
    const onErase = vi.fn()
    renderPanel({
      capabilities: { readAggregates: false, readRaw: false, export: false, erase: true },
      aggregates: [],
      survey: { ...survey, isDeleted: true, responses: 4 },
      onErase,
    })

    fireEvent.click(screen.getByRole("button", { name: /erase all/i }))
    expect(onErase).toHaveBeenCalledWith("all")
  })

  it("requires raw access for selected erasure and handles aggregate errors", () => {
    const onErase = vi.fn()
    const { rerender } = renderPanel({
      capabilities: { readAggregates: true, readRaw: false, export: false, erase: true },
      aggregates: [aggregate],
      selectedResponseIds: ["response-1"],
      onErase,
    })
    expect(screen.queryByRole("button", { name: /erase \(/i })).not.toBeInTheDocument()

    rerender(
      <SurveyResponsesPanel
        survey={{ ...survey, responses: null }}
        capabilities={{ readAggregates: true, readRaw: false, export: false, erase: false }}
        aggregates={[]}
        responses={[]}
        responsePagination={null}
        aggregateLoading={false}
        rawLoading={false}
        aggregateError={"Could not load aggregates"}
        rawError={null}
        rawLoaded={false}
        selectedResponseIds={[]}
        responseAction={null}
        onLoadRaw={vi.fn()}
        onPageChange={vi.fn()}
        onExport={vi.fn()}
        onErase={vi.fn()}
        onToggleSelection={vi.fn()}
      />,
    )
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load aggregates")
  })
})
