export type PublicAnswerValue =
  | string
  | string[]
  | number
  | boolean
  | Record<string, string>

export type PublicAnswers = Record<string, PublicAnswerValue>

export type PublicSurveyCollectionState = "phase1" | "phase2" | "completed" | "withdrawn"
export type PublicSurveySubmissionPhase = 1 | 2

export interface PublicSurveyQuestion {
  id: string
  question_text: string
  question_type: string
  options: string[] | null
  config: Record<string, unknown> | null
  order_index: number
  is_required: boolean
}

export interface PublicSurveySection {
  id: string
  title: string
  description: string | null
  order_index: number
  questions: PublicSurveyQuestion[]
}

export interface PublicSurveyConsent {
  version: string
  notice: string
  purpose: string
  retention: string
  contact: string
}

export interface PublicSurvey {
  survey_id: string
  title: string
  description: string | null
  questions: PublicSurveyQuestion[]
  sections: PublicSurveySection[]
  consent: PublicSurveyConsent
  collection_state: PublicSurveyCollectionState | null
  submission_phase: PublicSurveySubmissionPhase | null
}

export interface PublicSurveyConsentSubmission {
  accepted: true
  version: string
}

export interface PublicSurveySubmission {
  answers: PublicAnswers
  consent: PublicSurveyConsentSubmission
  withdrawal_code: string
}

export interface PublicSurveyWithdrawalRequest {
  withdrawal_code: string
}

export interface PublicSurveyWithdrawn {
  withdrawn: true
}

export interface PublicSurveyAccepted {
  accepted: true
}

export interface PublicSurveyEnvelope<T> {
  data: T | null
  message: string
  errors: unknown | null
  meta: Record<string, unknown>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" ? value : null
}

function stringArray(value: unknown): string[] | null {
  if (value === null) return null
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) return null
  return value
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value === null || isRecord(value) ? value : null
}

function collectionStateValue(value: unknown): PublicSurveyCollectionState | null {
  return value === "phase1" || value === "phase2" || value === "completed" || value === "withdrawn"
    ? value
    : null
}

function submissionPhaseValue(value: unknown): PublicSurveySubmissionPhase | null {
  return value === 1 || value === 2 ? value : null
}

function parseQuestion(value: unknown): PublicSurveyQuestion | null {
  if (!isRecord(value)) return null
  const id = stringValue(value.id)
  const questionText = stringValue(value.question_text)
  const questionType = stringValue(value.question_type)
  const orderIndex = value.order_index
  const isRequired = value.is_required
  if (
    id === null ||
    questionText === null ||
    questionType === null ||
    typeof orderIndex !== "number" ||
    typeof isRequired !== "boolean"
  ) {
    return null
  }
  const options = stringArray(value.options)
  const config = recordValue(value.config)
  if (value.options !== undefined && value.options !== null && options === null) return null
  if (value.config !== undefined && value.config !== null && config === null) return null
  return {
    id,
    question_text: questionText,
    question_type: questionType,
    options,
    config,
    order_index: orderIndex,
    is_required: isRequired,
  }
}

function parseSection(value: unknown): PublicSurveySection | null {
  if (!isRecord(value)) return null
  const id = stringValue(value.id)
  const title = stringValue(value.title)
  const description = value.description === null ? null : stringValue(value.description)
  const orderIndex = value.order_index
  const questions = value.questions
  if (
    id === null ||
    title === null ||
    description === null && value.description !== null ||
    typeof orderIndex !== "number" ||
    !Array.isArray(questions)
  ) {
    return null
  }
  const parsedQuestions = questions.map(parseQuestion)
  const validQuestions = parsedQuestions.filter(
    (question): question is PublicSurveyQuestion => question !== null,
  )
  if (validQuestions.length !== parsedQuestions.length) return null
  return {
    id,
    title,
    description,
    order_index: orderIndex,
    questions: validQuestions,
  }
}

