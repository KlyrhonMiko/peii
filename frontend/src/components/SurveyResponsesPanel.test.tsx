import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import type { ComponentProps } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type {
  Survey,
  SurveyResponse,
  SurveyResponseAggregate,
  SurveyResponseImportResult,
} from "@/lib/surveys"
import type { ResponseImportDialogProps } from "./survey-response-import/ResponseImportDialog"
import { SurveyResponsesPanel } from "./SurveyResponsesPanel"

const toastMocks = vi.hoisted(() => ({ success: vi.fn() }))

vi.mock("sonner", () => ({ toast: { success: toastMocks.success } }))

const importResult: SurveyResponseImportResult = {
  survey_id: "survey-uuid",
  imported_count: 4,
  updated_count: 1,
  unchanged_count: 0,
  merged_in_file_count: 0,
  filled_answer_count: 2,
}

// The dialog has its own tests; here a stub exposes its contract with the panel.
vi.mock("./survey-response-import/ResponseImportDialog", () => ({
  ResponseImportDialog: ({ open, onOpenChange, onImportComplete }: ResponseImportDialogProps) => open ? (
    <div role="dialog" aria-label="Import responses">
      <button
        type="button"
        onClick={() => {
          onOpenChange(false)
          void onImportComplete(importResult)
        }}
      >
        Finish import
      </button>
    </div>
  ) : null,
}))

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
  createdAt: "2026-02-01T00:00:00Z",
  answers: { "q-choice": "Good", "q-text": "Helpful" },
}

const identityResponse = {
  ...response,
  provider: "google",
  email: "alumni@example.test",
  displayName: "Alumni Respondent",
  emailVerified: true,
  identityCapturedAt: "2026-02-01T00:00:00Z",
  identityAvailable: true,
}

function renderPanel(overrides: Partial<ComponentProps<typeof SurveyResponsesPanel>> = {}) {
  const props: ComponentProps<typeof SurveyResponsesPanel> = {
    survey,
    capabilities: { readAggregates: true, readRaw: false, export: false, import: false, erase: false },
    aggregates: [aggregate],
    responses: [],
    identities: [],
    responsePagination: null,
    aggregateLoading: false,
    rawLoading: false,
    aggregateError: null,
    rawError: null,
    rawLoaded: false,
    identityLoading: false,
    identityError: null,
    identityLoaded: false,
    selectedResponseIds: [],
    responseAction: null,
    onImportComplete: vi.fn(),
    onLoadRaw: vi.fn(),
    onLoadIdentity: vi.fn(),
    onPageChange: vi.fn(),
    onExport: vi.fn(),
    onErase: vi.fn(),
    onToggleSelection: vi.fn(),
    ...overrides,
  }
  return render(<SurveyResponsesPanel {...props} />)
}

