import { ApiError } from "@/lib/api"
import { MAX_IMPORT_FILE_BYTES } from "@/lib/response-import-limits"
import type {
  SurveyResponseImportColumn,
  SurveyResponseImportColumnStatus,
  SurveyResponseImportIssue,
  SurveyResponseImportMatch,
  SurveyResponseImportOverrides,
  SurveyResponseImportPreview,
  SurveyResponseImportQuestion,
  SurveyResponseImportResult,
  SurveyResponseImportRowSummary,
  SurveyResponseImportValueIssue,
} from "@/lib/surveys"

export { MAX_IMPORT_FILE_BYTES } from "@/lib/response-import-limits"
export const IMPORT_FILE_ACCEPT = ".xlsx,.csv"

/** Column target keywords; any other override value is a question UUID. */
export const COLUMN_TARGET_SUBMITTED_AT = "submitted_at"
export const COLUMN_TARGET_MATCH_ONLY = "match_only"
export const COLUMN_TARGET_IGNORE = "ignore"

export type ValueOverrides = SurveyResponseImportOverrides["values"]
export type ColumnOverrides = SurveyResponseImportOverrides["columns"]

/** Returns an error message when the file cannot be sent, or null when it can. */
export function validateImportFile(file: File): string | null {
  const name = file.name.toLowerCase()
  if (!name.endsWith(".xlsx") && !name.endsWith(".csv")) {
    return "Choose an .xlsx or .csv file."
  }
  if (file.size === 0) return "This file is empty. Choose a file that contains responses."
  if (file.size > MAX_IMPORT_FILE_BYTES) return "This file is larger than the 4 MiB limit."
  return null
}

function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? "-" : "+"
  const absolute = Math.abs(minutes)
  const hours = String(Math.floor(absolute / 60)).padStart(2, "0")
  const rest = String(absolute % 60).padStart(2, "0")
  return `UTC${sign}${hours}:${rest}`
}

const OFFSET_HINTS: Record<number, string> = {
  0: "UTC",
  480: "Philippines",
}

const UTC_OFFSETS_MINUTES = [
  -720, -660, -600, -570, -540, -480, -420, -360, -300, -240, -210, -180, -120, -60,
  0, 60, 120, 180, 210, 240, 270, 300, 330, 345, 360, 390, 420, 480, 540, 570, 600, 630,
  660, 720, 780, 840,
]

export const UTC_OFFSET_OPTIONS = UTC_OFFSETS_MINUTES.map((minutes) => {
  const hint = OFFSET_HINTS[minutes]
  return { value: minutes, label: hint ? `${formatOffset(minutes)} (${hint})` : formatOffset(minutes) }
})

export function utcOffsetLabel(minutes: number): string {
  return UTC_OFFSET_OPTIONS.find((option) => option.value === minutes)?.label ?? formatOffset(minutes)
}

/** The select value that represents the column's current target. */
export function columnTargetValue(column: SurveyResponseImportColumn): string {
  if (column.target === "question" && column.question_id) return column.question_id
  if (column.target === "question") return COLUMN_TARGET_IGNORE
  return column.target
}

export interface QuestionGroup {
  sectionTitle: string
  questions: SurveyResponseImportQuestion[]
}

/** Groups questions by section, keeping the server order. */
export function groupQuestionsBySection(questions: SurveyResponseImportQuestion[]): QuestionGroup[] {
  const groups: QuestionGroup[] = []
  for (const question of questions) {
    const sectionTitle = question.section_title || "Untitled section"
    const last = groups.at(-1)
    if (last && last.sectionTitle === sectionTitle) {
      last.questions.push(question)
    } else {
      groups.push({ sectionTitle, questions: [question] })
    }
  }
  return groups
}

const STATUS_ORDER: Record<SurveyResponseImportColumnStatus, number> = {
  unmatched: 0,
  check: 0,
  matched: 1,
  ignored: 2,
}

