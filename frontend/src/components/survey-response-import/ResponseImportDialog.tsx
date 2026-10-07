"use client"

import { useId, useState } from "react"
import type { ChangeEvent } from "react"
import { ArrowLeft, CircleAlert, FileSearch, Loader2, RefreshCw, Upload, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { cn } from "@/lib/utils"
import {
  DEFAULT_IMPORT_UTC_OFFSET_MINUTES,
  importSurveyResponses,
  previewSurveyResponseImport,
} from "@/lib/surveys"
import type {
  SurveyResponseImportPreview,
  SurveyResponseImportResult,
  SurveyResponseImportValueIssue,
} from "@/lib/surveys"
import {
  IMPORT_FILE_ACCEPT,
  UTC_OFFSET_OPTIONS,
  buildOverrides,
  countColumns,
  effectiveValueOverrides,
  importButtonLabel,
  importRequestError,
  issueLocation,
  skippedRowsText,
  utcOffsetLabel,
  validateImportFile,
} from "./import-helpers"
import type { ColumnOverrides, ImportRequestError, ValueOverrides } from "./import-helpers"
import { ResponseImportMappingTable } from "./ResponseImportMappingTable"
import { ResponseImportSummary } from "./ResponseImportSummary"
import { ResponseImportValueIssues } from "./ResponseImportValueIssues"

type PendingAction = "checking" | "importing" | null

interface PreviewRequest {
  sheet: string | null
  columns: ColumnOverrides
  values: ValueOverrides
}

export interface ResponseImportDialogProps {
  surveyId: string
  surveyTitle: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Runs after a successful import, once the dialog has closed. */
  onImportComplete: (result: SurveyResponseImportResult) => Promise<void> | void
}

function RequestErrorDetails({ error }: { error: ImportRequestError }) {
  if (error.issues.length === 0) return null
  return (
    <ul className="flex max-h-40 min-w-0 flex-col gap-1 overflow-y-auto rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive [overflow-wrap:anywhere]">
      {error.issues.map((issue, index) => (
        <li key={`${issue.row ?? "file"}-${issue.column ?? ""}-${index}`}>
          <span className="font-medium">{issueLocation(issue)}:</span> {issue.message}
        </li>
      ))}
    </ul>
  )
}

export function ResponseImportDialog({
  surveyId,
  surveyTitle,
  open,
  onOpenChange,
  onImportComplete,
}: ResponseImportDialogProps) {
  const fieldId = useId()
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [utcOffsetMinutes, setUtcOffsetMinutes] = useState(DEFAULT_IMPORT_UTC_OFFSET_MINUTES)
  const [preview, setPreview] = useState<SurveyResponseImportPreview | null>(null)
  const [sheet, setSheet] = useState<string | null>(null)
  const [columnOverrides, setColumnOverrides] = useState<ColumnOverrides>({})
  const [valueOverrides, setValueOverrides] = useState<ValueOverrides>({})
  const [dirty, setDirty] = useState(false)
  const [needsRecheck, setNeedsRecheck] = useState(false)
  const [pending, setPending] = useState<PendingAction>(null)
  const [requestError, setRequestError] = useState<ImportRequestError | null>(null)
  const busy = pending !== null

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && busy) return
    onOpenChange(nextOpen)
  }

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null
    setRequestError(null)
    if (!nextFile) {
      setFile(null)
      setFileError(null)
      return
    }
    const error = validateImportFile(nextFile)
    setFileError(error)
    setFile(error ? null : nextFile)
    if (error) event.target.value = ""
  }

  const runPreview = async (request: PreviewRequest) => {
    if (!file || busy) return
    setPending("checking")
    setRequestError(null)
    const overrides = buildOverrides(request.columns, request.values)
    try {
      const nextPreview = await previewSurveyResponseImport(surveyId, file, {
        utcOffsetMinutes,
        ...(overrides ? { overrides } : {}),
        ...(request.sheet ? { sheet: request.sheet } : {}),
      })
      setPreview(nextPreview)
      setSheet(request.sheet)
      setColumnOverrides(request.columns)
      setValueOverrides(request.values)
      setDirty(false)
      setNeedsRecheck(false)
    } catch (error) {
      setRequestError(importRequestError(error, "We could not check this file."))
    } finally {
      setPending(null)
    }
  }

  const handleCheckFile = () => {
    void runPreview({ sheet: null, columns: {}, values: {} })
  }

  const handleCheckAgain = () => {
    if (!preview) return
    void runPreview({
      sheet,
      columns: columnOverrides,
      values: effectiveValueOverrides(preview.value_issues, valueOverrides),
    })
  }

  const handleSheetChange = (nextSheet: string) => {
    // Column indexes and values belong to one sheet, so a new sheet starts from the automatic mapping.
    void runPreview({ sheet: nextSheet, columns: {}, values: {} })
  }

  const handleColumnChange = (columnIndex: number, target: string) => {
    setColumnOverrides((current) => ({ ...current, [String(columnIndex)]: target }))
    setDirty(true)
  }

  const handleValueChange = (issue: SurveyResponseImportValueIssue, choice: string | null) => {
    setValueOverrides((current) => ({
      ...current,
      [issue.question_id]: { ...current[issue.question_id], [issue.raw_value]: choice },
    }))
    setDirty(true)
  }

  const handleChooseAnotherFile = () => {
    setPreview(null)
    setSheet(null)
    setColumnOverrides({})
    setValueOverrides({})
    setDirty(false)
    setNeedsRecheck(false)
    setRequestError(null)
  }

  const handleImport = async () => {
    if (!file || !preview || !preview.can_import || dirty || needsRecheck || busy) return
    setPending("importing")
    setRequestError(null)
    const overrides = buildOverrides(columnOverrides, valueOverrides)
    let result: SurveyResponseImportResult
    try {
      result = await importSurveyResponses(surveyId, file, {
        utcOffsetMinutes,
        structureVersion: preview.structure_version,
        ...(overrides ? { overrides } : {}),
        ...(sheet ? { sheet } : {}),
      })
    } catch (error) {
      const details = importRequestError(error, "We could not import these responses.")
      if (details.needsRecheck) setNeedsRecheck(true)
      setRequestError(details)
      setPending(null)
      return
    }
    setPending(null)
    onOpenChange(false)
    await onImportComplete(result)
  }

  const counts = preview ? countColumns(preview.columns) : null
  const skippedRows = preview ? skippedRowsText(preview.rows) : null
  const canImport = Boolean(preview?.can_import) && !dirty && !needsRecheck && !busy
  const importHint = !preview
    ? null
    : needsRecheck
      ? "Select Check again before you import."
      : dirty
        ? "Select Check again to apply your changes."
        : preview.value_issues.length > 0
          ? "Choose a value for each item under Values to fix, then select Check again."
          : !preview.can_import
            ? "Fix the problems listed above, then check the file again."
            : null

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[85dvh] w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] min-w-0 flex-col gap-0 overflow-hidden border-border bg-background p-0 sm:max-w-4xl"
      >
        <div className="flex min-w-0 shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-4 sm:px-6">
          <div className="flex min-w-0 flex-col gap-1">
            <DialogTitle className="text-lg text-foreground">Import responses</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Add responses from a Google Forms export to{" "}
              <span className="font-medium text-foreground [overflow-wrap:anywhere]">{surveyTitle}</span>.
              You review the column mapping before anything is saved.
            </DialogDescription>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            className="shrink-0"
            onClick={() => handleOpenChange(false)}
            disabled={busy}
            aria-label="Close import dialog"
          >
            <XIcon />
          </Button>
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-5 overflow-x-hidden overflow-y-auto px-4 py-5 sm:px-6">
          {!preview ? (
            <>
              <div className="flex min-w-0 flex-col gap-2 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">Export the responses from Google Forms</p>
                <ol className="flex list-decimal flex-col gap-1 pl-5">
                  <li>In the form, open <span className="text-foreground">Responses</span> and select <span className="text-foreground">View in Sheets</span>.</li>
                  <li>In Google Sheets, select <span className="text-foreground">File → Download</span>, then <span className="text-foreground">Microsoft Excel (.xlsx)</span> or <span className="text-foreground">Comma-separated values (.csv)</span>.</li>
                  <li>Upload the downloaded file. Do not change it first.</li>
                </ol>
              </div>

              <div className="flex min-w-0 flex-col gap-1.5">
                <label htmlFor={`${fieldId}-file`} className="text-sm font-medium text-foreground">Response file</label>
                <Input
                  id={`${fieldId}-file`}
                  type="file"
                  accept={IMPORT_FILE_ACCEPT}
                  onChange={handleFileChange}
                  disabled={busy}
                  aria-invalid={fileError ? true : undefined}
                  aria-describedby={`${fieldId}-file-help`}
                />
                <p id={`${fieldId}-file-help`} className="text-xs text-muted-foreground">
                  .xlsx or .csv · up to 5 MiB
                </p>
              </div>

              <div className="flex min-w-0 flex-col gap-1.5">
                <label htmlFor={`${fieldId}-offset`} className="text-sm font-medium text-foreground">Time zone of the timestamps</label>
                <NativeSelect
                  id={`${fieldId}-offset`}
                  className="w-full sm:w-72"
                  value={String(utcOffsetMinutes)}
                  disabled={busy}
                  onChange={(event) => setUtcOffsetMinutes(Number(event.target.value))}
                  aria-describedby={`${fieldId}-offset-help`}
                >
                  {UTC_OFFSET_OPTIONS.map((option) => (
                    <NativeSelectOption key={option.value} value={String(option.value)}>{option.label}</NativeSelectOption>
                  ))}
                </NativeSelect>
                <p id={`${fieldId}-offset-help`} className="text-xs text-muted-foreground">
                  Use the time zone of the Google Sheet. Timestamps in the file have no time zone.
                </p>
              </div>

              {fileError && (
                <div className="flex min-w-0 items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert">
                  <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 [overflow-wrap:anywhere]">{fileError}</span>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex min-w-0 flex-col gap-3">
                <div className="flex min-w-0 flex-col gap-1 text-sm">
                  <p className="truncate font-medium text-foreground" title={file?.name}>{file?.name}</p>
                  <p className="text-muted-foreground">
                    {preview.file_format.toUpperCase()} · {utcOffsetLabel(preview.utc_offset_minutes)}
                  </p>
                </div>
                {preview.sheet_names.length > 1 && (
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <label htmlFor={`${fieldId}-sheet`} className="text-sm font-medium text-foreground">Sheet</label>
                    <NativeSelect
                      id={`${fieldId}-sheet`}
                      className="w-full sm:w-72"
                      value={preview.sheet ?? preview.sheet_names[0] ?? ""}
                      disabled={busy}
                      onChange={(event) => handleSheetChange(event.target.value)}
                    >
                      {preview.sheet_names.map((name) => (
                        <NativeSelectOption key={name} value={name}>{name}</NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </div>
                )}
              </div>

              {requestError && <RequestErrorDetails error={requestError} />}

              <section className="flex min-w-0 flex-col gap-2" aria-labelledby={`${fieldId}-columns`}>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <h3 id={`${fieldId}-columns`} className="text-sm font-semibold text-foreground">Columns</h3>
                  {counts && (
                    <p className="text-sm text-muted-foreground">
                      {counts.matched} matched · {counts.needsCheck} need a check · {counts.notImported} not imported
                    </p>
                  )}
                </div>
                <ResponseImportMappingTable
                  columns={preview.columns}
                  questions={preview.questions}
                  columnOverrides={columnOverrides}
                  disabled={busy}
                  onColumnChange={handleColumnChange}
                />
              </section>

              {preview.value_issues.length > 0 && (
                <section className="flex min-w-0 flex-col gap-2" aria-labelledby={`${fieldId}-values`}>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <h3 id={`${fieldId}-values`} className="text-sm font-semibold text-foreground">Values to fix</h3>
                    <p className="text-sm text-muted-foreground">
                      These answers do not match a choice in the survey. Choose the matching choice or leave the answer blank.
                    </p>
                  </div>
                  <ResponseImportValueIssues
                    issues={preview.value_issues}
                    questions={preview.questions}
                    valueOverrides={valueOverrides}
                    disabled={busy}
                    onValueChange={handleValueChange}
                  />
                </section>
              )}

              <section className="flex min-w-0 flex-col gap-2" aria-labelledby={`${fieldId}-rows`}>
                <h3 id={`${fieldId}-rows`} className="text-sm font-semibold text-foreground">Rows</h3>
                <ResponseImportSummary preview={preview} />
              </section>
            </>
          )}

          {!preview && requestError && <RequestErrorDetails error={requestError} />}
        </div>

        <div className="flex min-w-0 shrink-0 flex-col gap-3 border-t border-border bg-muted/30 px-4 py-3 sm:px-6">
          {requestError && (
            <div className="flex min-w-0 items-start gap-2 text-sm text-destructive" role="alert">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 [overflow-wrap:anywhere]">{requestError.message}</span>
            </div>
          )}
          {!requestError && importHint && (
            <p className="text-xs text-muted-foreground">{importHint}</p>
          )}
          {preview && skippedRows && (
            <p className="text-xs font-medium text-foreground">{skippedRows}</p>
          )}
          <div
            className={cn(
              "gap-2 sm:flex sm:flex-row sm:items-center sm:justify-between",
              // On phones the review actions use a compact grid: Import on top, then the
              // two secondary actions side by side, so the scrolling body keeps its height.
              preview ? "grid grid-cols-2" : "flex flex-col-reverse",
            )}
          >
            {!preview ? (
              <>
                <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={busy}>
                  Cancel
                </Button>
                <Button onClick={handleCheckFile} disabled={!file || busy}>
                  {pending === "checking" ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <FileSearch data-icon="inline-start" />}
                  {pending === "checking" ? "Checking file…" : "Check file"}
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" className="order-2 sm:order-none" onClick={handleChooseAnotherFile} disabled={busy}>
                  <ArrowLeft data-icon="inline-start" />
                  Change file
                </Button>
                <div className="contents sm:flex sm:flex-row sm:gap-2">
                  <Button variant="outline" className="order-3 sm:order-none" onClick={handleCheckAgain} disabled={busy}>
                    {pending === "checking" ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}
                    {pending === "checking" ? "Checking…" : "Check again"}
                  </Button>
                  <Button className="order-1 col-span-2 sm:order-none" onClick={() => void handleImport()} disabled={!canImport}>
                    {pending === "importing" ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Upload data-icon="inline-start" />}
                    {pending === "importing" ? "Importing…" : importButtonLabel(preview)}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
