import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Plus,
  Eye,
  Trash,
  FileText,
  Users,
  Calendar,
  ChevronDown,
  ClipboardList,
  Check,
  Pencil,
  Loader2,
  Share2,
  RotateCcw,
} from "lucide-react"
import { cn, formatDate } from "@/lib/utils"

import { SURVEY_STATUSES } from "./constants"
import type { SurveyStatus } from "@/lib/surveys"
import type { useSurveyManagement } from "./useSurveyManagement"
import { formatSurveyResponseCount } from "./utils"

export interface SurveyListProps {
  store: ReturnType<typeof useSurveyManagement>
}

export function SurveyList({ store }: SurveyListProps) {
  const { state, actions } = store
  const {
    surveys,
    showArchived,
    loading,
    listLoading,
    search,
    statusFilter,
    cohortFilter,
    sortBy,
    sortOrder,
    statusFilterOpen,
    cohortFilterOpen,
    sortFilterOpen,
    offset,
    totalSurveys,
    cohortOptions,
    pendingAction,
    requestError,
    interactionLocked,
    capabilities,
    responseAction,
  } = state

  const {
    setShowArchived,
    setSearch,
    setStatusFilter,
    setCohortFilter,
    setSortBy,
    setSortOrder,
    setStatusFilterOpen,
    setCohortFilterOpen,
    setSortFilterOpen,
    setOffset,
    handleRestore,
    handleOpenCreate,
    handleOpenView,
    handleEraseResponses,
    handleOpenEdit,
    handleShowGeneratePreview,
    handleOpenDistribute,
    setDeleteConfirmId,
  } = actions

  const {
    read: canRead,
    manage: canManage,
    distributionManage: canManageDistribution,
    readAggregates: canReadAggregates,
    erase: canErase
  } = capabilities
  const canSortByResponseCount = capabilities.readRaw || capabilities.export || capabilities.erase

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

      <div className="flex flex-col gap-3 py-2 sm:flex-row sm:items-center flex-wrap">
        <Input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value)
            setOffset(0)
          }}
          placeholder="Search survey title, ID, or description"
          className="sm:max-w-xs h-9 bg-transparent border-zinc-200/60 focus-visible:ring-zinc-200 shadow-none transition-all"
        />
        <Popover open={statusFilterOpen} onOpenChange={setStatusFilterOpen}>
          <PopoverTrigger
            render={
            <Button
              variant="outline"
              type="button"
              className="h-9 rounded-lg border border-zinc-200/60 bg-transparent px-3 text-[13px] font-medium text-zinc-600 shadow-none focus:border-zinc-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-200 hover:bg-zinc-50 hover:text-zinc-900 transition-all cursor-pointer flex items-center justify-between gap-2 min-w-[130px]"
              aria-label="Filter by survey status"
            >
              <span>{statusFilter === "all" ? "All statuses" : statusFilter}</span>
              <ChevronDown className="size-4 text-zinc-400 shrink-0 opacity-60" />
            </Button>
            }
          />

          <PopoverContent
            align="start"
            style={{ width: "var(--anchor-width)" }}
            className="p-1 flex flex-col gap-0.5 bg-white border border-slate-200 rounded-lg shadow-md animate-in fade-in-0 zoom-in-95 duration-100 min-w-[140px]"
          >
            {[
              { value: "all", label: "All statuses" },
              ...SURVEY_STATUSES.map(s => ({ value: s, label: s }))
            ].map(option => {
              const isSelected = statusFilter === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    setStatusFilter(option.value as SurveyStatus | "all")
                    setOffset(0)
                    setStatusFilterOpen(false)
                  }}
                  className={cn(
                    "flex items-center justify-between w-full px-2.5 py-1.5 text-[13px] font-medium rounded-md text-left transition-colors cursor-pointer outline-none",
                    isSelected
                      ? "bg-zinc-100 text-zinc-900 font-semibold"
                      : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                  )}
                >
                  <span>{option.label}</span>
                  {isSelected && <Check className="size-3.5 text-zinc-900" />}
                </button>
              )
            })}
          </PopoverContent>
        </Popover>

        <Popover open={cohortFilterOpen} onOpenChange={setCohortFilterOpen}>
          <PopoverTrigger
            render={
            <Button
              variant="outline"
              type="button"
              className="h-9 rounded-lg border border-zinc-200/60 bg-transparent px-3 text-[13px] font-medium text-zinc-600 shadow-none focus:border-zinc-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-200 hover:bg-zinc-50 hover:text-zinc-900 transition-all cursor-pointer flex items-center justify-between gap-2 min-w-[130px]"
              aria-label="Filter by target cohort"
            >
              <span className="truncate max-w-[120px] text-left">{cohortFilter || "All cohorts"}</span>
              <ChevronDown className="size-4 text-zinc-400 shrink-0 opacity-60" />
            </Button>
            }
          />

          <PopoverContent
            align="start"
            style={{ width: "max(var(--anchor-width), 160px)" }}
            className="p-1 flex flex-col gap-0.5 bg-white border border-slate-200 rounded-lg shadow-md animate-in fade-in-0 zoom-in-95 duration-100"
          >
            {[
              { value: "", label: "All cohorts" },
              ...cohortOptions.map(c => ({ value: c, label: c }))
            ].map(option => {
              const isSelected = cohortFilter === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    setCohortFilter(option.value)
                    setOffset(0)
                    setCohortFilterOpen(false)
                  }}
                  className={cn(
                    "flex items-center justify-between w-full px-2.5 py-1.5 text-[13px] font-medium rounded-md text-left transition-colors cursor-pointer outline-none",
                    isSelected
                      ? "bg-zinc-100 text-zinc-900 font-semibold"
                      : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                  )}
                >
                  <span className="truncate mr-2">{option.label}</span>
                  {isSelected && <Check className="size-3.5 text-zinc-900 shrink-0" />}
                </button>
              )
            })}
          </PopoverContent>
        </Popover>

        <Popover open={sortFilterOpen} onOpenChange={setSortFilterOpen}>
          <PopoverTrigger
            render={
            <Button
              variant="outline"
              type="button"
              className="h-9 rounded-lg border border-zinc-200/60 bg-transparent px-3 text-[13px] font-medium text-zinc-600 shadow-none focus:border-zinc-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-200 hover:bg-zinc-50 hover:text-zinc-900 transition-all cursor-pointer flex items-center justify-between gap-2 min-w-[140px]"
              aria-label="Sort surveys"
            >
              <span>
                {(() => {
                  const sortKey = `${canSortByResponseCount || sortBy !== "responses_count" ? sortBy : "created_at"}:${sortOrder}`
                  switch (sortKey) {
                    case "created_at:desc": return "Newest first"
                    case "created_at:asc": return "Oldest first"
                    case "title:asc": return "Title A-Z"
                    case "title:desc": return "Title Z-A"
                    case "responses_count:desc": return "Most responses"
                    case "status:asc": return "Status"
                    default: return "Sort"
                  }
                })()}
              </span>
              <ChevronDown className="size-4 text-zinc-400 shrink-0 opacity-60" />
            </Button>
            }
          />

          <PopoverContent
            align="start"
            style={{ width: "var(--anchor-width)" }}
            className="p-1 flex flex-col gap-0.5 bg-white border border-slate-200 rounded-lg shadow-md animate-in fade-in-0 zoom-in-95 duration-100 min-w-[160px]"
          >
            {[
              { value: "created_at:desc", label: "Newest first" },
              { value: "created_at:asc", label: "Oldest first" },
              { value: "title:asc", label: "Title A-Z" },
              { value: "title:desc", label: "Title Z-A" },
              ...(canSortByResponseCount ? [{ value: "responses_count:desc", label: "Most responses" }] : []),
              { value: "status:asc", label: "Status" },
            ].map(option => {
              const currentSortKey = `${canSortByResponseCount || sortBy !== "responses_count" ? sortBy : "created_at"}:${sortOrder}`
              const isSelected = currentSortKey === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    const [nextSortBy, nextSortOrder] = option.value.split(":")
                    if (!nextSortBy || (nextSortOrder !== "asc" && nextSortOrder !== "desc")) return
                    setSortBy(nextSortBy as typeof sortBy)
                    setSortOrder(nextSortOrder)
                    setOffset(0)
                    setSortFilterOpen(false)
                  }}
                  className={cn(
                    "flex items-center justify-between w-full px-2.5 py-1.5 text-[13px] font-medium rounded-md text-left transition-colors cursor-pointer outline-none",
                    isSelected
                      ? "bg-zinc-100 text-zinc-900 font-semibold"
                      : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                  )}
                >
                  <span>{option.label}</span>
                  {isSelected && <Check className="size-3.5 text-zinc-900" />}
                </button>
              )
            })}
          </PopoverContent>
        </Popover>

        <div className="flex items-center gap-4 sm:ml-auto">
          {canRead && (
            <div className="flex items-center gap-2 px-1">
              <Switch
                id="show-archived"
                checked={showArchived}
                onCheckedChange={(checked) => {
                  setShowArchived(checked)
                  setOffset(0)
                }}
                disabled={interactionLocked}
              />
              <label
                htmlFor="show-archived"
                className="text-[13px] font-medium text-zinc-600 cursor-pointer select-none hover:text-zinc-900 transition-colors"
              >
                Show Archived
              </label>
            </div>
          )}
          <p className="text-[13px] font-medium text-zinc-500 border-l border-zinc-200/60 pl-4">
            {totalSurveys} survey{totalSurveys === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      {/* Survey List */}
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
                      <div className="inline-flex h-9 w-9 items-center justify-center"><Eye className="size-4.5" /></div>
                      <div className="inline-flex h-9 w-9 items-center justify-center"><Pencil className="size-4.5" /></div>
                      <div className="inline-flex h-9 w-9 items-center justify-center"><Share2 className="size-4.5" /></div>
                      <div className="inline-flex h-9 w-9 items-center justify-center"><Trash className="size-4.5" /></div>
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
                    <p className="text-[13px] text-zinc-500">Create a new survey to start collecting feedback from your cohort.</p>
                  </div>
                </td>
              </tr>
            ) : (
              surveys.map((survey) => (
                <tr
                  key={survey.id}
                  className={cn("group hover:bg-zinc-50/50 transition-colors", survey.isDeleted && "bg-zinc-50/70 opacity-80")}
                >
                  <td className="px-2 py-4">
                    <div className="flex items-center gap-3.5">
                      <div className="size-9 rounded-xl border border-zinc-200/60 bg-transparent flex items-center justify-center shrink-0 shadow-none group-hover:border-zinc-300 transition-colors">
                        <FileText className="size-4 text-zinc-400 group-hover:text-zinc-600 transition-colors" />
                      </div>
                      <span className="font-semibold text-[14px] text-zinc-900">
                        {survey.title}
                      </span>
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
                          {canManage && <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRestore(survey)}
                            disabled={interactionLocked}
                            className="text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 font-medium"
                          >
                            <RotateCcw className="mr-1.5 size-3.5" />
                            Restore
                          </Button>}
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
                            {pendingAction?.type === "view" && pendingAction.surveyId === survey.id ? <Loader2 className="size-4 animate-spin" /> : <Eye className="size-4.5" />}
                          </Button>
                          {canManage && <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenEdit(survey.id)}
                            disabled={interactionLocked}
                            className="text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100"
                            title="Edit Questions & Details"
                          >
                            {pendingAction?.type === "edit" && pendingAction.surveyId === survey.id ? <Loader2 className="size-4 animate-spin" /> : <Pencil className="size-4.5" />}
                          </Button>}
                          {canManageDistribution && <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenDistribute(survey.id)}
                            disabled={interactionLocked || survey.status !== "Active"}
                            className="text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50"
                            title={survey.status === "Active" ? "Distribute" : "Activate the survey before distributing"}
                          >
                            {pendingAction?.type === "distribute" && pendingAction.surveyId === survey.id ? <Loader2 className="size-4 animate-spin" /> : <Share2 className="size-4.5" />}
                          </Button>}
                          {canManage && <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteConfirmId(survey.id)}
                            disabled={interactionLocked}
                            className="text-zinc-400 hover:text-red-600 hover:bg-red-50"
                            title="Archive"
                          >
                            {pendingAction?.type === "delete" && pendingAction.surveyId === survey.id ? <Loader2 className="size-4 animate-spin" /> : <Trash className="size-4.5" />}
                          </Button>}
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

      {totalSurveys > 20 && (
        <div className="flex items-center justify-end gap-3 mt-4">
          <p className="mr-auto text-[13px] font-medium text-zinc-500">
            Showing {offset + 1}-{Math.min(offset + surveys.length, totalSurveys)} of {totalSurveys}
          </p>
          <Button variant="outline" size="sm" onClick={() => setOffset(Math.max(0, offset - 20))} disabled={offset === 0 || listLoading} className="border-zinc-200 text-zinc-600 shadow-sm">
            Previous
          </Button>
          <Button variant="outline" size="sm" onClick={() => setOffset(offset + 20)} disabled={offset + surveys.length >= totalSurveys || listLoading} className="border-zinc-200 text-zinc-600 shadow-sm">
            Next
          </Button>
        </div>
      )}
    </div>
  )
}
