import { api, ApiError } from "@/lib/api"
import { MAX_IMPORT_FILE_BYTES, MAX_IMPORT_OVERRIDES_BYTES } from "@/lib/response-import-limits"

export type SurveyStatus = "Inactive" | "Active" | "Closed"

export const DEFAULT_RETENTION_ENABLED = true
export const DEFAULT_RETENTION_DAYS = 1825
export const TRACER_STUDY_SURVEY_TITLE = "GRADUATE TRACER STUDY SURVEY"

// ── Frontend-facing types (camelCase, matching existing UI) ──────

export interface SurveyResponse {
  id: string
  surveyId: string
  answers: Record<string, unknown>
  createdAt: string
}

export interface SurveyResponseIdentity extends SurveyResponse {
  provider: string | null
  email: string | null
  displayName: string | null
  emailVerified: boolean | null
  identityCapturedAt: string | null
  identityAvailable: boolean | null
}

export interface Survey {
  id: string
  surveyId: string
  title: string
  status: SurveyStatus
  responses: number | null
  hasResponseHistory?: boolean | null
  dateCreated: string
  updatedAt: string
  isDeleted: boolean
  retentionEnabled: boolean
  retentionDays: number
  targetCohort?: string
  isTemplate?: boolean
  description?: string
  isCta?: boolean
  questions?: SurveyQuestion[]
  sections?: SurveySection[]
}

export interface SurveyQuestion {
  id: string
  text: string
  type: string
  options?: string[] | null
  sectionId?: string
  surveyId?: string
  config?: Record<string, unknown> | null
  isRequired?: boolean
  orderIndex?: number
}

export interface SurveyScaleOption {
  value: number
  label: string | null
}

export function getScaleOptions(
  question: Pick<SurveyQuestion, "options" | "config">,
): SurveyScaleOption[] {
  const configuredMin = question.config?.min
  const configuredMax = question.config?.max
  const min = typeof configuredMin === "number" && Number.isInteger(configuredMin)
    ? configuredMin
    : 1
  const max = typeof configuredMax === "number" && Number.isInteger(configuredMax)
    ? configuredMax
    : question.options?.length ?? 4
  const rangeLength = max - min + 1

  if (rangeLength <= 0) return []

  return Array.from({ length: rangeLength }, (_, index) => {
    const value = min + index
    return {
      value,
      label: question.options?.[index] ?? null,
    }
  })
}

export interface SurveySection {
  id: string
  title: string
  description?: string
  orderIndex: number
  questions: SurveyQuestion[]
  surveyId?: string
}

// ── Raw API types (snake_case, matching backend) ─────────────────

export interface ApiSurvey {
  id: string
  survey_id: string
  title: string
  description: string | null
  status: SurveyStatus
  target_cohort: string | null
  responses_count: number | null
  has_response_history?: boolean | null
  created_at: string
  updated_at: string
  is_deleted: boolean
  deleted_at: string | null
  performed_by: string | null
  retention_enabled: boolean
  retention_days: number
  is_template?: boolean
  is_cta?: boolean
  questions?: ApiQuestion[]
  sections?: ApiSection[]
}

export interface ApiSection {
  id: string
  survey_id: string
  title: string
  description: string | null
  order_index: number
  questions: ApiQuestion[]
  is_deleted: boolean
  performed_by: string | null
}

export interface ApiQuestion {
  id: string
  survey_id: string
  question_text: string
  question_type: string
  options: string[] | null
  config: Record<string, unknown> | null
  order_index: number
  is_required: boolean
  is_deleted: boolean
  performed_by: string | null
  section_id: string
}

export interface ApiSurveyResponse {
  id: string
  survey_id: string
  answers: Record<string, unknown>
  created_at: string
}

export interface ApiSurveyResponseIdentity extends ApiSurveyResponse {
  provider?: string | null
  email?: string | null
  display_name?: string | null
  email_verified?: boolean | null
  identity_captured_at?: string | null
  identity_available?: boolean | null
}

export interface AggregateCell {
  value: string | number | boolean
  count: number
  rank: number | null
  row: string | null
}