/** Columns that need attention first; otherwise spreadsheet order. */
export function sortColumnsForReview(columns: SurveyResponseImportColumn[]): SurveyResponseImportColumn[] {
  return [...columns].sort(
    (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.index - b.index,
  )
}

export interface ColumnCounts {
  matched: number
  needsCheck: number
  notImported: number
}

export function countColumns(columns: SurveyResponseImportColumn[]): ColumnCounts {
  let matched = 0
  let needsCheck = 0
  let notImported = 0
  for (const column of columns) {
    if (column.status === "matched") matched += 1
    else if (column.status === "ignored") notImported += 1
    else needsCheck += 1
  }
  return { matched, needsCheck, notImported }
}

/** The answer chosen for a value issue: a string option, null (leave blank), or undefined (unresolved). */
export function valueIssueChoice(
  issue: SurveyResponseImportValueIssue,
  valueOverrides: ValueOverrides,
): string | null | undefined {
  const chosen = valueOverrides[issue.question_id]
  if (chosen && Object.hasOwn(chosen, issue.raw_value)) return chosen[issue.raw_value]
  return issue.suggestion ?? undefined
}

export function valueIssueKey(issue: SurveyResponseImportValueIssue): string {
  return `${issue.question_id}\u0000${issue.raw_value}`
}

/** Stored value choices plus the preselected suggestion for each issue still open. */
export function effectiveValueOverrides(
  issues: SurveyResponseImportValueIssue[],
  valueOverrides: ValueOverrides,
): ValueOverrides {
  const next: ValueOverrides = {}
  for (const [questionId, values] of Object.entries(valueOverrides)) {
    next[questionId] = { ...values }
  }
  for (const issue of issues) {
    const choice = valueIssueChoice(issue, valueOverrides)
    if (choice === undefined) continue
    next[issue.question_id] = { ...next[issue.question_id], [issue.raw_value]: choice }
  }
  return next
}

export function buildOverrides(
  columns: ColumnOverrides,
  values: ValueOverrides,
): SurveyResponseImportOverrides | undefined {
  if (Object.keys(columns).length === 0 && Object.keys(values).length === 0) return undefined
  return { columns, values }
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`
}

export function rowSummaryText(rows: SurveyResponseImportRowSummary): string {
  return [
    `${rows.new} new`,
    `${rows.will_update} to update`,
    `${rows.unchanged} unchanged`,
    `${rows.merged_in_file} merged`,
    `${rows.needs_review} need review`,
    `${rows.invalid} with errors`,
  ].join(" · ")
}

/** Rows with errors are skipped on import; they do not block it. */
export function skippedRowsText(rows: SurveyResponseImportRowSummary): string | null {
  if (rows.invalid === 0) return null
  return `${plural(rows.invalid, "row")} with errors will be skipped.`
}

export function importButtonLabel(preview: SurveyResponseImportPreview): string {
  const { new: created, will_update: updated } = preview.rows
  if (created === 0 && updated > 0) return `Update ${updated}`
  return updated > 0 ? `Import ${created} new · update ${updated}` : `Import ${created} new`
}

export function importResultText(result: SurveyResponseImportResult): string {
  const parts = [`${plural(result.imported_count, "new response")} imported`]
  if (result.updated_count > 0) parts.push(`${result.updated_count} updated`)
  if (result.unchanged_count > 0) parts.push(`${result.unchanged_count} unchanged`)
  if (result.merged_in_file_count > 0) parts.push(`${result.merged_in_file_count} merged in the file`)
  if (result.filled_answer_count > 0) parts.push(`${plural(result.filled_answer_count, "blank answer")} filled`)
  return parts.join(" · ")
}

export function issueLocation(issue: SurveyResponseImportIssue): string {
  if (issue.row !== null && issue.row > 0) {
    return issue.column ? `Row ${issue.row} · ${issue.column}` : `Row ${issue.row}`
  }
  return issue.column ? `Column ${issue.column}` : "File"
}

const MATCH_RULE_LABELS: Record<SurveyResponseImportMatch["matched_by"], string> = {
  email: "email",
  contact_number: "contact number",
  name: "name",
  answers: "all answers",
}

export function matchText(match: SurveyResponseImportMatch): string {
  const target = match.target === "existing"
    ? "an existing response"
    : match.target_row !== null ? `row ${match.target_row}` : "an earlier row"
  const outcome = match.action === "unchanged"
    ? "no change"
    : `fills ${plural(match.filled_answer_count, "blank answer")}`
  const kept = match.conflict_count > 0 ? ` · ${plural(match.conflict_count, "answer")} kept` : ""
  return `Row ${match.row} · same as ${target} (matched by ${MATCH_RULE_LABELS[match.matched_by]}) · ${outcome}${kept}`
}

export interface ImportRequestError {
  message: string
  issues: SurveyResponseImportIssue[]
  /** The checked preview is out of date (survey or saved responses changed); check again before importing. */
  needsRecheck: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function toIssue(value: unknown): SurveyResponseImportIssue | null {
  if (!isRecord(value) || typeof value.message !== "string") return null
  return {
    row: typeof value.row === "number" ? value.row : null,
    column: typeof value.column === "string" ? value.column : null,
    code: typeof value.code === "string" ? value.code : "",
    message: value.message,
  }
}

export const SURVEY_CHANGED_MESSAGE =
  "The survey questions changed after this file was checked. Select Check again before you import."
export const IMPORT_CONFLICT_MESSAGE =
  "Saved responses changed after this file was checked. Select Check again before you import."

/** Normalizes a failed preview or import request for display. */
export function importRequestError(error: unknown, fallback: string): ImportRequestError {
  if (!(error instanceof ApiError)) {
    return { message: error instanceof Error ? error.message : fallback, issues: [], needsRecheck: false }
  }
  const body = isRecord(error.body) ? error.body : {}
  const rawErrors = Array.isArray(body.errors) ? body.errors : []
  const codes = new Set(rawErrors.flatMap((item) => (isRecord(item) && typeof item.code === "string" ? [item.code] : [])))
  if (typeof body.code === "string") codes.add(body.code)
  if (error.status === 409 && codes.has("survey_changed")) {
    return { message: SURVEY_CHANGED_MESSAGE, issues: [], needsRecheck: true }
  }
  if (error.status === 409) {
    return { message: IMPORT_CONFLICT_MESSAGE, issues: [], needsRecheck: true }
  }
  const issues = rawErrors.flatMap((item) => {
    const issue = toIssue(item)
    return issue ? [issue] : []
  })
  return { message: error.message || fallback, issues, needsRecheck: false }
}
