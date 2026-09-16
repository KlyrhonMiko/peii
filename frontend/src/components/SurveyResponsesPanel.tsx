import { useRef, useState } from "react"
import type { ChangeEvent } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  CheckCircle2,
  CircleAlert,
  Download,
  FileSearch,
  FileUp,
  Loader2,
  TriangleAlert,
  Upload,
  Users,
} from "lucide-react"
import { formatDate } from "@/lib/utils"
import { buildAggregatePresentation } from "@/lib/survey-aggregates"
import {
  downloadSurveyResponseImportTemplate,
  importSurveyResponses,
  validateSurveyResponseImport,
} from "@/lib/surveys"
import { toast } from "sonner"
import type {
  ApiPagination,
  Survey,
  SurveyQuestion,
  SurveyResponse,
  SurveyResponseIdentity,
  SurveyResponseAggregate,
  SurveyResponseImportValidation,
} from "@/lib/surveys"
import type { SurveyCapabilities } from "./survey-management/types"

export interface SurveyResponsesPanelProps {
  survey: Survey
  capabilities: Pick<SurveyCapabilities, "readAggregates" | "readRaw" | "readIdentity" | "export" | "import" | "erase">
  aggregates: SurveyResponseAggregate[]
  responses: SurveyResponse[]
  identities: SurveyResponseIdentity[]
  responsePagination: ApiPagination | null
  aggregateLoading: boolean
  rawLoading: boolean
  aggregateError: string | null
  rawError: string | null
  rawLoaded: boolean
  identityLoading: boolean
  identityError: string | null
  identityLoaded: boolean
  selectedResponseIds: string[]
  responseAction: "export" | "erase" | null
  onImportComplete: () => Promise<void> | void
  onLoadRaw: (offset?: number) => void
  onLoadIdentity: (offset?: number) => void
  onPageChange: (offset: number) => void
  onExport: () => void
  onErase: (scope: "selected" | "all") => void
  onToggleSelection: (responseId: string, selected: boolean) => void
}

const MAX_CSV_IMPORT_BYTES = 2 * 1024 * 1024

type ImportStatus = "idle" | "validating" | "importing" | "downloading"

function importErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

function displayImportIssue(issue: { row: number | null; column: string | null; message: string }): string {
  const location = issue.row !== null && issue.row > 0
    ? `Row ${issue.row}${issue.column ? ` · ${issue.column}` : ""}`
    : issue.column
      ? `Column ${issue.column}`
      : "File"
  return `${location}: ${issue.message}`
}

function defaultImportFilename(title: string): string {
  const safeTitle = title.trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase()
  return `${safeTitle || "survey"}-responses.csv`
}

const AGGREGATE_QUESTION_TYPES = new Set([
  "single_choice",
  "boolean",
  "multiple_choice",
  "scale",
  "ranking",
  "matrix",
  "text",
  "number",
  "datetime",
])

function isAggregateSupported(question: SurveyQuestion): boolean {
  return AGGREGATE_QUESTION_TYPES.has(question.type)
}

function questionsForSurvey(survey: Survey): SurveyQuestion[] {
  return survey.sections?.flatMap((section) => section.questions) ?? survey.questions ?? []
}

function formatAnswer(answer: unknown): string {
  if (answer === null || answer === undefined || answer === "") return "No answer"
  if (Array.isArray(answer)) return answer.map(formatAnswer).join(", ")
  if (typeof answer === "object") {
    return Object.entries(answer)
      .map(([key, value]) => `${key}: ${formatAnswer(value)}`)
      .join("; ")
  }
  return String(answer)
}

function IdentityDetails({ identity }: { identity: SurveyResponseIdentity }) {
  const hasIdentity = identity.identityAvailable !== false &&
    (identity.displayName !== null || identity.email !== null || identity.provider !== null)

  return (
    <div className="grid gap-1 rounded-md border border-primary/10 bg-primary/5 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <dt className="font-medium text-muted-foreground">Respondent identity</dt>
      <dd className="break-words text-foreground">
        {hasIdentity ? (
          <span>
            <span>{identity.displayName ?? "Verified respondent"}</span>
            {identity.email && <><span aria-hidden="true"> · </span><span>{identity.email}</span></>}
          </span>
        ) : (
          <span className="text-muted-foreground">Identity is not available for this response.</span>
        )}
      </dd>
    </div>
  )
}