export interface SurveyResponseAggregate {
  question_id: string
  question_text: string
  question_type: "single_choice" | "boolean" | "multiple_choice" | "scale" | "ranking" | "matrix"
  total: number
  cells: AggregateCell[]
}

export interface PEIIDomainScore {
  dimension: string
  pre_grad: number
  post_grad: number
}

export interface PEIICohortResult {
  batch_year: string
  domains: PEIIDomainScore[]
  peii_score: number
  peii_index: number | null
}

export interface PEIIDemographics {
  total_responses: number
  gender_distribution: Record<string, number>
  location_distribution: Record<string, number>
  department_distribution: Record<string, number>
  first_gen_distribution?: Record<string, number> | null
  barangay_distribution?: Record<string, number> | null
}

export interface FeedbackClassification {
  dimension: string
  positive: number
  neutral: number
  negative: number
}

export interface FeedbackClassificationData {
  classifications: FeedbackClassification[]
}

export interface PEIIHistoricalTrend {
  batch_year: string
  peii_score: number
  domains?: PEIIDomainScore[]
}

export interface QualitativeFeedback {
  response_id: string
  question_id: string
  question_text: string
  response_text: string
  sentiment_score: number
  is_false_positive: boolean
  dimension?: string
  is_placeholder?: boolean
}

export interface PEIIOutcomeDistributions {
  employment_stability: SurveyResponseAggregate | null
  degree_alignment: SurveyResponseAggregate | null
  monthly_income?: SurveyResponseAggregate | null
  time_to_first_job?: SurveyResponseAggregate | null
  job_search_channel?: SurveyResponseAggregate | null
  employment_status?: SurveyResponseAggregate | null
  employment_type?: SurveyResponseAggregate | null
  job_level?: SurveyResponseAggregate | null
  job_search_difficulty?: SurveyResponseAggregate | null
  work_location?: SurveyResponseAggregate | null
  top_industries?: SurveyResponseAggregate | null
}

export interface PEIIAnalyticsResponse {
  outcome_distributions: PEIIOutcomeDistributions
  cohort_result: PEIICohortResult
  baseline_result: PEIICohortResult | null
  historical_trend: PEIIHistoricalTrend[]
  demographics: PEIIDemographics | null
  feedback_classification: FeedbackClassificationData | null
  qualitative_feedback: QualitativeFeedback[]
  qualitative_feedback_total: number
  qualitative_feedback_truncated: boolean
  qualitative_feedback_placeholder_count?: number
}

export interface EraseSelectedResponsesPayload {
  scope: "selected"
  response_ids: string[]
  confirmation: "ERASE_SELECTED_RESPONSES"
}

export interface EraseAllResponsesPayload {
  scope: "all"
  expected_response_count: number
  confirmation: "ERASE_ALL_RESPONSES"
}

export type EraseResponsesPayload = EraseSelectedResponsesPayload | EraseAllResponsesPayload

export interface ResponseErasureResult {
  scope: "selected" | "all"
  requested_count: number
  erased_count: number
}

/** A location-aware issue from a response import check (`SurveyResponseImportError`). */
export interface SurveyResponseImportIssue {
  row: number | null
  column: string | null
  code: string
  message: string
}

export type SurveyResponseImportColumnTarget = "submitted_at" | "question" | "match_only" | "ignore"
export type SurveyResponseImportColumnStatus = "matched" | "check" | "unmatched" | "ignored"
export type SurveyResponseImportColumnMatch =
  | "timestamp"
  | "header"
  | "values"
  | "merged"
  | "fuzzy"
  | "manual"
  | "none"

/** How one spreadsheet column maps onto the survey. */
export interface SurveyResponseImportColumn {
  index: number
  header: string
  target: SurveyResponseImportColumnTarget
  question_id: string | null
  status: SurveyResponseImportColumnStatus
  match: SurveyResponseImportColumnMatch
  reason: string | null
  samples: string[]
}

/** A survey question that a spreadsheet column can be mapped to. */
export interface SurveyResponseImportQuestion {
  question_id: string
  section_title: string
  question_text: string
  question_type: string
  survey_phase: number | null
  mapped: boolean
  importable: boolean
}

