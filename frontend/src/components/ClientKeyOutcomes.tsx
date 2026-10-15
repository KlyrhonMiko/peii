"use client"

import { useMemo } from "react"
import type { SurveyResponseAggregate } from "@/lib/surveys"
import { OutcomeDonutCard, likertDonutData } from "./OutcomeDonutCard"

export interface ClientKeyOutcomesProps {
  distribution: SurveyResponseAggregate | null
  isLoading?: boolean
  isExport?: boolean
}

export function ClientKeyOutcomes({ distribution, isLoading, isExport }: ClientKeyOutcomesProps) {
  const chartData = useMemo(() => likertDonutData(distribution), [distribution])

  return (
    <OutcomeDonutCard
      title="Employment Stability"
      description={<>&ldquo;I have a stable source of income or employment&rdquo; (Post-Grad)</>}
      summaryLabel="Report Stable Employment"
      centerPct={chartData.favorablePct}
      centerCaption="Favorable"
      segments={chartData.segments}
      total={chartData.total}
      emptyMessage="No employment data available in current survey"
      {...(isLoading !== undefined && { isLoading })}
      {...(isExport !== undefined && { isExport })}
    />
  )
}