function parseConsent(value: unknown): PublicSurveyConsent | null {
  if (!isRecord(value)) return null
  const version = stringValue(value.version)
  const notice = stringValue(value.notice)
  const purpose = stringValue(value.purpose)
  const retention = stringValue(value.retention)
  const contact = stringValue(value.contact)
  if (
    version === null ||
    notice === null ||
    purpose === null ||
    retention === null ||
    contact === null
  ) {
    return null
  }
  return { version, notice, purpose, retention, contact }
}

export function parsePublicSurvey(value: unknown): PublicSurvey | null {
  if (!isRecord(value)) return null
  const surveyId = stringValue(value.survey_id)
  const title = stringValue(value.title)
  const description = value.description === null ? null : stringValue(value.description)
  // Absent fields mean an old backend: fall back to Phase 1. Explicit nulls
  // mean a legacy single-submit survey: preserve them so the UI does not
  // misrepresent it as "Phase 1 of 2".
  const collectionState = value.collection_state === undefined
    ? "phase1"
    : collectionStateValue(value.collection_state)
  const submissionPhase = value.submission_phase === undefined
    ? 1
    : value.submission_phase === null
      ? null
      : submissionPhaseValue(value.submission_phase)
  const questions = value.questions
  const sections = value.sections
  const consent = parseConsent(value.consent)
  if (
    surveyId === null ||
    title === null ||
    description === null && value.description !== null ||
    collectionState === null && value.collection_state !== null ||
    value.submission_phase !== undefined && value.submission_phase !== null && submissionPhase === null ||
    collectionState === null && submissionPhase !== null ||
    !Array.isArray(questions) ||
    !Array.isArray(sections) ||
    consent === null
  ) {
    return null
  }
  const parsedQuestions = questions.map(parseQuestion)
  const parsedSections = sections.map(parseSection)
  const validQuestions = parsedQuestions.filter(
    (question): question is PublicSurveyQuestion => question !== null,
  )
  const validSections = parsedSections.filter(
    (section): section is PublicSurveySection => section !== null,
  )
  if (validQuestions.length !== parsedQuestions.length || validSections.length !== parsedSections.length) return null
  return {
    survey_id: surveyId,
    title,
    description,
    questions: validQuestions,
    sections: validSections,
    consent,
    collection_state: collectionState,
    submission_phase: submissionPhase,
  }
}

export function parsePublicSurveyEnvelope(value: unknown): PublicSurvey | null {
  if (!isRecord(value) || !("data" in value)) return null
  return parsePublicSurvey(value.data)
}

export function parsePublicSurveyAccepted(value: unknown): PublicSurveyAccepted | null {
  if (!isRecord(value) || !isRecord(value.data) || value.data.accepted !== true) return null
  return { accepted: true }
}

export function parsePublicSurveyWithdrawn(value: unknown): PublicSurveyWithdrawn | null {
  if (!isRecord(value) || !isRecord(value.data) || value.data.withdrawn !== true) return null
  return { withdrawn: true }
}

export function publicSurveyMessage(value: unknown): string | null {
  return isRecord(value) ? stringValue(value.message) : null
}

export function publicSurveyErrorCode(value: unknown): string | null {
  if (!isRecord(value) || !isRecord(value.errors)) return null
  return stringValue(value.errors.code)
}

export function createPublicSurveySubmission(
  answers: PublicAnswers,
  version: string,
  withdrawalCode: string,
): PublicSurveySubmission {
  return {
    answers,
    consent: { accepted: true, version },
    withdrawal_code: withdrawalCode,
  }
}

export function createPublicSurveyWithdrawalRequest(
  withdrawalCode: string,
): PublicSurveyWithdrawalRequest {
  return { withdrawal_code: withdrawalCode }
}

export function generateWithdrawalCode(): string {
  const bytes = new Uint8Array(32)
  globalThis.crypto.getRandomValues(bytes)
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return globalThis.btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")
}

export function parseRetryAfter(
  value: string | null,
  now = Date.now(),
): number | null {
  if (value === null) return null
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds)
  const timestamp = Date.parse(value)
  if (Number.isNaN(timestamp)) return null
  return Math.max(0, Math.ceil((timestamp - now) / 1000))
}
