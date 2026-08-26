import { Button } from "@/components/ui/button"
import { ClipboardList, Plus } from "lucide-react"
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
    requestError,
    interactionLocked,
    capabilities,
  } = state

  const {
    handleOpenCreate,
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
            Create and manage surveys to collect PEII feedback and track cohort progress.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {canManage && (
            <Button
              onClick={handleShowGeneratePreview}
              variant="outline"
              disabled={interactionLocked}
              className="h-9 gap-2 border-zinc-200/80 bg-white text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 shadow-sm transition-all rounded-lg"
            >
              <ClipboardList className="size-4 text-zinc-400" />
              Generate Questionnaire
            </Button>
          )}
          {canManage && (
            <Button
              onClick={handleOpenCreate}
              disabled={interactionLocked}
              className="h-9 gap-2 bg-zinc-900 hover:bg-zinc-800 text-white shadow-sm transition-all active:scale-[0.98] rounded-lg"
            >
              <Plus className="size-4" />
              Create Survey
            </Button>
          )}
        </div>
      </div>

      {requestError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {requestError}
        </div>
      )}

      {/* Filter and search toolbar */}
      <SurveyListToolbar store={store} />

      {/* Main Table */}
      <SurveyTable store={store} />

      {/* Pagination Footer */}
      <SurveyListPagination store={store} />
    </div>
  )
}
