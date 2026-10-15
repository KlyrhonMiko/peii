"use client"

import type { ReactNode } from "react"
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts"
import type { SurveyResponseAggregate } from "@/lib/surveys"
import { cn } from "@/lib/utils"

export interface OutcomeDonutSegment {
  key: string
  label: string
  count: number
  pct: number
  color: string
}

export interface OutcomeDonutCardProps {
  title: string
  description: ReactNode
  /** Short label under the donut, e.g. "Report Job Alignment". */
  summaryLabel: string
  centerPct: number
  centerCaption: string
  segments: OutcomeDonutSegment[]
  total: number
  emptyMessage: string
  isLoading?: boolean
  isExport?: boolean
}

// Every donut card shares these slots. The body sits at the bottom of the card and the legend
// reserves five rows, so rings line up across a grid row whatever the header wraps to.
export function OutcomeDonutCard({
  title,
  description,
  summaryLabel,
  centerPct,
  centerCaption,
  segments,
  total,
  emptyMessage,
  isLoading,
  isExport,
}: OutcomeDonutCardProps) {
  const visible = segments.filter((s) => s.count > 0)
  const bodyText = isExport ? "text-base" : "text-sm"

  return (
    <div className="flex flex-1 flex-col w-full">
      <div className={cn("pr-14", isExport ? "mb-10" : "mb-8")}>
        <h3 className={cn("font-bold tracking-tight text-slate-900", isExport ? "text-3xl" : "text-2xl")}>
          {title}
        </h3>
        <p className={cn("text-slate-500", isExport ? "text-base mt-2" : "text-sm mt-1")}>
          {description}
        </p>
      </div>

      {isLoading ? (
        <div className="mt-auto flex flex-col items-center gap-10 py-6 animate-pulse">
          <div className="aspect-square w-full max-w-56 rounded-full border-25 border-slate-100" />
          <div className="flex flex-col w-full max-w-sm gap-3.5">
            <div className="h-4 w-2/3 self-center bg-slate-100 rounded" />
            <div className="h-3 w-full bg-slate-100 rounded-full" />
            <div className="h-3 w-full bg-slate-100 rounded-full" />
          </div>
        </div>
      ) : total === 0 || visible.length === 0 ? (
        <div className="text-slate-400 text-sm py-8">{emptyMessage}</div>
      ) : (
        <div className="mt-auto flex flex-col items-center gap-10 py-6">
          <div className="relative aspect-square w-full max-w-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={visible}
                  cx="50%"
                  cy="50%"
                  innerRadius="71%"
                  outerRadius="94%"
                  paddingAngle={3}
                  dataKey="count"
                  nameKey="label"
                  stroke="none"
                  cornerRadius={4}
                >
                  {visible.map((segment) => (
                    <Cell key={segment.key} fill={segment.color} />
                  ))}
                </Pie>
                <Tooltip
                  cursor={false}
                  wrapperStyle={{ zIndex: 100 }}
                  contentStyle={{
                    backgroundColor: "#ffffff",
                    borderRadius: "8px",
                    border: "1px solid #e2e8f0",
                    boxShadow: "0 4px 12px -2px rgb(0 0 0 / 0.08)",
                    color: "#0f172a",
                    fontSize: "12px",
                    padding: "8px 12px",
                  }}
                  itemStyle={{ color: "#334155", fontWeight: 500 }}
                  formatter={(value: unknown, name: unknown) => {
                    const count = Number(value)
                    const pct = Math.round((count / total) * 100)
                    return [`${count} (${pct}%)`, String(name)]
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-5xl font-light tracking-tighter text-slate-900 leading-none">
                {centerPct}%
              </span>
              <span className="text-xs font-bold uppercase tracking-widest text-slate-400 mt-2">
                {centerCaption}
              </span>
            </div>
          </div>

          <div className="flex flex-col w-full max-w-sm">
            <div className="flex flex-col mb-6 items-center text-center">
              <span className={cn("font-medium text-slate-800 leading-snug", isExport ? "text-lg" : "text-base")}>
                {summaryLabel}
              </span>
              <span className={cn(bodyText, "font-normal text-slate-500 mt-1.5 leading-snug")}>
                Based on {total} {total === 1 ? "response" : "responses"}
              </span>
            </div>

            {/* Five rows of text-sm (20px) or text-base (24px) with gap-3.5 between them. */}
            <div className={cn("flex flex-col gap-3.5", isExport ? "min-h-44" : "min-h-39")}>
              {visible.map((segment) => (
                <div key={segment.key} className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <span className="size-3 rounded-full shrink-0" style={{ backgroundColor: segment.color }} />
                    <span className={cn(bodyText, "font-medium text-slate-600 truncate")}>{segment.label}</span>
                  </div>
                  <span className={cn(bodyText, "font-semibold text-slate-900 tabular-nums shrink-0")}>
                    {segment.pct}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Likert palette aligned with the Employability dimension.
const LIKERT_SCALE = [
  { key: "Strongly Agree", color: "#7c3aed" },    // violet-600
  { key: "Agree", color: "#a78bfa" },             // violet-400
  { key: "Neutral", color: "#ddd6fe" },           // violet-200
  { key: "Disagree", color: "#cbd5e1" },          // slate-300
  { key: "Strongly Disagree", color: "#e2e8f0" }, // slate-200
]

/** Orders Likert cells and returns the combined favorable share, rounded once. */
export function likertDonutData(distribution: SurveyResponseAggregate | null) {
  const total = distribution?.total ?? 0
  const order = LIKERT_SCALE.map((s) => s.key)
  const segments = (distribution?.cells ?? [])
    .map((c) => {
      const name = String(c.value)
      return {
        key: name,
        label: name,
        count: c.count,
        pct: total > 0 ? Math.round((c.count / total) * 100) : 0,
        color: LIKERT_SCALE.find((s) => s.key === name)?.color ?? "#cbd5e1",
      }
    })
    .sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key))

  const favorable = segments
    .filter((s) => s.key === "Strongly Agree" || s.key === "Agree")
    .reduce((acc, s) => acc + s.count, 0)

  return { segments, total, favorablePct: total > 0 ? Math.round((favorable / total) * 100) : 0 }
}
