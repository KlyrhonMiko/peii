"use client"

import { useMemo } from "react"
import type { SurveyResponseAggregate } from "@/lib/surveys"
import { OutcomeDonutCard } from "./OutcomeDonutCard"

const CONTRACT_COLORS: Record<string, string> = {
  "Permanent": "#6366f1", // indigo-500
  "Contractual": "#818cf8", // indigo-400
  "Freelance": "#c7d2fe", // indigo-200
  "Project-based": "#e2e8f0", // slate-200
}
const DEFAULT_COLOR = "#f1f5f9" // slate-100

export interface ClientEmploymentStabilityProps {
  statusDistribution?: SurveyResponseAggregate | null
  typeDistribution?: SurveyResponseAggregate | null
  isLoading?: boolean
  isExport?: boolean
}

// The card charts contract type; statusDistribution stays in the props contract for callers.
export function ClientEmploymentStability({
  typeDistribution,
  isLoading,
  isExport,
}: ClientEmploymentStabilityProps) {
  const chartData = useMemo(() => {
    const total = typeDistribution?.total ?? 0
    const cells = typeDistribution?.cells ?? []
    const permanentCount = cells.find((c) => String(c.value).includes("Permanent"))?.count || 0

    const segments = cells.map((c) => {
      const name = String(c.value)
      return {
        key: name,
        label: name,
        count: c.count,
        pct: total > 0 ? Math.round((c.count / total) * 100) : 0,
        color: CONTRACT_COLORS[name] ?? DEFAULT_COLOR,
      }
    })

    return {
      segments,
      total,
      permanentPct: total > 0 ? Math.round((permanentCount / total) * 100) : 0,
    }
  }, [typeDistribution])

  return (
    <OutcomeDonutCard
      title="Employment Quality & Security"
      description="Full-time placement and permanent contract rate"
      summaryLabel="Contract Type"
      centerPct={chartData.permanentPct}
      centerCaption="Permanent"
      segments={chartData.segments}
      total={chartData.total}
      emptyMessage="No employment security data available in the current survey."
      {...(isLoading !== undefined && { isLoading })}
      {...(isExport !== undefined && { isExport })}
    />
  )
}
