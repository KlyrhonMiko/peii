import { api, ApiError } from "@/lib/api"

// ── Frontend-facing types (camelCase, matching existing UI) ──────

export interface Distribution {
  id: string
  surveyId: string
  token: string
  status: "active" | "suspended" | "expired" | "revoked"
  isActive: boolean
  isLegacy: boolean
  expiresAt: string | null
  revokedAt: string | null
  createdAt: string
  versionId: string
}

export interface SurveyResponse {
  id: string
  surveyId: string
  distributionId: string | null
  answers: Record<string, unknown>
  createdAt: string
  versionId: string
}

export interface Survey {
  id: string
  surveyId: string
  title: string
  status: string
  responses: number
  dateCreated: string
  targetCohort?: string
  description?: string
  versionId?: string
  structureRevision?: number
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
  status: string
  target_cohort: string | null
  responses_count: number
  created_at: string
  updated_at: string
  is_deleted: boolean
  deleted_at: string | null
  performed_by: string | null
  questions?: ApiQuestion[]
  sections?: ApiSection[]
  version_id?: string
  version_number?: number
  structure_revision?: number
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
  token: string
  status: "active" | "suspended" | "expired" | "revoked"
  is_active: boolean
  is_legacy: boolean
  expires_at: string | null
  revoked_at: string | null
  created_at: string
  version_id: string
}

export interface ApiSurveyResponse {
  id: string
  survey_id: string
  distribution_id: string | null
  answers: Record<string, unknown>
  created_at: string
  version_id: string
}

export interface ApiPagination {
  total: number
  count: number
  limit: number
  offset: number
  has_next: boolean
  has_prev: boolean
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
    ...(api.version_id ? { versionId: api.version_id } : {}),
    ...(api.structure_revision !== undefined
      ? { structureRevision: api.structure_revision }
      : {}),
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
  }
}

function mapDistribution(api: ApiDistribution): Distribution {
  return {
    id: api.id,
    surveyId: api.survey_id,
    token: api.token,
    status: api.status,
    isActive: api.is_active,
    isLegacy: api.is_legacy,
    expiresAt: api.expires_at,
    revokedAt: api.revoked_at,
    createdAt: api.created_at,
    versionId: api.version_id,
  }
}

function mapResponse(api: ApiSurveyResponse): SurveyResponse {
  return {
    id: api.id,
    surveyId: api.survey_id,
    distributionId: api.distribution_id,
    answers: api.answers,
    createdAt: api.created_at,
    versionId: api.version_id,
  }
}

// ── API operations ───────────────────────────────────────────────

export async function fetchSurveys(): Promise<{
  surveys: Survey[]
  pagination: ApiPagination
}> {
  const res = await api.get<ApiSurvey[]>("/surveys/")
  return {
    surveys: (res.data ?? []).map(mapSurvey),
    pagination: res.meta?.pagination as ApiPagination,
  }
}

export async function fetchSurvey(surveyId: string): Promise<Survey> {
  const res = await api.get<ApiSurvey>(`/surveys/${surveyId}`)
  return mapSurvey(res.data!)
}

export async function ensureSurveyDraft(surveyUuid: string): Promise<void> {
  await api.post(`/surveys/${surveyUuid}/draft`)
}

export async function createSurvey(payload: {
  title: string
  description?: string | null
  target_cohort?: string | null
  status?: string
}): Promise<Survey> {
  const res = await api.post<ApiSurvey>("/surveys/", { ...payload, performed_by: null })
  return mapSurvey(res.data!)
}

export async function updateSurvey(
  surveyId: string,
  payload: Partial<{
    title: string
    description: string | null
    status: string
    target_cohort: string | null
  }>,
): Promise<Survey> {
  const res = await api.patch<ApiSurvey>(`/surveys/${surveyId}`, { ...payload, performed_by: null })
  return mapSurvey(res.data!)
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

export async function replaceSurveyStructure(
  surveyUuid: string,
  payload: {
    expected_revision?: number
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
  },
): Promise<Survey> {
  const normalized = {
    ...(payload.expected_revision !== undefined
      ? { expected_revision: payload.expected_revision }
      : {}),
    sections: payload.sections.map((section) => ({
      client_id: section.client_id,
      ...(section.id && isUuid(section.id) ? { id: section.id } : {}),
      title: section.title,
      description: section.description,
      questions: section.questions.map((question) => ({
        client_id: question.client_id,
        ...(question.id && isUuid(question.id) ? { id: question.id } : {}),
        question_text: question.question_text,
        question_type: question.question_type,
        options: question.options,
        config: question.config,
        is_required: question.is_required,
      })),
    })),
    ...(payload.cascade_section_ids
      ? { cascade_section_ids: payload.cascade_section_ids }
      : {}),
  }
  const res = await api.put<ApiSurvey>(`/surveys/${surveyUuid}/structure`, normalized)
  return mapSurvey(res.data!)
}

export async function deleteSurvey(surveyId: string): Promise<void> {
  await api.delete(`/surveys/${surveyId}`, { performed_by: null })
}

export async function createSection(
  surveyUuid: string,
  payload: {
    title: string
    description?: string | null
  },
): Promise<SurveySection> {
  const res = await api.post<ApiSection>(`/surveys/${surveyUuid}/sections/`, {
    ...payload,
    performed_by: null,
  })
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
    { ...payload, performed_by: null },
  )
  return mapSection(res.data!)
}

export async function deleteSection(
  surveyUuid: string,
  sectionId: string,
): Promise<void> {
  await api.delete(`/surveys/${surveyUuid}/sections/${sectionId}`, {
    performed_by: null,
  })
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
  const res = await api.post<ApiQuestion>(`/surveys/${surveyUuid}/questions/`, {
    ...payload,
    performed_by: null,
  })
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
    { ...payload, performed_by: null },
  )
  return mapQuestion(res.data!)
}

export async function deleteQuestion(
  surveyUuid: string,
  questionId: string,
): Promise<void> {
  await api.delete(`/surveys/${surveyUuid}/questions/${questionId}`, {
    performed_by: null,
  })
}

export async function createDistribution(
  surveyUuid: string,
  expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
): Promise<Distribution> {
  const res = await api.post<ApiDistribution>(
    `/surveys/${surveyUuid}/distributions/`,
    { expires_at: expiresAt },
  )
  return mapDistribution(res.data!)
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
  await api.delete(
    `/surveys/${surveyUuid}/distributions/${distributionId}`,
    { performed_by: null },
  )
}

export async function fetchResponses(
  surveyUuid: string,
): Promise<{ responses: SurveyResponse[]; pagination: ApiPagination }> {
  const res = await api.get<ApiSurveyResponse[]>(`/surveys/${surveyUuid}/responses/`)
  return {
    responses: (res.data ?? []).map(mapResponse),
    pagination: res.meta?.pagination as ApiPagination,
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
