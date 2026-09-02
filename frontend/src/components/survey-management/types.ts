import type { SurveyQuestion, SurveySection } from "@/lib/surveys"

export type ModalState =
  | { type: "create" }
  | { type: "edit"; id: string }
  | { type: "view"; id: string }
  | { type: "settings"; id: string }
  | null

export type DragItem =
  | { kind: "section"; id: string }
  | { kind: "question"; sectionId: string; id: string }
  | { kind: "option"; sectionId: string; questionId: string; index: number }
  | { kind: "column"; sectionId: string; questionId: string; index: number }

export type EditorQuestion = SurveyQuestion & { persistedId?: string }

export type EditorSection = Omit<SurveySection, "questions"> & {
  persistedId?: string
  questions: EditorQuestion[]
}

export type PendingAction = {
  type: "view" | "edit" | "generate" | "save" | "delete" | "restore" | "distribute" | "responses"
  surveyId?: string
} | null

export interface SurveyCapabilities {
  read: boolean
  manage: boolean
  distributionManage: boolean
  readAggregates: boolean
  readRaw: boolean
  readIdentity?: boolean
  export: boolean
  erase: boolean
}