/** A distinct cell value that does not match the mapped question's options. */
export interface SurveyResponseImportValueIssue {
  question_id: string
  column: string
  raw_value: string
  count: number
  suggestion: string | null
  options: string[]
}

/** Row outcomes; every non-blank data row is counted in exactly one bucket. */
export interface SurveyResponseImportRowSummary {
  total: number
  new: number
  will_update: number
  unchanged: number
  merged_in_file: number
  needs_review: number
  invalid: number
}

export type SurveyResponseImportMatchRule = "email" | "contact_number" | "name" | "answers"

/** A row recognized as the same respondent as an existing response or an earlier row. */
export interface SurveyResponseImportMatch {
  row: number
  matched_by: SurveyResponseImportMatchRule
  target: "existing" | "file"
  target_row: number | null
  action: "update" | "unchanged"
  filled_answer_count: number
  conflict_count: number
}

/** Column override value: `"submitted_at"`, `"match_only"`, `"ignore"`, or a question UUID. */
export type SurveyResponseImportColumnOverride = string

/**
 * User corrections on top of the automatic mapping. `columns` keys are zero-based column
 * indexes as strings; `values` maps question UUID to `{ raw value: option | null }`, where
 * `null` imports the cell as blank.
 */
export interface SurveyResponseImportOverrides {
  columns: Record<string, SurveyResponseImportColumnOverride>
  values: Record<string, Record<string, string | null>>
}

/** Dry-run result for a Google Forms export or other response spreadsheet. */
export interface SurveyResponseImportPreview {
  survey_id: string
  file_format: "xlsx" | "csv"
  sheet_names: string[]
  sheet: string | null
  utc_offset_minutes: number
  columns: SurveyResponseImportColumn[]
  questions: SurveyResponseImportQuestion[]
  value_issues: SurveyResponseImportValueIssue[]
  rows: SurveyResponseImportRowSummary
  error_count: number
  errors: SurveyResponseImportIssue[]
  conflict_count: number
  conflicts: SurveyResponseImportIssue[]
  match_count: number
  matches: SurveyResponseImportMatch[]
  personal_data_question_ids: string[]
  consent_question_id: string | null
  includes_personal_data: boolean
  warnings: string[]
  structure_version: string
  can_import: boolean
}

/** Result of an atomic response import. */
export interface SurveyResponseImportResult {
  survey_id: string
  imported_count: number
  updated_count: number
  unchanged_count: number
  merged_in_file_count: number
  filled_answer_count: number
}

export interface SurveyResponseImportOptions {
  overrides?: SurveyResponseImportOverrides
  /** Offset applied to spreadsheet timestamps without a zone. Defaults to UTC+08:00. */
  utcOffsetMinutes?: number
  sheet?: string
}

export interface SurveyResponseImportCommitOptions extends SurveyResponseImportOptions {
  structureVersion: string
}

export interface ApiPagination {
  total: number
  count: number
  limit: number
  offset: number
  has_next: boolean
  has_prev: boolean
}

export interface SurveyListOptions {
  includeArchived?: boolean
  search?: string
  status?: SurveyStatus
  targetCohort?: string
  sortBy?: "created_at" | "survey_id" | "title" | "status" | "responses_count"
  sortOrder?: "asc" | "desc"
  limit?: number
  offset?: number
  isTemplate?: boolean
}

export interface SurveyResponseListOptions {
  limit?: number
  offset?: number
  sortBy?: "created_at"
  sortOrder?: "asc" | "desc"
  submittedFrom?: string
  submittedBefore?: string
}

// ── Mapping ───────────────────────────────────────────────────────

function mapSection(api: ApiSection): SurveySection {
  return {
    id: api.id,
    surveyId: api.survey_id,
    title: api.title,
    ...(api.description ? { description: api.description } : {}),
    orderIndex: api.order_index,
    questions: api.questions.map(mapQuestion),
  }
}

