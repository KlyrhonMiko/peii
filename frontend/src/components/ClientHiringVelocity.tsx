"use client"

import { useMemo } from "react"
import type { SurveyResponseAggregate } from "@/lib/surveys"
import { OutcomeDonutCard } from "./OutcomeDonutCard"

export interface ClientHiringVelocityProps {
  distribution?: SurveyResponseAggregate | null
  isLoading?: boolean
  isExport?: boolean
}

const VELOCITY_CONFIG = [
  { key: "< 3 months", label: "< 3 Months", color: "#10b981" },       // emerald-500
  { key: "3-6 months", label: "3–6 Months", color: "#34d399" },       // emerald-400
  { key: "6-12 months", label: "6–12 Months", color: "#fbbf24" },     // amber-400
  { key: "> 1 year", label: "> 1 Year", color: "#f87171" },           // rose-400
  { key: "Still unemployed", label: "Seeking", color: "#cbd5e1" },    // slate-300
]

export function ClientHiringVelocity({
  distribution,
  isLoading,
  isExport,
}: ClientHiringVelocityProps) {
  const chartData = useMemo(() => {
    const total = distribution?.total ?? 0
    const cellMap = new Map<string, number>()
    distribution?.cells.forEach((c) => {
      cellMap.set(String(c.value).trim(), c.count)
    })

    const segments = VELOCITY_CONFIG.map((cfg) => {
      const count = cellMap.get(cfg.key) || 0
      return { ...cfg, count, pct: total > 0 ? Math.round((count / total) * 100) : 0 }
    })

    // Absorption within six months combines the two fastest buckets before rounding.
    const under6mo = (cellMap.get("< 3 months") || 0) + (cellMap.get("3-6 months") || 0)
    const under6moPct = total > 0 ? Math.round((under6mo / total) * 100) : 0

    return { segments, total, under6moPct }
  }, [distribution])

  return (
    <OutcomeDonutCard
      title="Hiring Velocity & Absorption Speed"
      description="Time elapsed between graduation and securing initial employment"
      summaryLabel="Time to First Job"
      centerPct={chartData.under6moPct}
      centerCaption="Hired < 6 mo"
      segments={chartData.segments}
      total={chartData.total}
      emptyMessage="No hiring velocity data available for the current filter selection."
      {...(isLoading !== undefined && { isLoading })}
      {...(isExport !== undefined && { isExport })}
    />
  )
}
