import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import type { ComponentProps } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type {
  Survey,
  SurveyResponse,
  SurveyResponseAggregate,
} from "@/lib/surveys"
import { SurveyResponsesPanel } from "./SurveyResponsesPanel"

const importMocks = vi.hoisted(() => ({
  downloadTemplate: vi.fn(),
  validateImport: vi.fn(),
  importResponses: vi.fn(),
}))

vi.mock("@/lib/surveys", async () => {
  const actual = await vi.importActual<typeof import("@/lib/surveys")>("@/lib/surveys")
  return {
    ...actual,
    downloadSurveyResponseImportTemplate: importMocks.downloadTemplate,
    validateSurveyResponseImport: importMocks.validateImport,
    importSurveyResponses: importMocks.importResponses,
  }
})

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
    importMocks.downloadTemplate.mockReset()
    importMocks.validateImport.mockReset()
    importMocks.importResponses.mockReset()
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

  it("shows template and import actions only for an import-capable current survey", () => {
    renderPanel({
      capabilities: { readAggregates: false, readRaw: false, export: false, import: true, erase: false },
      aggregates: [],
    })

    expect(screen.getByRole("button", { name: /download csv template/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /^import csv$/i })).toBeInTheDocument()
  })

  it.each([
    { isDeleted: true, isTemplate: false },
    { isDeleted: false, isTemplate: true },
  ])("hides import actions for deleted or template surveys", (flags) => {
    renderPanel({
      survey: { ...survey, ...flags },
      capabilities: { readAggregates: false, readRaw: false, export: false, import: true, erase: false },
      aggregates: [],
    })

    expect(screen.queryByRole("button", { name: /download csv template/i })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /^import csv$/i })).not.toBeInTheDocument()
  })

  it("preflights CSV files, validates them, and commits only a valid import", async () => {
    importMocks.validateImport.mockResolvedValue({ survey_id: survey.id, valid: true, row_count: 2, error_count: 0, errors: [] })
    importMocks.importResponses.mockResolvedValue({ survey_id: survey.id, imported_count: 2 })
    const onImportComplete = vi.fn().mockResolvedValue(undefined)
    renderPanel({
      capabilities: { readAggregates: false, readRaw: false, export: false, import: true, erase: false },
      aggregates: [],
      onImportComplete,
    })

    fireEvent.click(screen.getByRole("button", { name: /^import csv$/i }))
    expect(screen.getByText(/can double-count responses/i)).toBeInTheDocument()
    const fileInput = screen.getByLabelText(/choose csv file/i)
    const csv = "submitted_at,q-1\n2026-01-01T00:00:00+08:00,Good\n2026-01-02T00:00:00+08:00,Poor\n"
    fireEvent.change(fileInput, { target: { files: [new File([csv], "responses.csv", { type: "text/csv" })] } })

    await waitFor(() => expect(screen.getByText("responses.csv")).toBeInTheDocument())
    fireEvent.click(screen.getByRole("button", { name: /validate csv/i }))
    await waitFor(() => expect(importMocks.validateImport).toHaveBeenCalledWith(survey.id, csv))
    expect(screen.getByText(/2 data rows found/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: /import 2 responses/i }))
    await waitFor(() => expect(importMocks.importResponses).toHaveBeenCalledWith(survey.id, csv))
    await waitFor(() => expect(onImportComplete).toHaveBeenCalledOnce())
    expect(screen.queryByRole("dialog", { name: /import csv responses/i })).not.toBeInTheDocument()
  })

  it("keeps the template download and errors inside the import dialog", async () => {
    importMocks.downloadTemplate.mockRejectedValue(new Error("Template unavailable"))
    renderPanel({
      capabilities: { readAggregates: false, readRaw: false, export: false, import: true, erase: false },
      aggregates: [],
    })

    fireEvent.click(screen.getByRole("button", { name: /^import csv$/i }))
    const dialog = screen.getByRole("dialog", { name: /import csv responses/i })
    expect(dialog).toHaveClass("overflow-hidden", "flex-col")
    fireEvent.click(within(dialog).getByRole("button", { name: /download csv template/i }))

    expect(importMocks.downloadTemplate).toHaveBeenCalledWith(survey.id)
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Template unavailable")
  })

  it("does not offer a commit action when validation returns errors", async () => {
    importMocks.validateImport.mockResolvedValue({
      valid: false,
      survey_id: survey.id,
      row_count: 1,
      error_count: 1,
      errors: [{ row: 2, column: "q-1", code: "invalid_value", message: "Unknown response format." }],
    })
    renderPanel({
      capabilities: { readAggregates: false, readRaw: false, export: false, import: true, erase: false },
      aggregates: [],
    })

    fireEvent.click(screen.getByRole("button", { name: /^import csv$/i }))
    const fileInput = screen.getByLabelText(/choose csv file/i)
    fireEvent.change(fileInput, { target: { files: [new File(["submitted_at,q-1\ninvalid"], "responses.csv")] } })
    await waitFor(() => expect(screen.getByText("responses.csv")).toBeInTheDocument())
    fireEvent.click(screen.getByRole("button", { name: /validate csv/i }))
    await waitFor(() => expect(screen.getByText(/row 2 · q-1: unknown response format/i)).toBeInTheDocument())
    expect(screen.queryByRole("button", { name: /import 1 response/i })).not.toBeInTheDocument()
    expect(importMocks.importResponses).not.toHaveBeenCalled()
  })

  it("rejects non-CSV and oversized files before contacting the backend", async () => {
    renderPanel({
      capabilities: { readAggregates: false, readRaw: false, export: false, import: true, erase: false },
      aggregates: [],
    })
    fireEvent.click(screen.getByRole("button", { name: /^import csv$/i }))
    const fileInput = screen.getByLabelText(/choose csv file/i)

    fireEvent.change(fileInput, { target: { files: [new File(["workbook"], "responses.xlsx")] } })
    expect(await screen.findByRole("alert")).toHaveTextContent(/xlsx.*not supported/i)

    fireEvent.change(fileInput, {
      target: { files: [new File([new Uint8Array(2 * 1024 * 1024 + 1)], "responses.csv")] },
    })
    expect(await screen.findByRole("alert")).toHaveTextContent(/larger than the 2 mib/i)
    expect(importMocks.validateImport).not.toHaveBeenCalled()
  })

  it("blocks import and other response actions while either side is busy", async () => {
    const firstPanel = renderPanel({
      capabilities: { readAggregates: false, readRaw: true, export: true, import: true, erase: true },
      aggregates: [],
      responses: [response],
      rawLoaded: true,
      responsePagination: { total: 1, count: 1, limit: 25, offset: 0, has_next: false, has_prev: false },
      selectedResponseIds: [response.id],
      responseAction: "erase",
    })

    for (const button of screen.getAllByRole("button", { name: /download csv template/i, hidden: true })) {
      expect(button).toBeDisabled()
    }
    expect(screen.getByRole("button", { name: /^import csv$/i, hidden: true })).toBeDisabled()
    expect(screen.getByRole("button", { name: /^export$/i, hidden: true })).toBeDisabled()
    expect(screen.getByRole("button", { name: /erase \(1\)/i, hidden: true })).toBeDisabled()
    firstPanel.unmount()

    const validationResult = { survey_id: survey.id, valid: true, row_count: 1, error_count: 0, errors: [] as [] }
    let resolveValidation: ((value: typeof validationResult) => void) | undefined
    importMocks.validateImport.mockImplementation(() => new Promise<typeof validationResult>((resolve) => { resolveValidation = resolve }))
    renderPanel({
      capabilities: { readAggregates: false, readRaw: true, export: true, import: true, erase: true },
      aggregates: [],
      responses: [response],
      rawLoaded: true,
      responsePagination: { total: 1, count: 1, limit: 25, offset: 0, has_next: false, has_prev: false },
      selectedResponseIds: [response.id],
    })
    fireEvent.click(screen.getByRole("button", { name: /^import csv$/i }))
    const fileInput = screen.getByLabelText(/choose csv file/i)
    fireEvent.change(fileInput, { target: { files: [new File(["submitted_at,q-1\nvalue"], "responses.csv")] } })
    await waitFor(() => expect(screen.getByText("responses.csv")).toBeInTheDocument())
    fireEvent.click(screen.getByRole("button", { name: /validate csv/i }))
    await waitFor(() => expect(importMocks.validateImport).toHaveBeenCalledOnce())
    for (const button of screen.getAllByRole("button", { name: /download csv template/i, hidden: true })) {
      expect(button).toBeDisabled()
    }
    expect(screen.getByRole("button", { name: /^import csv$/i, hidden: true })).toBeDisabled()
    expect(screen.getByRole("button", { name: /^export$/i, hidden: true })).toBeDisabled()
    expect(screen.getByRole("button", { name: /erase \(1\)/i, hidden: true })).toBeDisabled()

    resolveValidation?.(validationResult)
  })
})