export function mapSurvey(api: ApiSurvey): Survey {
  return {
    id: api.id,
    surveyId: api.survey_id,
    title: api.title,
    status: api.status,
    responses: api.responses_count,
    hasResponseHistory: api.has_response_history ?? null,
    dateCreated: api.created_at,
    updatedAt: api.updated_at,
    isDeleted: api.is_deleted,
    retentionEnabled: api.retention_enabled ?? DEFAULT_RETENTION_ENABLED,
    retentionDays: api.retention_days ?? DEFAULT_RETENTION_DAYS,
    ...(api.is_template !== undefined ? { isTemplate: api.is_template } : {}),
    ...(api.is_cta !== undefined ? { isCta: api.is_cta } : {}),
    ...(api.target_cohort ? { targetCohort: api.target_cohort } : {}),
    ...(api.description ? { description: api.description } : {}),
    ...(api.questions ? { questions: api.questions.map(mapQuestion) } : {}),
    ...(api.sections ? { sections: api.sections.map(mapSection) } : {}),
  }
}

function mapQuestion(api: ApiQuestion): SurveyQuestion {
  return {
    id: api.id,
    surveyId: api.survey_id,
    text: api.question_text,
    type: api.question_type,
    ...(api.options ? { options: api.options } : {}),
    ...(api.config ? { config: api.config } : {}),
    sectionId: api.section_id,
    isRequired: api.is_required,
    orderIndex: api.order_index,
  }
}

function mapResponse(api: ApiSurveyResponse): SurveyResponse {
  return {
    id: api.id,
    surveyId: api.survey_id,
    answers: api.answers,
    createdAt: api.created_at,
  }
}

function mapResponseIdentity(api: ApiSurveyResponseIdentity): SurveyResponseIdentity {
  return {
    ...mapResponse(api),
    provider: api.provider ?? null,
    email: api.email ?? null,
    displayName: api.display_name ?? null,
    emailVerified: api.email_verified ?? null,
    identityCapturedAt: api.identity_captured_at ?? null,
    identityAvailable: api.identity_available ?? null,
  }
}

// ── API operations ───────────────────────────────────────────────

export function buildSurveyListQuery(options: SurveyListOptions = {}): string {
  const query = new URLSearchParams()
  if (options.includeArchived) query.set("include_deleted", "true")
  if (options.search) query.set("search", options.search)
  if (options.status) query.set("status", options.status)
  if (options.targetCohort) query.set("target_cohort", options.targetCohort)
  if (options.sortBy) query.set("sort_by", options.sortBy)
  if (options.sortOrder) query.set("sort_order", options.sortOrder)
  if (options.limit) query.set("limit", String(options.limit))
  if (options.offset) query.set("offset", String(options.offset))
  if (options.isTemplate !== undefined) query.set("is_template", String(options.isTemplate))
  const value = query.toString()
  return value ? `?${value}` : ""
}

export async function fetchSurveys(
  options: SurveyListOptions = {},
  signal?: AbortSignal,
): Promise<{
  surveys: Survey[]
  pagination: ApiPagination
}> {
  const res = await api.get<ApiSurvey[]>(
    `/surveys/${buildSurveyListQuery(options)}`,
    signal ? { signal } : undefined,
  )
  return {
    surveys: (res.data ?? []).map(mapSurvey),
    pagination: res.meta?.pagination as ApiPagination,
  }
}

