"use client"

import { useMemo } from "react"
import type { SurveyResponseAggregate } from "@/lib/surveys"
import { OutcomeDonutCard, likertDonutData } from "./OutcomeDonutCard"

export interface ClientDegreeAlignmentProps {
  distribution: SurveyResponseAggregate | null
  isLoading?: boolean
  isExport?: boolean
}

export function ClientDegreeAlignment({ distribution, isLoading, isExport }: ClientDegreeAlignmentProps) {
  const chartData = useMemo(() => likertDonutData(distribution), [distribution])

  return (
    <OutcomeDonutCard
      title="Degree Alignment"
      description={<>&ldquo;My job is aligned with my degree&rdquo; (Post-Grad)</>}
      summaryLabel="Report Job Alignment"
      centerPct={chartData.favorablePct}
      centerCaption="Favorable"
      segments={chartData.segments}
      total={chartData.total}
      emptyMessage="No alignment data available in current survey"
      {...(isLoading !== undefined && { isLoading })}
      {...(isExport !== undefined && { isExport })}
    />
  )
}
