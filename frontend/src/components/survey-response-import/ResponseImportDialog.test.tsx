import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ApiError } from "@/lib/api"
import type { SurveyResponseImportPreview, SurveyResponseImportResult } from "@/lib/surveys"
import { ResponseImportDialog } from "./ResponseImportDialog"

const importMocks = vi.hoisted(() => ({
  preview: vi.fn(),
  importResponses: vi.fn(),
}))

vi.mock("@/lib/surveys", async () => {
  const actual = await vi.importActual<typeof import("@/lib/surveys")>("@/lib/surveys")
  return {
    ...actual,
    previewSurveyResponseImport: importMocks.preview,
    importSurveyResponses: importMocks.importResponses,
  }
})

const SURVEY_ID = "survey-uuid"

function basePreview(overrides: Partial<SurveyResponseImportPreview> = {}): SurveyResponseImportPreview {
  return {
    survey_id: SURVEY_ID,
    file_format: "xlsx",
    sheet_names: ["Form Responses 1"],
    sheet: "Form Responses 1",
    utc_offset_minutes: 480,
    columns: [
      {
        index: 0,
        header: "Timestamp",
        target: "submitted_at",
        question_id: null,
        status: "matched",
        match: "timestamp",
        reason: null,
        samples: ["2026/01/05 9:30:00 AM"],
      },
      {
        index: 1,
        header: "How was it?",
        target: "question",
        question_id: "q-choice",
        status: "matched",
        match: "header",
        reason: null,
        samples: ["Good", "Great!"],
      },
      {
        index: 2,
        header: "Comments",
        target: "ignore",
        question_id: null,
        status: "unmatched",
        match: "none",
        reason: "No similar question.",
        samples: ["Helpful"],
      },
    ],
    questions: [
      {
        question_id: "q-choice",
        section_title: "Experience",
        question_text: "How was it?",
        question_type: "single_choice",
        survey_phase: 1,
        mapped: true,
        importable: true,
      },
      {
        question_id: "q-text",
        section_title: "Experience",
        question_text: "Tell us more",
        question_type: "text",
        survey_phase: 1,
        mapped: false,
        importable: true,
      },
      {
        question_id: "q-matrix",
        section_title: "Ratings",
        question_text: "Rate each area",
        question_type: "matrix",
        survey_phase: 2,
        mapped: false,
        importable: false,
      },
    ],
    value_issues: [
      {
        question_id: "q-choice",
        column: "How was it?",
        raw_value: "Great!",
        count: 3,
        suggestion: "Good",
        options: ["Good", "Poor"],
      },
    ],
    rows: { total: 5, new: 4, will_update: 1, unchanged: 0, merged_in_file: 0, needs_review: 0, invalid: 0 },
    error_count: 0,
    errors: [],
    conflict_count: 0,
    conflicts: [],
    match_count: 1,
    matches: [{
      row: 6,
      matched_by: "email",
      target: "existing",
      target_row: null,
      action: "update",
      filled_answer_count: 2,
      conflict_count: 1,
    }],
    personal_data_question_ids: [],
    consent_question_id: null,
    includes_personal_data: false,
    warnings: [],
    structure_version: "v1",
    can_import: false,
    ...overrides,
  }
}

const resolvedPreview = basePreview({ value_issues: [], can_import: true, structure_version: "v2" })

const importResult: SurveyResponseImportResult = {
  survey_id: SURVEY_ID,
  imported_count: 4,
  updated_count: 1,
  unchanged_count: 0,
  merged_in_file_count: 0,
  filled_answer_count: 2,
}

function renderDialog() {
  const onOpenChange = vi.fn()
  const onImportComplete = vi.fn().mockResolvedValue(undefined)
  render(
    <ResponseImportDialog
      surveyId={SURVEY_ID}
      surveyTitle="Alumni survey"
      open
      onOpenChange={onOpenChange}
      onImportComplete={onImportComplete}
    />,
  )
  return { onOpenChange, onImportComplete }
}

function chooseFile(file: File) {
  fireEvent.change(screen.getByLabelText(/response file/i), { target: { files: [file] } })
}

const xlsxFile = () => new File(["workbook-bytes"], "Alumni (Responses).xlsx")

async function checkFile(file = xlsxFile()) {
  chooseFile(file)
  fireEvent.click(screen.getByRole("button", { name: /check file/i }))
  await screen.findByRole("heading", { name: "Columns" })
  return file
}

