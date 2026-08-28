import { DEFAULT_RETENTION_DAYS, DEFAULT_RETENTION_ENABLED } from "@/lib/surveys"
import type {
  Survey,
  SurveySection,
  SurveyStructurePayload,
  EraseAllResponsesPayload,
} from "@/lib/surveys"
import type { EditorSection, SurveyCapabilities } from "./types"
import { SURVEY_PERMISSIONS } from "./constants"

export interface SurveyRetentionState {
  retentionEnabled: boolean
  retentionDays: number
}

export function getSurveyRetentionState(
  survey?: Pick<Survey, "retentionEnabled" | "retentionDays">,
): SurveyRetentionState {
  return survey
    ? {
        retentionEnabled: survey.retentionEnabled,
        retentionDays: survey.retentionDays,
      }
    : {
        retentionEnabled: DEFAULT_RETENTION_ENABLED,
        retentionDays: DEFAULT_RETENTION_DAYS,
      }
}

export function createClientId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `client-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function toEditorSections(sections: SurveySection[]): EditorSection[] {
  return sections.map((section) => ({
    ...section,
    persistedId: section.id,
    questions: section.questions.map((question) => ({
      ...question,
      persistedId: question.id,
    })),
  }))
}

export function toStructurePayload(sections: EditorSection[]): SurveyStructurePayload {
  return {
    sections: sections.map((section) => ({
      client_id: section.id,
      ...(section.persistedId ? { id: section.persistedId } : {}),
      title: section.title || "Untitled Section",
      description: section.description || null,
      questions: section.questions.map((question) => ({
        client_id: question.id,
        ...(question.persistedId ? { id: question.persistedId } : {}),
        question_text: question.text,
        question_type: question.type,
        options: question.options ?? null,
        config: question.config ?? null,
        is_required: question.isRequired ?? true,
      })),
    })),
  }
}

export function moveInArray<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) {
    return items
  }
  const next = [...items]
  const [item] = next.splice(from, 1)
  if (item !== undefined) next.splice(to, 0, item)
  return next
}

export function getSurveyCapabilities(
  permissions: readonly string[],
  csvExportEnabled: boolean,
): SurveyCapabilities {
  const can = (permission: string): boolean => permissions.includes(permission)
  return {
    read: can("surveys.read"),
    manage: can(SURVEY_PERMISSIONS.manage),
    distributionManage: can(SURVEY_PERMISSIONS.distributionManage),
    readAggregates: can(SURVEY_PERMISSIONS.readAggregates),
    readRaw: can(SURVEY_PERMISSIONS.readRaw),
    export: csvExportEnabled && can(SURVEY_PERMISSIONS.export),
    erase: can(SURVEY_PERMISSIONS.erase),
  }
}

export function formatSurveyResponseCount(
  count: number | null | undefined,
  canReadAggregates: boolean,
): string {
  if (count === null || count === undefined) return canReadAggregates ? "Suppressed" : "Unavailable"
  return String(count)
}

export function canSortSurveysByResponseCount(
  capabilities: Pick<SurveyCapabilities, "readRaw" | "export" | "erase">,
): boolean {
  return capabilities.readRaw || capabilities.export || capabilities.erase
}

export function buildEraseAllResponsesPayload(
  responseCount: number | null,
): EraseAllResponsesPayload | null {
  if (responseCount === null) return null
  return {
    scope: "all",
    expected_response_count: responseCount,
    confirmation: "ERASE_ALL_RESPONSES",
  }
}

export function getSurveyResponseResourceId(
  survey: Pick<Survey, "id" | "surveyId">,
): string {
  return survey.id
}