function ResponseBar({ label, count, total }: { label: string; count: number; total: number }) {
  const percentage = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-slate-100 py-3 text-[14px] last:border-0">
      <div className="min-w-0 flex-1 truncate text-slate-700">{label}</div>
      <div className="flex shrink-0 items-baseline gap-4">
        <span className="text-slate-400">({count})</span>
        <span className="w-8 text-right font-semibold text-slate-900">{percentage}%</span>
      </div>
    </div>
  )
}

function AggregateQuestion({
  question,
  aggregate,
}: {
  question: SurveyQuestion
  aggregate: SurveyResponseAggregate | undefined
}) {
  if (!isAggregateSupported(question)) {
    return <p className="py-2 text-[14px] text-slate-500">Aggregates are unavailable for this question type.</p>
  }

  if (!aggregate) {
    return <p className="py-2 text-[14px] text-slate-500">No aggregate values are available.</p>
  }

  const presentation = buildAggregatePresentation(aggregate, question)
  if (presentation.kind === "empty") {
    return <p className="py-2 text-[14px] text-slate-500">No aggregate values are available.</p>
  }

  if (presentation.kind === "list") {
    return (
      <div className="max-h-96 space-y-2 overflow-y-auto py-2 pr-2">
        {presentation.items.map((item, index) => (
          <div key={index} className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-[14px] text-slate-700">
            {item.label}
            {item.count > 1 && <span className="ml-2 font-medium text-slate-400">({item.count} responses)</span>}
          </div>
        ))}
      </div>
    )
  }

  if (presentation.kind === "bars") {
    return (
      <div className="space-y-1">
        {presentation.items.map((item) => (
          <ResponseBar key={item.key} label={item.label} count={item.count} total={presentation.total} />
        ))}
      </div>
    )
  }

  if (presentation.kind === "ranking") {
    return (
      <div className="space-y-5">
        {presentation.rows.map((row) => (
          <div key={row.rank} className="space-y-2">
            <p className="text-sm font-semibold text-slate-700">Rank {row.rank}</p>
            <div className="pl-3">
              {row.cells.map((item) => (
                <ResponseBar key={item.key} label={item.label} count={item.count} total={presentation.total} />
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {presentation.rows.map((row) => (
        <div key={row.row} className="space-y-2">
          <p className="text-sm font-semibold text-slate-700">{row.row}</p>
          <div className="pl-3">
            {row.cells.map((item) => (
              <ResponseBar key={item.key} label={item.label} count={item.count} total={presentation.total} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function AggregateSection({
  survey,
  aggregates,
  loading,
  error,
  canReadAggregates,
}: Pick<SurveyResponsesPanelProps, "survey" | "aggregates"> & {
  loading: boolean
  error: string | null
  canReadAggregates: boolean
}) {
  const questions = questionsForSurvey(survey)

  if (!canReadAggregates) {
    return (
      <div className="rounded-lg border border-slate-200/80 bg-slate-50/70 px-4 py-3 text-sm text-slate-500">
        Aggregate results are unavailable for this account. Load raw records to inspect individual responses when permitted.
      </div>
    )
  }

  if (loading) {
    return <div className="rounded-lg border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500" role="status">Loading aggregate results...</div>
  }

  if (error) {
    return <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</div>
  }

  if (questions.length === 0) {
    return <div className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">No questions are available for this survey.</div>
  }

  const aggregateByQuestion = new Map(aggregates.map((aggregate) => [aggregate.question_id, aggregate]))
  return (
    <div className="space-y-10">
      {survey.sections?.map((section, sectionIndex) => (
        <div key={section.id || sectionIndex} className="space-y-5">
          <h5 className="border-b border-slate-200 pb-4 text-xl font-semibold text-slate-900">
            {section.title || `Section ${sectionIndex + 1}`}
          </h5>
          {section.questions.map((question, questionIndex) => (
            <div key={question.id || questionIndex} className="relative py-4">
              <p className="mb-6 text-[15px] font-medium text-slate-900">{questionIndex + 1}. {question.text}</p>
              <AggregateQuestion question={question} aggregate={aggregateByQuestion.get(question.id)} />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function RawRecordsSection({
  survey,
  responses,
  responsePagination: pagination,
  loading,
  error,
  loaded,
  canReadRaw,
  canReadIdentity,
  canErase,
  identities,
  identityLoading,
  identityError,
  identityLoaded,
  selectedResponseIds,
  responseAction,
  responseBusy,
  onLoadRaw,
  onLoadIdentity,
  onPageChange,
  onErase,
  onToggleSelection,
}: Pick<SurveyResponsesPanelProps, "survey" | "responses" | "responsePagination" | "selectedResponseIds" | "responseAction" | "onLoadRaw" | "onLoadIdentity" | "onPageChange" | "onErase" | "onToggleSelection" | "identities" | "identityLoading" | "identityError" | "identityLoaded"> & {
  loading: boolean
  error: string | null
  loaded: boolean
  canReadRaw: boolean
  canReadIdentity: boolean
  canErase: boolean
  responseBusy: boolean
}) {
  if (!canReadRaw) return null

  const questions = new Map(questionsForSurvey(survey).map((question) => [question.id, question.text]))
  const limit = pagination?.limit ?? 25
  const offset = pagination?.offset ?? 0
  const page = Math.floor(offset / Math.max(limit, 1)) + 1
  const totalPages = pagination ? Math.max(1, Math.ceil(pagination.total / Math.max(limit, 1))) : 1
  const identityByResponseId = new Map(identities.map((identity) => [identity.id, identity]))

  return (
    <section className="space-y-4 border-t border-slate-200/70 pt-8" aria-labelledby="raw-records-heading">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h4 id="raw-records-heading" className="text-sm font-semibold tracking-tight text-slate-900">Raw records</h4>
          <p className="mt-1 text-[13px] text-slate-500">Load one page at a time. Only the current page is retained here.</p>
        </div>
        <div className="flex items-center gap-2">
          {canErase && <span className="text-[13px] text-slate-500">Up to 100 records can be selected</span>}
          {canReadIdentity && loaded && (
            <Button variant="outline" size="sm" onClick={() => onLoadIdentity(offset)} disabled={identityLoading || loading}>
              {identityLoading ? <Loader2 className="animate-spin" /> : null}
              {identityLoaded ? "Refresh respondent identity" : "Load respondent identity"}
            </Button>
          )}
          {loaded && (
            <Button variant="outline" size="sm" onClick={() => onLoadRaw(offset)} disabled={loading}>
              Load raw records
            </Button>
          )}
          {loaded && selectedResponseIds.length > 0 && canErase && (
            <Button variant="destructive" size="sm" onClick={() => onErase("selected")} disabled={responseBusy}>
              {responseAction === "erase" ? <Loader2 className="animate-spin" /> : null}
              Erase ({selectedResponseIds.length})
            </Button>
          )}
        </div>
      </div>

      {!loaded && !loading && (
        <div className="rounded-lg border border-dashed border-slate-200 bg-white px-4 py-5 text-sm text-slate-500">
          Raw responses are not loaded. Select the button when you need to inspect individual records.
          <div className="mt-3">
            <Button size="sm" variant="outline" onClick={() => onLoadRaw(0)}>
              <FileSearch data-icon="inline-start" />
              Load raw records
            </Button>
          </div>
        </div>
      )}

      {loading && <div className="rounded-lg border border-slate-200 bg-white px-4 py-5 text-sm text-slate-500" role="status">Loading raw records...</div>}
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</div>}
      {identityError && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{identityError}</div>}

      {loaded && !loading && !error && (
        responses.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">No raw records are available on this page.</div>
        ) : (
          <>
            <div className="space-y-2">
              {responses.map((response) => {
                const identity = identityByResponseId.get(response.id)

                return (
                  <details key={response.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                    <summary className="flex cursor-pointer list-none items-center gap-3 text-slate-700 [&::-webkit-details-marker]:hidden">
                      {canErase && (
                        <input
                          type="checkbox"
                          aria-label={`Select response ${response.id}`}
                          checked={selectedResponseIds.includes(response.id)}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) => onToggleSelection(response.id, event.target.checked)}
                        />
                      )}
                      <span>{formatDate(response.createdAt)}</span>
                      <span className="truncate text-slate-400">{response.id}</span>
                      <span className="ml-auto text-xs text-slate-400">Inspect answers</span>
                    </summary>
                    <dl className="mt-3 space-y-2 border-t border-slate-100 pt-3 text-[13px]">
                      {identity && <IdentityDetails identity={identity} />}
                      {Object.entries(response.answers).length === 0 ? (
                        <div className="text-slate-500">No answers recorded.</div>
                      ) : Object.entries(response.answers).map(([questionId, answer]) => (
                        <div key={questionId} className="grid gap-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                          <dt className="font-medium text-slate-500">{questions.get(questionId) ?? questionId}</dt>
                          <dd className="break-words text-slate-700">{formatAnswer(answer)}</dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                )
              })}
            </div>
            {pagination && (
              <div className="flex items-center justify-between gap-3 text-sm text-slate-500">
                <span>Page {page} of {totalPages} · {pagination.total} total records</span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => onPageChange(Math.max(0, offset - limit))} disabled={!pagination.has_prev || loading}>
                    Previous page
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => onPageChange(offset + limit)} disabled={!pagination.has_next || loading}>
                    Next page
                  </Button>
                </div>
              </div>
            )}
          </>
        )
      )}
    </section>
  )
}

export function SurveyResponsesPanel({
  survey,
  capabilities,
  aggregates,
  responses,
  responsePagination,
  aggregateLoading,
  rawLoading,
  aggregateError,
  rawError,
  rawLoaded,
  identities,
  identityLoading,
  identityError,
  identityLoaded,
  selectedResponseIds,
  responseAction,
  onImportComplete,
  onLoadRaw,
  onLoadIdentity,
  onPageChange,
  onExport,
  onErase,
  onToggleSelection,
}: SurveyResponsesPanelProps) {
  const { readAggregates, readRaw, readIdentity = false, export: canExport, erase: canErase } = capabilities
  const canImport = capabilities.import && !survey.isDeleted && survey.isTemplate !== true
  const hasResponseCapability = readAggregates || readRaw || canExport || canErase || canImport

  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [selectedImportFile, setSelectedImportFile] = useState<File | null>(null)
  const [importCsvText, setImportCsvText] = useState<string | null>(null)
  const [importStatus, setImportStatus] = useState<ImportStatus>("idle")
  const [importValidation, setImportValidation] = useState<SurveyResponseImportValidation | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const responseBusy = responseAction !== null || importStatus !== "idle"

  const resetImportState = () => {
    setSelectedImportFile(null)
    setImportCsvText(null)
    setImportValidation(null)
    setImportError(null)
    setImportStatus("idle")
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const closeImportDialog = () => {
    if (importStatus === "validating" || importStatus === "importing" || importStatus === "downloading") return
    setImportDialogOpen(false)
    resetImportState()
  }

  const handleDownloadImportTemplate = async () => {
    if (!canImport || responseBusy) return
    setImportError(null)
    setImportStatus("downloading")
    try {
      const download = await downloadSurveyResponseImportTemplate(survey.id)
      if (!window.URL.createObjectURL) {
        throw new Error("Your browser cannot download the CSV template.")
      }
      const objectUrl = window.URL.createObjectURL(download.blob)
      const anchor = document.createElement("a")
      anchor.href = objectUrl
      anchor.download = download.filename ?? defaultImportFilename(survey.title)
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.URL.revokeObjectURL(objectUrl)
    } catch (error) {
      setImportError(importErrorMessage(error, "We could not download the CSV template."))
    } finally {
      setImportStatus("idle")
    }
  }

  const handleImportFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    setImportError(null)
    setImportValidation(null)
    setImportCsvText(null)
    setSelectedImportFile(null)
    if (!file) return

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setImportError("Choose a CSV file. XLSX and other workbook files are not supported.")
      return
    }
    if (file.size > MAX_CSV_IMPORT_BYTES) {
      setImportError("This CSV is larger than the 2 MiB import limit.")
      return
    }

    try {
      const decoder = new TextDecoder("utf-8", { fatal: true })
      const csvText = decoder.decode(await file.arrayBuffer())
      if (!csvText.trim()) {
        setImportError("Choose a CSV file that contains a header and at least one response row.")
        return
      }
      setSelectedImportFile(file)
      setImportCsvText(csvText)
    } catch {
      setImportError("The CSV must be UTF-8 encoded and readable.")
    }
  }

  const handleValidateImport = async () => {
    if (!importCsvText || responseBusy) return
    setImportError(null)
    setImportValidation(null)
    setImportStatus("validating")
    try {
      const validation = await validateSurveyResponseImport(survey.id, importCsvText)
      setImportValidation(validation)
    } catch (error) {
      setImportError(importErrorMessage(error, "We could not validate this CSV."))
    } finally {
      setImportStatus("idle")
    }
  }

  const handleCommitImport = async () => {
    if (
      !importCsvText ||
      !importValidation?.valid ||
      importValidation.error_count > 0 ||
      importValidation.errors.length > 0 ||
      responseBusy
    ) return
    setImportError(null)
    setImportStatus("importing")
    try {
      const result = await importSurveyResponses(survey.id, importCsvText)
      setImportDialogOpen(false)
      resetImportState()
      const countLabel = `${result.imported_count} response${result.imported_count === 1 ? "" : "s"}`
      try {
        await onImportComplete()
        // The response refresh is intentionally awaited so the modal count and
        // aggregate/raw panels do not display stale data after a successful import.
        toast.success(`${countLabel} imported successfully.`)
      } catch {
        setImportError(`${countLabel} imported, but the response view could not be refreshed. Reopen this survey to load the latest count.`)
        return
      }
      setImportStatus("idle")
    } catch (error) {
      setImportError(importErrorMessage(error, "We could not import these responses."))
      setImportStatus("idle")
      return
    }
  }

  if (!hasResponseCapability) {
    return <div className="rounded-xl border border-slate-200 bg-white px-5 py-8 text-center text-sm text-slate-500">You do not have permission to view survey responses.</div>
  }

  const canEraseAll = canErase && survey.isDeleted && survey.responses !== null && survey.responses > 0
  const canCommitImport = Boolean(
    importValidation?.valid &&
    importValidation.error_count === 0 &&
    importValidation.errors.length === 0,
  )

  return (
    <div className="space-y-10">
      <div className="flex flex-col justify-between gap-4 border-b border-slate-200/60 pb-6 sm:flex-row sm:items-end">
        <div>
          <h3 className="text-lg font-semibold tracking-tight text-slate-900">Response data</h3>
          <p className="mt-1 max-w-xl text-[14px] text-slate-500">
            {readAggregates
              ? "Aggregate results are shown first. Raw records are loaded only when explicitly requested."
              : readRaw
                ? "Raw response access is available. Load individual records only when needed."
                : "Response actions are available according to your assigned permissions."}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {canImport && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleDownloadImportTemplate()}
                disabled={responseBusy}
                title="Download a CSV shaped for this survey"
              >
                {importStatus === "downloading" ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Download data-icon="inline-start" />}
                Download CSV template
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { resetImportState(); setImportDialogOpen(true) }}
                disabled={responseBusy}
              >
                <Upload data-icon="inline-start" />
                Import CSV
              </Button>
            </>
          )}
          {canEraseAll && (
            <Button variant="destructive" size="sm" onClick={() => onErase("all")} disabled={responseBusy}>
              {responseAction === "erase" ? <Loader2 className="animate-spin" /> : null}
              Erase all
            </Button>
          )}
          {canExport && (
            <Button variant="outline" size="sm" onClick={onExport} disabled={responseBusy}>
              {responseAction === "export" ? <Loader2 className="animate-spin" /> : <Download />}
              Export
            </Button>
          )}
        </div>
      </div>

      <section aria-labelledby="aggregate-results-heading" className="space-y-5">
        <div>
          <h4 id="aggregate-results-heading" className="text-sm font-semibold tracking-tight text-slate-900">Aggregate results</h4>
          {survey.responses === 0 && <p className="mt-1 text-[13px] text-slate-500">No responses have been submitted yet.</p>}
        </div>
        <AggregateSection
          survey={survey}
          aggregates={aggregates}
          loading={aggregateLoading}
          error={aggregateError}
          canReadAggregates={readAggregates}
        />
      </section>

      <RawRecordsSection
        survey={survey}
        responses={responses}
        responsePagination={responsePagination}
        loading={rawLoading}
        error={rawError}
        loaded={rawLoaded}
        canReadRaw={readRaw}
        canReadIdentity={readIdentity}
        canErase={canErase}
        identities={identities}
        identityLoading={identityLoading}
        identityError={identityError}
        identityLoaded={identityLoaded}
        selectedResponseIds={selectedResponseIds}
        responseAction={responseAction}
        responseBusy={responseBusy}
        onLoadRaw={onLoadRaw}
        onLoadIdentity={onLoadIdentity}
        onPageChange={onPageChange}
        onErase={onErase}
        onToggleSelection={onToggleSelection}
      />

      {readAggregates && !aggregateLoading && !aggregateError && survey.responses === 0 && (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <Users className="mb-3 size-8 text-slate-300" strokeWidth={1.5} />
          <p className="text-base font-medium text-slate-900">Waiting for responses</p>
          <p className="mt-2 max-w-sm text-[14px] leading-relaxed text-slate-500">Aggregate breakdowns will appear after users submit their feedback.</p>
        </div>
      )}

      {importError && !importDialogOpen && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {importError}
        </div>
      )}

      <Dialog
        open={importDialogOpen}
        onOpenChange={(open) => !open && closeImportDialog()}
      >
        <DialogContent
          showCloseButton={false}
          className="flex max-h-[85dvh] w-[calc(100vw-2rem)] max-w-xl min-w-0 flex-col gap-0 overflow-hidden rounded-2xl border-0 bg-white p-0 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.1)] sm:max-w-xl"
        >
          <div className="flex min-w-0 shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-6 sm:py-5">
            <div className="min-w-0">
              <DialogTitle className="text-lg font-semibold text-slate-900">Import CSV responses</DialogTitle>
              <DialogDescription className="mt-1 text-sm leading-relaxed text-slate-500">
                Import rows into <span className="font-medium text-slate-700 [overflow-wrap:anywhere]">{survey.title}</span> only. Fill in the survey-specific template with at least one response row, then upload that CSV.
              </DialogDescription>
            </div>
            <Button variant="ghost" size="icon-sm" className="shrink-0" onClick={closeImportDialog} disabled={importStatus !== "idle"} aria-label="Close import dialog">
              <span aria-hidden="true">×</span>
            </Button>
          </div>

          <div className="flex min-h-0 min-w-0 flex-col gap-5 overflow-x-hidden overflow-y-auto px-4 py-5 sm:px-6 sm:py-6">
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
              <div className="flex items-start gap-2">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <div className="min-w-0 space-y-1">
                  <p className="font-medium">Imports always append responses.</p>
                  <p className="text-amber-800">Uploading the same CSV again is allowed and can double-count responses. The first imported response also locks this survey’s questions from future structural edits.</p>
                </div>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              className="self-start"
              onClick={() => void handleDownloadImportTemplate()}
              disabled={importStatus !== "idle"}
            >
              {importStatus === "downloading" ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Download data-icon="inline-start" />}
              {importStatus === "downloading" ? "Downloading template…" : "Download CSV template"}
            </Button>

            <div className="flex min-w-0 flex-col gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => void handleImportFileChange(event)}
                className="sr-only"
                aria-label="Choose CSV file"
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importStatus !== "idle"}
                >
                  <FileUp data-icon="inline-start" />
                  Choose CSV file
                </Button>
                {selectedImportFile && (
                  <span className="w-0 min-w-0 flex-1 truncate text-sm text-slate-600" title={selectedImportFile.name}>
                    {selectedImportFile.name}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">CSV only · UTF-8 · maximum 2 MiB. XLSX files and workbook sheets are not accepted.</p>
              <p className="text-xs text-slate-500">Keep <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[11px]">submitted_at</code> as an ISO-8601 timestamp with a timezone offset; the original date is used for retention.</p>
            </div>

            {importError && (
              <div className="flex min-w-0 items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700" role="alert">
                <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0 [overflow-wrap:anywhere]">{importError}</span>
              </div>
            )}

            {selectedImportFile && importCsvText && !importValidation && (
              <Button type="button" onClick={() => void handleValidateImport()} disabled={importStatus !== "idle"}>
                {importStatus === "validating" ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
                {importStatus === "validating" ? "Validating CSV…" : "Validate CSV"}
              </Button>
            )}

            {importValidation && (
              <div className="flex min-w-0 flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-3" role="status" aria-live="polite">
                <div className="flex items-start gap-2 text-sm">
                  {canCommitImport ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden="true" />
                  ) : (
                    <CircleAlert className="mt-0.5 size-4 shrink-0 text-red-600" aria-hidden="true" />
                  )}
                  <p className="font-medium text-slate-800">
                    {importValidation.row_count} data row{importValidation.row_count === 1 ? "" : "s"} found.
                    {canCommitImport ? " Ready to import." : " Fix the listed errors before importing."}
                  </p>
                </div>
                {importValidation.errors.length > 0 && (
                  <ul className="max-h-48 min-w-0 space-y-1 overflow-y-auto border-t border-slate-200 pt-2 text-xs text-red-700 [overflow-wrap:anywhere]">
                    {importValidation.errors.map((issue, index) => (
                      <li key={`${issue.row}-${issue.column ?? "file"}-${index}`}>{displayImportIssue(issue)}</li>
                    ))}
                  </ul>
                )}
                {canCommitImport && (
                  <Button type="button" onClick={() => void handleCommitImport()} disabled={importStatus !== "idle"}>
                    {importStatus === "importing" ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Upload data-icon="inline-start" />}
                    {importStatus === "importing" ? "Importing…" : `Import ${importValidation.row_count} response${importValidation.row_count === 1 ? "" : "s"}`}
                  </Button>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