describe("ResponseImportDialog", () => {
  beforeEach(() => {
    importMocks.preview.mockReset()
    importMocks.importResponses.mockReset()
  })

  it("rejects unsupported, empty, and oversized files before contacting the backend", () => {
    renderDialog()
    const checkButton = screen.getByRole("button", { name: /check file/i })
    expect(checkButton).toBeDisabled()

    chooseFile(new File(["%PDF"], "responses.pdf"))
    expect(screen.getByRole("alert")).toHaveTextContent(/\.xlsx or \.csv/i)
    expect(checkButton).toBeDisabled()

    chooseFile(new File([], "responses.csv"))
    expect(screen.getByRole("alert")).toHaveTextContent(/empty/i)

    chooseFile(new File([new Uint8Array(5 * 1024 * 1024 + 1)], "responses.xlsx"))
    expect(screen.getByRole("alert")).toHaveTextContent(/5 mib/i)
    expect(checkButton).toBeDisabled()

    chooseFile(new File(["Timestamp\n"], "RESPONSES.CSV"))
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    expect(checkButton).toBeEnabled()
    expect(importMocks.preview).not.toHaveBeenCalled()
  })

  it("previews with the chosen time zone and renders the grouped mapping", async () => {
    importMocks.preview.mockResolvedValue(basePreview())
    renderDialog()

    expect(screen.getByLabelText(/time zone/i)).toHaveDisplayValue("UTC+08:00 (Philippines)")
    fireEvent.change(screen.getByLabelText(/time zone/i), { target: { value: "-300" } })
    const file = await checkFile()

    expect(importMocks.preview).toHaveBeenCalledWith(SURVEY_ID, file, { utcOffsetMinutes: -300 })
    expect(screen.getByText("2 matched · 1 need a check · 0 not imported")).toBeInTheDocument()
    expect(screen.getByText("4 new · 1 to update · 0 unchanged · 0 merged · 0 need review · 0 with errors")).toBeInTheDocument()
    expect(screen.getByText(/row 6 · same as an existing response \(matched by email\)/i)).toBeInTheDocument()

    const columnSelects = screen.getAllByLabelText(/^import column/i)
    expect(columnSelects.map((select) => select.id)).toEqual(["import-column-2", "import-column-0", "import-column-1"])

    const commentsSelect = screen.getByLabelText('Import column "Comments" as')
    expect(commentsSelect).toHaveDisplayValue("Don't import")
    expect(within(commentsSelect).getByRole("group", { name: "Experience" })).toBeInTheDocument()
    const ratings = within(commentsSelect).getByRole("group", { name: "Ratings" })
    expect(within(ratings).getByRole("option", { name: /rate each area \(cannot import\)/i })).toBeDisabled()
    expect(screen.getByLabelText('Import column "How was it?" as')).toHaveDisplayValue("How was it?")

    expect(screen.getByLabelText(/value to use for "great!"/i)).toHaveDisplayValue("Good (suggested)")
    expect(screen.queryByRole("combobox", { name: /^sheet$/i })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: /import 4 new · update 1/i })).toBeDisabled()
  })

  it("keeps edits as overrides and sends them only on Check again", async () => {
    importMocks.preview.mockResolvedValue(basePreview())
    renderDialog()
    const file = await checkFile()

    fireEvent.change(screen.getByLabelText('Import column "Comments" as'), { target: { value: "q-text" } })
    expect(importMocks.preview).toHaveBeenCalledOnce()
    expect(screen.getByText(/check again to apply your changes/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: /check again/i }))
    await waitFor(() => expect(importMocks.preview).toHaveBeenCalledTimes(2))
    expect(importMocks.preview).toHaveBeenLastCalledWith(SURVEY_ID, file, {
      utcOffsetMinutes: 480,
      overrides: { columns: { "2": "q-text" }, values: { "q-choice": { "Great!": "Good" } } },
    })
  })

  it("re-runs the preview for another sheet without old overrides", async () => {
    importMocks.preview.mockResolvedValue(basePreview({ sheet_names: ["Form Responses 1", "Archive"] }))
    renderDialog()
    const file = await checkFile()

    fireEvent.change(screen.getByLabelText('Import column "Comments" as'), { target: { value: "q-text" } })
    fireEvent.change(screen.getByLabelText(/^sheet$/i), { target: { value: "Archive" } })

    await waitFor(() => expect(importMocks.preview).toHaveBeenCalledTimes(2))
    expect(importMocks.preview).toHaveBeenLastCalledWith(SURVEY_ID, file, { utcOffsetMinutes: 480, sheet: "Archive" })
  })

  it("enables import after value issues are resolved and commits the checked request", async () => {
    importMocks.preview.mockResolvedValueOnce(basePreview()).mockResolvedValueOnce(resolvedPreview)
    importMocks.importResponses.mockResolvedValue(importResult)
    const { onOpenChange, onImportComplete } = renderDialog()
    const file = await checkFile()

    fireEvent.change(screen.getByLabelText(/value to use for "great!"/i), { target: { value: "blank" } })
    fireEvent.click(screen.getByRole("button", { name: /check again/i }))
    await waitFor(() => expect(importMocks.preview).toHaveBeenCalledTimes(2))
    expect(importMocks.preview).toHaveBeenLastCalledWith(SURVEY_ID, file, {
      utcOffsetMinutes: 480,
      overrides: { columns: {}, values: { "q-choice": { "Great!": null } } },
    })

    const importButton = await screen.findByRole("button", { name: "Import 4 new · update 1" })
    await waitFor(() => expect(importButton).toBeEnabled())
    fireEvent.click(importButton)

    await waitFor(() => expect(onImportComplete).toHaveBeenCalledWith(importResult))
    expect(importMocks.importResponses).toHaveBeenCalledWith(SURVEY_ID, file, {
      utcOffsetMinutes: 480,
      structureVersion: "v2",
      overrides: { columns: {}, values: { "q-choice": { "Great!": null } } },
    })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("requires Check again after the survey changed", async () => {
    importMocks.preview.mockResolvedValue(resolvedPreview)
    importMocks.importResponses.mockRejectedValue(new ApiError("Survey changed.", 409, {
      data: null,
      message: "Survey changed.",
      errors: [{ row: null, column: null, code: "survey_changed", message: "Survey changed." }],
      meta: {},
    }))
    const { onImportComplete } = renderDialog()
    await checkFile()

    fireEvent.click(screen.getByRole("button", { name: "Import 4 new · update 1" }))
    expect(await screen.findByRole("alert")).toHaveTextContent(/questions changed.*check again/i)
    expect(screen.getByRole("button", { name: "Import 4 new · update 1" })).toBeDisabled()
    expect(onImportComplete).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: /check again/i }))
    await waitFor(() => expect(importMocks.preview).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.getByRole("button", { name: "Import 4 new · update 1" })).toBeEnabled())
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })

  it("treats an import conflict as a reason to check again", async () => {
    importMocks.preview.mockResolvedValue(resolvedPreview)
    importMocks.importResponses.mockRejectedValue(new ApiError("Conflict.", 409, {
      errors: [{ row: null, column: null, code: "import_conflict", message: "Conflict." }],
    }))
    renderDialog()
    await checkFile()

    fireEvent.click(screen.getByRole("button", { name: "Import 4 new · update 1" }))
    expect(await screen.findByRole("alert")).toHaveTextContent(/check again/i)
    expect(screen.getByRole("button", { name: "Import 4 new · update 1" })).toBeDisabled()
  })

  it("shows row errors, skipped rows, and the personal data notice", async () => {
    importMocks.preview.mockResolvedValue(basePreview({
      value_issues: [],
      can_import: true,
      rows: { total: 6, new: 4, will_update: 0, unchanged: 0, merged_in_file: 0, needs_review: 0, invalid: 2 },
      error_count: 2,
      errors: [
        { row: 3, column: "Consent", code: "consent_declined", message: "Consent was declined." },
        { row: 5, column: "Year", code: "invalid_answer", message: "Enter a number." },
      ],
      includes_personal_data: true,
      warnings: ["2 rows with errors will be skipped.", "Some timestamps are in the future."],
    }))
    renderDialog()
    await checkFile()

    expect(screen.getByText(/row 3 · consent:/i)).toBeInTheDocument()
    expect(screen.getAllByText("2 rows with errors will be skipped.")).toHaveLength(2)
    expect(screen.getByText("Some timestamps are in the future.")).toBeInTheDocument()
    expect(screen.getByText(/anyone with raw response access can see it/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Import 4 new" })).toBeEnabled()
  })

  it("shows request errors and blocks closing while a request runs", async () => {
    let rejectPreview: ((reason: unknown) => void) | undefined
    importMocks.preview.mockImplementation(() => new Promise((_, reject) => { rejectPreview = reject }))
    const { onOpenChange } = renderDialog()
    chooseFile(xlsxFile())
    fireEvent.click(screen.getByRole("button", { name: /check file/i }))

    expect(screen.getByRole("button", { name: /close import dialog/i })).toBeDisabled()
    expect(screen.getByRole("button", { name: /cancel/i })).toBeDisabled()
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" })
    expect(onOpenChange).not.toHaveBeenCalled()

    rejectPreview?.(new ApiError("The file has problems.", 422, {
      errors: [{ row: null, column: "Timestamp", code: "missing_timestamp", message: "No timestamp column." }],
    }))
    expect(await screen.findByRole("alert")).toHaveTextContent("The file has problems.")
    expect(screen.getByText(/column timestamp:/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /close import dialog/i })).toBeEnabled()
  })
})
