import { api, ApiError } from "@/lib/api"

export type SurveyStatus = "Inactive" | "Active" | "Closed"

// ── Frontend-facing types (camelCase, matching existing UI) ──────

export interface Distribution {
  id: string
  surveyId: string
  status: "active" | "suspended" | "expired" | "revoked"
  isActive: boolean
  expiresAt: string | null
  revokedAt: string | null
  createdAt: string
}

export interface DistributionSecret extends Distribution {
  token: string
}

export interface SurveyResponse {
  id: string
  surveyId: string
  distributionId: string | null
  answers: Record<string, unknown>
  createdAt: string
}

export interface Survey {
  id: string
  surveyId: string
  title: string
  status: SurveyStatus
  responses: number
  dateCreated: string
  updatedAt: string
  isDeleted: boolean
  targetCohort?: string
  description?: string
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
  responses_count: number
  created_at: string
  updated_at: string
  is_deleted: boolean
  deleted_at: string | null
  performed_by: string | null
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

export interface ApiDistribution {
  id: string
  survey_id: string
  status: "active" | "suspended" | "expired" | "revoked"
  is_active: boolean
  expires_at: string | null
  revoked_at: string | null
  created_at: string
}

export interface ApiDistributionSecret extends ApiDistribution {
  token: string
}

export interface ApiSurveyResponse {
  id: string
  survey_id: string
  distribution_id: string | null
  answers: Record<string, unknown>
  created_at: string
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

function mapSurvey(api: ApiSurvey): Survey {
  return {
    id: api.id,
    surveyId: api.survey_id,
    title: api.title,
    status: api.status,
    responses: api.responses_count,
    dateCreated: api.created_at,
    updatedAt: api.updated_at,
    isDeleted: api.is_deleted,
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

export function mapDistribution(api: ApiDistribution): Distribution {
  return {
    id: api.id,
    surveyId: api.survey_id,
    status: api.status,
    isActive: api.is_active,
    expiresAt: api.expires_at,
    revokedAt: api.revoked_at,
    createdAt: api.created_at,
  }
}

function mapDistributionSecret(api: ApiDistributionSecret): DistributionSecret {
  return { ...mapDistribution(api), token: api.token }
}

function mapResponse(api: ApiSurveyResponse): SurveyResponse {
  return {
    id: api.id,
    surveyId: api.survey_id,
    distributionId: api.distribution_id,
    answers: api.answers,
    createdAt: api.created_at,
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
  const value = query.toString()
  return value ? `?${value}` : ""
}

export async function fetchSurveys(options: SurveyListOptions = {}): Promise<{
  surveys: Survey[]
  pagination: ApiPagination
}> {
  const res = await api.get<ApiSurvey[]>(
    `/surveys/${buildSurveyListQuery(options)}`,
  )
  return {
    surveys: (res.data ?? []).map(mapSurvey),
    pagination: res.meta?.pagination as ApiPagination,
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
}): Promise<Survey> {
  const res = await api.post<ApiSurvey>("/surveys/", payload)
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
} & SurveyStructurePayload): Promise<Survey> {
  const res = await api.post<ApiSurvey>("/surveys/with-structure", payload)
  return mapSurvey(res.data!)
}

export async function updateSurvey(
  surveyId: string,
  payload: Partial<{
    title: string
    description: string | null
    status: SurveyStatus
    target_cohort: string | null
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

export async function createDistribution(
  surveyUuid: string,
  expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
): Promise<DistributionSecret> {
  const res = await api.post<ApiDistributionSecret>(
    `/surveys/${surveyUuid}/distributions/`,
    { expires_at: expiresAt },
  )
  return mapDistributionSecret(res.data!)
}

export async function fetchDistributions(
  surveyUuid: string,
): Promise<Distribution[]> {
  const res = await api.get<ApiDistribution[]>(
    `/surveys/${surveyUuid}/distributions/`,
  )
  return (res.data ?? []).map(mapDistribution)
}

export async function revokeDistribution(
  surveyUuid: string,
  distributionId: string,
): Promise<void> {
  await api.delete(`/surveys/${surveyUuid}/distributions/${distributionId}`, {})
}

export async function rotateDistribution(
  surveyUuid: string,
  distributionId: string,
  expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
): Promise<DistributionSecret> {
  const res = await api.post<ApiDistributionSecret>(
    `/surveys/${surveyUuid}/distributions/${distributionId}/rotate`,
    { expires_at: expiresAt },
  )
  return mapDistributionSecret(res.data!)
}

export async function restoreSurvey(surveyId: string): Promise<Survey> {
  const res = await api.post<ApiSurvey>(`/surveys/${surveyId}/restore`, {})
  return mapSurvey(res.data!)
}

export async function fetchResponses(
  surveyUuid: string,
): Promise<{ responses: SurveyResponse[]; pagination: ApiPagination }> {
  const responses: SurveyResponse[] = []
  let offset = 0
  let pagination: ApiPagination | undefined

  do {
    const res = await api.get<ApiSurveyResponse[]>(
      `/surveys/${surveyUuid}/responses/?limit=100&offset=${offset}`,
    )
    responses.push(...(res.data ?? []).map(mapResponse))
    pagination = res.meta?.pagination as ApiPagination | undefined

    if (!pagination?.has_next) break
    offset = pagination.offset + pagination.count
  } while (pagination)

  return {
    responses,
    pagination: pagination ?? {
      total: responses.length,
      count: responses.length,
      limit: responses.length,
      offset: 0,
      has_next: false,
      has_prev: false,
    },
  }
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
