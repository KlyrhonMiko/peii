import { Button } from "@/components/ui/button"
import type { useSurveyManagement } from "../useSurveyManagement"

interface SurveyListPaginationProps {
  store: ReturnType<typeof useSurveyManagement>
}

export function SurveyListPagination({ store }: SurveyListPaginationProps) {
  const { state, actions } = store
  const { totalSurveys, offset, surveys, listLoading } = state
  const { setOffset } = actions

  if (totalSurveys <= 20) return null

  return (
    <div className="flex items-center justify-end gap-3 mt-4">
      <p className="mr-auto text-[13px] font-medium text-zinc-500">
        Showing {offset + 1}-{Math.min(offset + surveys.length, totalSurveys)} of {totalSurveys}
      </p>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOffset(Math.max(0, offset - 20))}
        disabled={offset === 0 || listLoading}
        className="border-zinc-200 text-zinc-600 shadow-sm"
      >
        Previous
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOffset(offset + 20)}
        disabled={offset + surveys.length >= totalSurveys || listLoading}
        className="border-zinc-200 text-zinc-600 shadow-sm"
      >
        Next
      </Button>
    </div>
  )
}