describe("SurveyResponsesPanel", () => {
  beforeEach(() => {
    toastMocks.success.mockReset()
  })

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

    expect(screen.getAllByText("No aggregate values are available.")).toHaveLength(2)
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
      capabilities: { readAggregates: false, readRaw: true, export: false, import: false, erase: false },
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
      capabilities: { readAggregates: false, readRaw: false, export: true, import: false, erase: false },
      aggregates: [],
      onExport,
    })

    fireEvent.click(screen.getByRole("button", { name: /export/i }))
    expect(onExport).toHaveBeenCalledOnce()
  })

  it("shows erase-all only for archived surveys with an exact count", () => {
    const onErase = vi.fn()
    renderPanel({
      capabilities: { readAggregates: false, readRaw: false, export: false, import: false, erase: true },
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
      capabilities: { readAggregates: true, readRaw: false, export: false, import: false, erase: true },
      aggregates: [aggregate],
      selectedResponseIds: ["response-1"],
      onErase,
    })
    expect(screen.queryByRole("button", { name: /erase \(/i })).not.toBeInTheDocument()

    rerender(
      <SurveyResponsesPanel
        survey={{ ...survey, responses: null }}
        capabilities={{ readAggregates: true, readRaw: false, export: false, import: false, erase: false }}
         aggregates={[]}
         responses={[]}
         identities={[]}
         responsePagination={null}
        aggregateLoading={false}
        rawLoading={false}
        aggregateError={"Could not load aggregates"}
        rawError={null}
         rawLoaded={false}
         identityLoading={false}
         identityError={null}
         identityLoaded={false}
        selectedResponseIds={[]}
        responseAction={null}
         onImportComplete={vi.fn()}
         onLoadRaw={vi.fn()}
         onLoadIdentity={vi.fn()}
        onPageChange={vi.fn()}
        onExport={vi.fn()}
        onErase={vi.fn()}
        onToggleSelection={vi.fn()}
      />,
    )
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load aggregates")
  })

  it("loads and displays identity only when both identity and raw capabilities are present", () => {
    const onLoadIdentity = vi.fn()
    renderPanel({
      capabilities: { readAggregates: false, readRaw: true, readIdentity: true, export: false, import: false, erase: false },
      responses: [response],
      responsePagination: { total: 1, count: 1, limit: 25, offset: 0, has_next: false, has_prev: false },
      rawLoaded: true,
      identities: [identityResponse],
      identityLoaded: true,
      onLoadIdentity,
    })

    expect(screen.getByText("Alumni Respondent")).toBeInTheDocument()
    expect(screen.getByText("alumni@example.test")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /respondent identity/i }))
    expect(onLoadIdentity).toHaveBeenCalledWith(0)
  })

  it("shows the import action only for an import-capable current survey", () => {
    renderPanel({
      capabilities: { readAggregates: false, readRaw: false, export: false, import: true, erase: false },
      aggregates: [],
    })

    expect(screen.getByRole("button", { name: /^import responses$/i })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /csv template/i })).not.toBeInTheDocument()
  })

  it.each([
    { isDeleted: true, isTemplate: false },
    { isDeleted: false, isTemplate: true },
  ])("hides the import action for deleted or template surveys", (flags) => {
    renderPanel({
      survey: { ...survey, ...flags },
      capabilities: { readAggregates: false, readRaw: false, export: false, import: true, erase: false },
      aggregates: [],
    })

    expect(screen.queryByRole("button", { name: /^import responses$/i })).not.toBeInTheDocument()
  })

  it("opens the import dialog, refreshes after import, and reports the counts", async () => {
    const onImportComplete = vi.fn().mockResolvedValue(undefined)
    renderPanel({
      capabilities: { readAggregates: false, readRaw: false, export: false, import: true, erase: false },
      aggregates: [],
      onImportComplete,
    })

    fireEvent.click(screen.getByRole("button", { name: /^import responses$/i }))
    const dialog = screen.getByRole("dialog", { name: /import responses/i })
    fireEvent.click(within(dialog).getByRole("button", { name: /finish import/i }))

    await waitFor(() => expect(onImportComplete).toHaveBeenCalledOnce())
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith(
      "4 new responses imported · 1 updated · 2 blank answers filled",
    ))
  })

  it("keeps the refresh failure message outside the closed dialog", async () => {
    renderPanel({
      capabilities: { readAggregates: false, readRaw: false, export: false, import: true, erase: false },
      aggregates: [],
      onImportComplete: vi.fn().mockRejectedValue(new Error("offline")),
    })

    fireEvent.click(screen.getByRole("button", { name: /^import responses$/i }))
    fireEvent.click(screen.getByRole("button", { name: /finish import/i }))

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not be refreshed\. reopen this survey/i)
    expect(toastMocks.success).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: /^import responses$/i })).toBeEnabled()
  })

  it("disables import while another response action runs", () => {
    renderPanel({
      capabilities: { readAggregates: false, readRaw: true, export: true, import: true, erase: true },
      aggregates: [],
      responses: [response],
      rawLoaded: true,
      responsePagination: { total: 1, count: 1, limit: 25, offset: 0, has_next: false, has_prev: false },
      selectedResponseIds: [response.id],
      responseAction: "erase",
    })

    expect(screen.getByRole("button", { name: /^import responses$/i })).toBeDisabled()
    expect(screen.getByRole("button", { name: /^export$/i })).toBeDisabled()
    expect(screen.getByRole("button", { name: /erase \(1\)/i })).toBeDisabled()
  })
})
