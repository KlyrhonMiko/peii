import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Switch } from "@/components/ui/switch"
import { Check, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { SURVEY_STATUSES } from "../constants"
import type { SurveyStatus } from "@/lib/surveys"
import type { useSurveyManagement } from "../useSurveyManagement"

interface SurveyListToolbarProps {
  store: ReturnType<typeof useSurveyManagement>
}

export function SurveyListToolbar({ store }: SurveyListToolbarProps) {
  const { state, actions } = store
  const {
    search,
    statusFilter,
    cohortFilter,
    sortBy,
    sortOrder,
    statusFilterOpen,
    cohortFilterOpen,
    sortFilterOpen,
    showArchived,
    totalSurveys,
    cohortOptions,
    interactionLocked,
    capabilities,
  } = state

  const {
    setSearch,
    setStatusFilter,
    setCohortFilter,
    setSortBy,
    setSortOrder,
    setStatusFilterOpen,
    setCohortFilterOpen,
    setSortFilterOpen,
    setShowArchived,
    setOffset,
  } = actions

  const { read: canRead } = capabilities
  const canSortByResponseCount = capabilities.readRaw || capabilities.export || capabilities.erase

  return (
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

      {/* Status Filter */}
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
            ...SURVEY_STATUSES.map((s) => ({ value: s, label: s })),
          ].map((option) => {
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

      {/* Cohort Filter */}
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
            ...cohortOptions.map((c) => ({ value: c, label: c })),
          ].map((option) => {
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

      {/* Sort Filter */}
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
                    case "created_at:desc":
                      return "Newest first"
                    case "created_at:asc":
                      return "Oldest first"
                    case "title:asc":
                      return "Title A-Z"
                    case "title:desc":
                      return "Title Z-A"
                    case "responses_count:desc":
                      return "Most responses"
                    case "status:asc":
                      return "Status"
                    default:
                      return "Sort"
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
          ].map((option) => {
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

      {/* Archived switch & count */}
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
  )
}
