"use client"

import { useMemo } from "react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from "recharts"
import type { SurveyResponseAggregate } from "@/lib/surveys"

export interface ClientIncomeDistributionProps {
  distribution?: SurveyResponseAggregate | null
  isLoading?: boolean
  isExport?: boolean
}

// Ordered income tiers
const ORDERED_TIERS = [
  "Below ₱15,000",
  "₱15,001 – ₱25,000",
  "₱25,001 – ₱40,000",
  "₱40,001 – ₱60,000",
  "Above ₱60,000",
]

const TIER_COLORS: Record<string, string> = {
  "Below ₱15,000": "#94a3b8",      // slate-400
  "₱15,001 – ₱25,000": "#6366f1",  // indigo-500
  "₱25,001 – ₱40,000": "#4f46e5",  // indigo-600
  "₱40,001 – ₱60,000": "#4338ca",  // indigo-700
  "Above ₱60,000": "#3730a3",      // indigo-800
}

const TIER_SHORT_NAMES: Record<string, string> = {
  "Below ₱15,000": "< ₱15k",
  "₱15,001 – ₱25,000": "₱15k–₱25k",
  "₱25,001 – ₱40,000": "₱25k–₱40k",
  "₱40,001 – ₱60,000": "₱40k–₱60k",
  "Above ₱60,000": "> ₱60k",
}

export function ClientIncomeDistribution({
  distribution,
  isLoading,
  isExport,
}: ClientIncomeDistributionProps) {
  const chartData = useMemo(() => {
    if (!distribution || distribution.total === 0) return null

    const cellMap = new Map<string, number>()
    distribution.cells.forEach((c) => {
      cellMap.set(String(c.value).trim(), c.count)
    })

    const data = ORDERED_TIERS.map((tier) => {
      const count = cellMap.get(tier) || 0
      const pct = distribution.total > 0 ? Math.round((count / distribution.total) * 100) : 0
      return {
        name: tier,
        shortName: TIER_SHORT_NAMES[tier] || tier,
        count,
        pct,
      }
    })

    // Find modal (highest) tier
    const topTier = [...data].sort((a, b) => b.count - a.count)[0]
    // Calculate percentage above 25k
    const above25k = data
      .filter((d) => d.name === "₱25,001 – ₱40,000" || d.name === "₱40,001 – ₱60,000" || d.name === "Above ₱60,000")
      .reduce((sum, d) => sum + d.count, 0)
    const above25kPct = distribution.total > 0 ? Math.round((above25k / distribution.total) * 100) : 0

    return {
      data,
      total: distribution.total,
      topTier: topTier && topTier.count > 0 ? topTier.name : "N/A",
      above25kPct,
    }
  }, [distribution])

  return (
    <div className="flex flex-col w-full">
      {/* Editorial Header */}
      <div className={isExport ? "mb-10 flex items-start justify-between" : "mb-8 flex items-start justify-between"}>
        <div>
          <h3 className={isExport ? "text-3xl font-bold tracking-tight text-slate-900" : "text-2xl font-bold tracking-tight text-slate-900"}>
            Monthly Income Distribution
          </h3>
          <p className={isExport ? "text-base text-slate-500 mt-2" : "text-sm text-slate-500 mt-1"}>
            Self-reported monthly compensation tiers among employed graduates
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="animate-pulse flex flex-col gap-4 py-8">
          <div className="h-6 w-48 bg-slate-100 rounded" />
          <div className="h-48 w-full bg-slate-100 rounded-xl" />
        </div>
      ) : !chartData ? (
        <div className="text-slate-400 text-sm py-8">
          No income distribution data available for the current filter selection.
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {/* Key Stat Typography */}
          <div className="flex flex-wrap items-baseline gap-12 border-b border-slate-100 pb-6 mb-2">
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Modal Range
              </span>
              <span className="text-2xl font-medium tracking-tight text-slate-900">
                {chartData.topTier}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-500">
                Earning &gt; ₱25k/mo
              </span>
              <span className="text-2xl font-medium tracking-tight text-indigo-900">
                {chartData.above25kPct}%
              </span>
            </div>
          </div>

          {/* Vertical Bar Chart */}
          <div className="h-80 w-full mt-6">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData.data}
                margin={{ top: 10, right: 0, left: -20, bottom: 0 }}
              >
                <XAxis
                  dataKey="shortName"
                  axisLine={{ stroke: "#e2e8f0" }}
                  tickLine={false}
                  tick={{ fill: "#64748b", fontSize: 11 }}
                  interval={0}
                />
                <YAxis
                  type="number"
                  unit="%"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                />
                <Tooltip
                  cursor={{ fill: "rgba(241, 245, 249, 0.6)" }}
                  contentStyle={{
                    borderRadius: "8px",
                    border: "1px solid #e2e8f0",
                    boxShadow: "0 4px 12px -2px rgb(0 0 0 / 0.08)",
                    fontSize: "12px",
                  }}
                  formatter={(value: unknown, _name: unknown, entry: unknown) => {
                    const item = (entry as { payload: { count: number; pct: number } }).payload
                    return [`${item.count} alumni (${item.pct}%)`, "Share"]
                  }}
                  labelFormatter={(_label, payload) => {
                    if (payload && payload.length > 0 && payload[0]?.payload) {
                      return payload[0].payload.name
                    }
                    return ""
                  }}
                />
                <Bar
                  dataKey="pct"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={64}
                >
                  <LabelList
                    dataKey="count"
                    position="top"
                    fill="#64748b"
                    fontSize={12}
                    fontWeight={500}
                  />
                  {chartData.data.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={TIER_COLORS[entry.name] || "#6366f1"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  )
}