export async function fetchCtaSurvey(): Promise<{ survey_id: string; title: string } | null> {
  try {
    const res = await api.get<{ survey_id: string; title: string }>("/survey/cta")
    return res.data ?? null
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}

export async function fetchSurvey(surveyId: string): Promise<Survey> {
  const res = await api.get<ApiSurvey>(`/surveys/${surveyId}`)
  return mapSurvey(res.data!)
}

export async function createSurvey(payload: {
  title: string
  description?: string | null
  target_cohort?: string | null
  status?: SurveyStatus
  retention_enabled?: boolean
  retention_days?: number
  is_template?: boolean
}): Promise<Survey> {
  const res = await api.post<ApiSurvey>("/surveys/", {
    ...payload,
    retention_enabled: payload.retention_enabled ?? DEFAULT_RETENTION_ENABLED,
    retention_days: payload.retention_days ?? DEFAULT_RETENTION_DAYS,
  })
  return mapSurvey(res.data!)
}

export interface SurveyStructurePayload {
  sections: Array<{
    client_id: string
    id?: string
    title: string
    description: string | null
    questions: Array<{
      client_id: string
      id?: string
      question_text: string
      question_type: string
      options: string[] | null
      config: Record<string, unknown> | null
      is_required: boolean
    }>
  }>
  cascade_section_ids?: string[]
}

export async function createSurveyWithStructure(payload: {
  title: string
  description?: string | null
  target_cohort?: string | null
  status?: SurveyStatus
  retention_enabled?: boolean
  retention_days?: number
  is_template?: boolean
} & SurveyStructurePayload): Promise<Survey> {
  const res = await api.post<ApiSurvey>("/surveys/with-structure", {
    ...payload,
    retention_enabled: payload.retention_enabled ?? DEFAULT_RETENTION_ENABLED,
    retention_days: payload.retention_days ?? DEFAULT_RETENTION_DAYS,
  })
  return mapSurvey(res.data!)
}

export async function updateSurvey(
  surveyId: string,
  payload: Partial<{
    title: string
    description: string | null
    status: SurveyStatus
    target_cohort: string | null
    retention_enabled: boolean
    retention_days: number
    is_cta: boolean
  }>,
): Promise<Survey> {
  const res = await api.patch<ApiSurvey>(`/surveys/${surveyId}`, payload)
  return mapSurvey(res.data!)
}

export async function replaceSurveyStructure(
  surveyUuid: string,
  payload: SurveyStructurePayload & { expected_updated_at: string },
): Promise<Survey> {
  const res = await api.put<ApiSurvey>(`/surveys/${surveyUuid}/structure`, payload)
  return mapSurvey(res.data!)
}

export async function deleteSurvey(surveyId: string): Promise<void> {
  await api.delete(`/surveys/${surveyId}`, {})
}

export async function createSection(
  surveyUuid: string,
  payload: {
    title: string
    description?: string | null
  },
): Promise<SurveySection> {
  const res = await api.post<ApiSection>(`/surveys/${surveyUuid}/sections/`, payload)
  return mapSection(res.data!)
}

export async function updateSection(
  surveyUuid: string,
  sectionId: string,
  payload: Partial<{
    title: string
    description: string | null
  }>,
): Promise<SurveySection> {
  const res = await api.patch<ApiSection>(
    `/surveys/${surveyUuid}/sections/${sectionId}`,
    payload,
  )
  return mapSection(res.data!)
}

export async function deleteSection(
  surveyUuid: string,
  sectionId: string,
): Promise<void> {
  await api.delete(`/surveys/${surveyUuid}/sections/${sectionId}`, {})
}

export async function reorderSections(
  surveyUuid: string,
  sectionIds: string[],
): Promise<SurveySection[]> {
  const res = await api.patch<ApiSection[]>(
    `/surveys/${surveyUuid}/sections/reorder`,
    { section_ids: sectionIds },
  )
  return (res.data ?? []).map(mapSection)
}

export async function createQuestion(
  surveyUuid: string,
  payload: {
    question_text: string
    question_type: string
    options?: string[] | null
    config?: Record<string, unknown> | null
    section_id: string
    is_required?: boolean
  },
): Promise<SurveyQuestion> {
  const res = await api.post<ApiQuestion>(`/surveys/${surveyUuid}/questions/`, payload)
  return mapQuestion(res.data!)
}

export async function updateQuestion(
  surveyUuid: string,
  questionId: string,
  payload: Partial<{
    question_text: string
    question_type: string
    options: string[] | null
    config: Record<string, unknown> | null
    section_id: string
    is_required: boolean
  }>,
): Promise<SurveyQuestion> {
  const res = await api.patch<ApiQuestion>(
    `/surveys/${surveyUuid}/questions/${questionId}`,
    payload,
  )
  return mapQuestion(res.data!)
}

export async function deleteQuestion(
  surveyUuid: string,
  questionId: string,
): Promise<void> {
  await api.delete(`/surveys/${surveyUuid}/questions/${questionId}`, {})
}

export async function restoreSurvey(surveyId: string): Promise<Survey> {
  const res = await api.post<ApiSurvey>(`/surveys/${surveyId}/restore`, {})
  return mapSurvey(res.data!)
}

export function buildResponseListQuery(options: SurveyResponseListOptions = {}): string {
  const query = new URLSearchParams()
  if (options.limit !== undefined) query.set("limit", String(options.limit))
  if (options.offset !== undefined) query.set("offset", String(options.offset))
  if (options.sortBy) query.set("sort_by", options.sortBy)
  if (options.sortOrder) query.set("sort_order", options.sortOrder)
  if (options.submittedFrom) query.set("submitted_from", options.submittedFrom)
  if (options.submittedBefore) query.set("submitted_before", options.submittedBefore)
  const value = query.toString()
  return value ? `?${value}` : ""
}

export async function fetchResponses(
  surveyUuid: string,
  options: SurveyResponseListOptions = {},
): Promise<{ responses: SurveyResponse[]; pagination: ApiPagination }> {
  const res = await api.get<ApiSurveyResponse[]>(
    `/surveys/${surveyUuid}/responses/${buildResponseListQuery(options)}`,
  )
  const responses = (res.data ?? []).map(mapResponse)
  return {
    responses,
    pagination: res.meta?.pagination as ApiPagination ?? {
      total: responses.length,
      count: responses.length,
      limit: options.limit ?? responses.length,
      offset: options.offset ?? 0,
      has_next: false,
      has_prev: (options.offset ?? 0) > 0,
    },
  }
}

export async function fetchResponsesWithIdentity(
  surveyUuid: string,
  options: SurveyResponseListOptions = {},
): Promise<{ responses: SurveyResponseIdentity[]; pagination: ApiPagination }> {
  const res = await api.get<ApiSurveyResponseIdentity[]>(
    `/surveys/${surveyUuid}/responses/identity${buildResponseListQuery(options)}`,
  )
  const responses = (res.data ?? []).map(mapResponseIdentity)
  return {
    responses,
    pagination: res.meta?.pagination as ApiPagination ?? {
      total: responses.length,
      count: responses.length,
      limit: options.limit ?? responses.length,
      offset: options.offset ?? 0,
      has_next: false,
      has_prev: (options.offset ?? 0) > 0,
    },
  }
}

export async function fetchResponseAggregates(
  surveyUuid: string,
): Promise<SurveyResponseAggregate[]> {
  const res = await api.get<SurveyResponseAggregate[]>(
    `/surveys/${surveyUuid}/responses/aggregates`,
  )
  return res.data ?? []
}

export async function fetchPEII(
  surveyUuid: string,
  options: { batch?: string; department?: string; degree?: string } = {},
  signal?: AbortSignal,
): Promise<PEIIAnalyticsResponse> {
  const query = new URLSearchParams()
  if (options.batch && options.batch !== "All Batches") query.set("batch", options.batch)
  if (options.department && options.department !== "All Departments") query.set("department", options.department)
  if (options.degree && options.degree !== "All Degrees") query.set("degree", options.degree)
  
  const queryString = query.toString() ? `?${query.toString()}` : ""
  const res = await api.get<PEIIAnalyticsResponse>(
    `/surveys/${surveyUuid}/responses/peii${queryString}`,
    { timeout: 20000, ...(signal ? { signal } : {}) }
  )
  return res.data!
}

export async function markFalsePositive(
  surveyUuid: string,
  responseId: string,
  questionId: string,
  polarityOverride?: number,
): Promise<void> {
  await api.post(`/surveys/${surveyUuid}/responses/peii/false-positive`, {
    response_id: responseId,
    question_id: questionId,
    ...(polarityOverride !== undefined ? { polarity_override: polarityOverride } : {}),
  })
}

export interface ExportPreparation {
  export_id: string
  response_count: number
  answer_row_count: number
  download_url: string
  expires_at: string
  filename: string
}

export async function exportResponses(surveyUuid: string): Promise<ExportPreparation> {
  const res = await api.get<ExportPreparation>(`/surveys/${surveyUuid}/responses/export`)
  if (!res.data) throw new Error("Backend did not return the export preparation")
  return res.data
}

export async function eraseResponses(
  surveyUuid: string,
  payload: EraseResponsesPayload,
  idempotencyKey: string,
): Promise<ResponseErasureResult> {
  const res = await api.post<ResponseErasureResult>(
    `/surveys/${surveyUuid}/responses/erase`,
    payload,
    { headers: { "Idempotency-Key": idempotencyKey } },
  )
  if (!res.data) throw new Error("Backend did not return the erasure result")
  return res.data
}

const RESPONSE_IMPORT_TIMEOUT_MS = 60_000
export const DEFAULT_IMPORT_UTC_OFFSET_MINUTES = 480

interface ApiEnvelope<T> {
  data: T | null
  message?: string
}

function importData<T>(envelope: unknown): T {
  if (typeof envelope !== "object" || envelope === null || !("data" in envelope)) {
    throw new Error("Backend returned an invalid import response.")
  }
  const data = (envelope as ApiEnvelope<T>).data
  if (data === null || data === undefined) {
    throw new Error("Backend did not return import details.")
  }
  return data
}

async function parseImportResponse<T>(response: Response): Promise<T> {
  let envelope: unknown
  try {
    envelope = await response.json()
  } catch {
    throw new Error("Backend returned an invalid import response.")
  }
  return importData<T>(envelope)
}

function importFormData(file: File, options: SurveyResponseImportOptions): FormData {
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    throw new Error("This file is larger than the 4 MiB limit.")
  }
  const encoder = new TextEncoder()
  // Keep client metadata small so a maximum-size file and mapping fit the body cap.
  if (encoder.encode(file.name).byteLength > 255) {
    throw new Error("The file name exceeds the 255-byte limit. Rename the file and try again.")
  }
  if (encoder.encode(file.type).byteLength > 255) {
    throw new Error("The file type exceeds the 255-byte limit. Select an .xlsx or .csv export.")
  }
  if (options.sheet && Array.from(options.sheet).length > 255) {
    throw new Error("The sheet name exceeds the 255-character limit.")
  }
  const overrides = options.overrides ? JSON.stringify(options.overrides) : undefined
  if (overrides && encoder.encode(overrides).byteLength > MAX_IMPORT_OVERRIDES_BYTES) {
    throw new Error("The mapping changes exceed the 64 KiB limit. Use fewer mapping changes.")
  }
  const body = new FormData()
  body.append("file", file, file.name)
  if (overrides) body.append("overrides", overrides)
  body.append(
    "utc_offset_minutes",
    String(options.utcOffsetMinutes ?? DEFAULT_IMPORT_UTC_OFFSET_MINUTES),
  )
  if (options.sheet) body.append("sheet", options.sheet)
  return body
}

