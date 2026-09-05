import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Calendar,
  ClipboardList,
  Eye,
  FileText,
  Loader2,
  Pencil,
  RotateCcw,
  Share2,
  Trash,
  Users,
} from "lucide-react"
import { cn, formatDate } from "@/lib/utils"
import type { useSurveyManagement } from "../useSurveyManagement"
import { formatSurveyResponseCount } from "../utils"

interface SurveyTableProps {
  store: ReturnType<typeof useSurveyManagement>
}

export function SurveyTable({ store }: SurveyTableProps) {
  const { state, actions } = store
  const {
    surveys,
    loading,
    listLoading,
    pendingAction,
    interactionLocked,
    capabilities,
    responseAction,
  } = state

  const {
    handleRestore,
    handleOpenView,
    handleEraseResponses,
    handleOpenEdit,
    handleOpenShareLink,
    setDeleteConfirmId,
  } = actions

  const {
    manage: canManage,
    readAggregates: canReadAggregates,
    erase: canErase,
  } = capabilities

  return (
    <div className="-mx-2 overflow-x-auto">
      <table className="w-full text-left text-[13px] table-fixed">
        <thead>
          <tr className="border-y border-zinc-200/40 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
            <th className="px-2 py-4 w-[35%] sm:w-[40%]">Survey Details</th>
            <th className="px-2 py-4 w-[15%]">Status</th>
            <th className="px-2 py-4 w-[15%]">Responses</th>
            <th className="px-2 py-4 w-[15%]">Date Created</th>
            <th className="px-2 py-4 w-[20%] sm:w-[15%] text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100/80">
          {loading || listLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <tr key={i} className="hover:bg-zinc-50/50 transition-colors">
                <td className="px-2 py-4">
                  <div className="flex items-center gap-3.5">
                    <div className="size-9 rounded-xl border border-zinc-200/60 bg-transparent flex items-center justify-center shrink-0">
                      <FileText className="size-4 text-zinc-200" />
                    </div>
                    <Skeleton className={cn("h-4", ["w-48", "w-32", "w-56", "w-40", "w-64"][i % 5])} />
                  </div>
                </td>
                <td className="px-2 py-4">
                  <Skeleton className="h-[22px] w-16 rounded-full" />
                </td>
                <td className="px-2 py-4">
                  <div className="flex items-center gap-2">
                    <Users className="size-4 text-zinc-200" />
                    <Skeleton className="h-4 w-8" />
                  </div>
                </td>
                <td className="px-2 py-4">
                  <div className="flex items-center gap-2">
                    <Calendar className="size-4 text-zinc-200" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                </td>
                <td className="px-2 py-4 text-right">
                  <div className="flex items-center justify-end gap-2 text-zinc-200">
                    <div className="inline-flex h-9 w-9 items-center justify-center">
                      <Eye className="size-4.5" />
                    </div>
                    <div className="inline-flex h-9 w-9 items-center justify-center">
                      <Pencil className="size-4.5" />
                    </div>
                    <div className="inline-flex h-9 w-9 items-center justify-center">
                      <Share2 className="size-4.5" />
                    </div>
                    <div className="inline-flex h-9 w-9 items-center justify-center">
                      <Trash className="size-4.5" />
                    </div>
                  </div>
                </td>
              </tr>
            ))
          ) : surveys.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-2 py-12 text-center">
                <div className="mx-auto flex max-w-[280px] flex-col items-center justify-center space-y-3">
                  <div className="flex size-12 items-center justify-center rounded-full bg-zinc-50 border border-zinc-100">
                    <ClipboardList className="size-5 text-zinc-400" />
                  </div>
                  <p className="text-[14px] font-medium text-zinc-900">No surveys found</p>
                  <p className="text-[13px] text-zinc-500">
                    Create a new survey to start collecting feedback from your cohort.
                  </p>
                </div>
              </td>
            </tr>
          ) : (
            surveys.map((survey) => (
              <tr
                key={survey.id}
                className={cn(
                  "group hover:bg-zinc-50/50 transition-colors",
                  survey.isDeleted && "bg-zinc-50/70 opacity-80"
                )}
              >
                <td className="px-2 py-4">
                  <div className="flex items-center gap-3.5">
                    <div className="size-9 rounded-xl border border-zinc-200/60 bg-transparent flex items-center justify-center shrink-0 shadow-none group-hover:border-zinc-300 transition-colors">
                      <FileText className="size-4 text-zinc-400 group-hover:text-zinc-600 transition-colors" />
                    </div>
                    <span className="font-semibold text-[14px] text-zinc-900">{survey.title}</span>
                  </div>
                </td>
                <td className="px-2 py-4">
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        "size-1.5 rounded-full",
                        survey.isDeleted
                          ? "bg-zinc-400"
                          : survey.status === "Active"
                          ? "bg-emerald-500"
                          : survey.status === "Inactive"
                          ? "bg-amber-500"
                          : "bg-zinc-400"
                      )}
                    />
                    <span className="text-zinc-700 font-medium">
                      {survey.isDeleted ? "Archived" : survey.status}
                    </span>
                  </div>
                </td>
                <td className="px-2 py-4">
                  <div className="flex items-center gap-2 text-zinc-600 font-medium">
                    <Users className="size-4 text-zinc-400" />
                    {formatSurveyResponseCount(survey.responses, canReadAggregates)}
                  </div>
                </td>
                <td className="px-2 py-4">
                  <div className="flex items-center gap-2 text-zinc-600 font-medium">
                    <Calendar className="size-4 text-zinc-400" />
                    {formatDate(survey.dateCreated)}
                  </div>
                </td>
                <td className="px-2 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    {survey.isDeleted ? (
                      <>
                        {canErase && survey.responses !== null && survey.responses > 0 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => void handleEraseResponses(survey, "all")}
                            disabled={interactionLocked || responseAction !== null}
                            className="text-red-600 hover:bg-red-50 hover:text-red-700 font-medium"
                          >
                            <Trash className="mr-1.5 size-3.5" />
                            Erase responses
                          </Button>
                        )}
                        {canManage && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRestore(survey)}
                            disabled={interactionLocked}
                            className="text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 font-medium"
                          >
                            <RotateCcw className="mr-1.5 size-3.5" />
                            Restore
                          </Button>
                        )}
                      </>
                    ) : (
                      <>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenView(survey.id)}
                          disabled={interactionLocked}
                          className="text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100"
                          title="View Details"
                        >
                          {pendingAction?.type === "view" && pendingAction.surveyId === survey.id ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Eye className="size-4.5" />
                          )}
                        </Button>
                        {canManage && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenEdit(survey.id)}
                            disabled={interactionLocked}
                            className="text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100"
                            title="Edit Questions & Details"
                          >
                            {pendingAction?.type === "edit" && pendingAction.surveyId === survey.id ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <Pencil className="size-4.5" />
                            )}
                          </Button>
                        )}
                        {canManage && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenShareLink(survey.id)}
                            disabled={interactionLocked}
                            className="text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50"
                            title="Share link"
                          >
                            <Share2 className="size-4.5" />
                          </Button>
                        )}
                        {canManage && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteConfirmId(survey.id)}
                            disabled={interactionLocked}
                            className="text-zinc-400 hover:text-red-600 hover:bg-red-50"
                            title="Archive"
                          >
                            {pendingAction?.type === "delete" && pendingAction.surveyId === survey.id ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <Trash className="size-4.5" />
                            )}
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
