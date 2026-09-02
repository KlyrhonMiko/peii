import { Button } from "@/components/ui/button"
import { ClipboardList, Pen } from "lucide-react"
import type { useSurveyManagement } from "./useSurveyManagement"
import { SurveyListToolbar } from "./list/SurveyListToolbar"
import { SurveyTable } from "./list/SurveyTable"
import { SurveyListPagination } from "./list/SurveyListPagination"

export interface SurveyListProps {
  store: ReturnType<typeof useSurveyManagement>
}

export function SurveyList({ store }: SurveyListProps) {
  const { state, actions } = store
  const {
    interactionLocked,
    capabilities,
  } = state

  const {
    handleOpenTemplateEdit,
    handleShowGeneratePreview,
  } = actions

  const { manage: canManage } = capabilities

  return (
    <div className="space-y-8 p-2">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-950">
            Survey Management
          </h2>
          <p className="text-[14px] text-zinc-500 max-w-xl">
            Manage surveys to collect PEII feedback and track cohort progress.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {canManage && (
            <Button
              onClick={handleOpenTemplateEdit}
              variant="outline"
              disabled={interactionLocked}
              className="h-9 gap-2 border-zinc-200/80 bg-white text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 shadow-sm transition-all rounded-lg"
            >
              <Pen className="size-4 text-zinc-400" />
              Edit Survey Template
            </Button>
          )}
          {canManage && (
            <Button
              onClick={handleShowGeneratePreview}
              disabled={interactionLocked}
              className="h-9 gap-2 bg-zinc-900 hover:bg-zinc-800 text-white shadow-sm transition-all active:scale-[0.98] rounded-lg"
            >
              <ClipboardList className="size-4" />
              Generate Questionnaire
            </Button>
          )}
        </div>
      </div>

      {/* Filter and search toolbar */}
      <SurveyListToolbar store={store} />

      {/* Main Table */}
      <SurveyTable store={store} />

      {/* Pagination Footer */}
      <SurveyListPagination store={store} />
    </div>
  )
}