/** Dry-runs a response spreadsheet (Google Forms .xlsx or .csv) against the survey. */
export async function previewSurveyResponseImport(
  surveyUuid: string,
  file: File,
  options: SurveyResponseImportOptions = {},
): Promise<SurveyResponseImportPreview> {
  const response = await api.raw.post(
    `/surveys/${surveyUuid}/responses/import/validate`,
    importFormData(file, options),
    { headers: { Accept: "application/json" }, timeout: RESPONSE_IMPORT_TIMEOUT_MS },
  )
  return parseImportResponse<SurveyResponseImportPreview>(response)
}

/** Commits a checked response spreadsheet. `structureVersion` comes from the preview. */
export async function importSurveyResponses(
  surveyUuid: string,
  file: File,
  options: SurveyResponseImportCommitOptions,
): Promise<SurveyResponseImportResult> {
  const { structureVersion, ...previewOptions } = options
  if (structureVersion.length > 64) {
    throw new Error("The structure version is invalid. Check the file again.")
  }
  const body = importFormData(file, previewOptions)
  body.append("structure_version", structureVersion)
  const response = await api.raw.post(
    `/surveys/${surveyUuid}/responses/import`,
    body,
    { headers: { Accept: "application/json" }, timeout: RESPONSE_IMPORT_TIMEOUT_MS },
  )
  return parseImportResponse<SurveyResponseImportResult>(response)
}

export async function reorderQuestions(
  surveyUuid: string,
  questionIds: string[],
): Promise<SurveyQuestion[]> {
  const res = await api.patch<ApiQuestion[]>(
    `/surveys/${surveyUuid}/questions/reorder`,
    { question_ids: questionIds },
  )
  return (res.data ?? []).map(mapQuestion)
}

export { ApiError }
