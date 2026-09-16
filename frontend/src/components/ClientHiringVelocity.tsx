"use client"

import { useMemo } from "react"
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts"
import type { SurveyResponseAggregate } from "@/lib/surveys"

export interface ClientHiringVelocityProps {
  distribution?: SurveyResponseAggregate | null
  isLoading?: boolean
  isExport?: boolean
}

const VELOCITY_CONFIG = [
  { key: "< 3 months", label: "< 3 Months", color: "#10b981", bg: "bg-emerald-500" },       // emerald-500
  { key: "3-6 months", label: "3–6 Months", color: "#34d399", bg: "bg-emerald-400" },       // emerald-400
  { key: "6-12 months", label: "6–12 Months", color: "#fbbf24", bg: "bg-amber-400" },       // amber-400
  { key: "> 1 year", label: "> 1 Year", color: "#f87171", bg: "bg-rose-400" },              // rose-400
  { key: "Still unemployed", label: "Seeking", color: "#cbd5e1", bg: "bg-slate-300" },      // slate-300
]

export function ClientHiringVelocity({
  distribution,
  isLoading,
  isExport,
}: ClientHiringVelocityProps) {
  const chartData = useMemo(() => {
    if (!distribution || distribution.total === 0) return null

    const cellMap = new Map<string, number>()
    distribution.cells.forEach((c) => {
      cellMap.set(String(c.value).trim(), c.count)
    })

    const items = VELOCITY_CONFIG.map((cfg) => {
      const count = cellMap.get(cfg.key) || 0
      const pct = distribution.total > 0 ? Math.round((count / distribution.total) * 100) : 0
      return {
        ...cfg,
        count,
        pct,
      }
    })

    // Calculate under 6 months absorption
    const under3mo = cellMap.get("< 3 months") || 0
    const under6mo = under3mo + (cellMap.get("3-6 months") || 0)
    const under6moPct = distribution.total > 0 ? Math.round((under6mo / distribution.total) * 100) : 0

    return {
      items,
      total: distribution.total,
      under6moPct,
    }
  }, [distribution])

  return (
    <div className="flex flex-col w-full">
      {/* Editorial Header */}
      <div className={isExport ? "mb-10 flex items-start justify-between" : "mb-8 flex items-start justify-between"}>
        <div>
          <h3 className={isExport ? "text-3xl font-bold tracking-tight text-slate-900" : "text-2xl font-bold tracking-tight text-slate-900"}>
            Hiring Velocity & Absorption Speed
          </h3>
          <p className={isExport ? "text-base text-slate-500 mt-2" : "text-sm text-slate-500 mt-1"}>
            Time elapsed between graduation and securing initial employment
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="animate-pulse flex flex-col gap-4 py-8">
          <div className="h-10 w-32 bg-slate-100 rounded" />
          <div className="h-6 w-full bg-slate-100 rounded-full" />
        </div>
      ) : !chartData ? (
        <div className="text-slate-400 text-sm py-8">
          No hiring velocity data available for the current filter selection.
        </div>
      ) : (
        <div className="flex flex-col md:flex-row items-center justify-center gap-12 md:gap-20 py-4">
          {/* Centered Donut Chart */}
          <div className="h-56 w-56 relative shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData.items.filter((i) => i.count > 0)}
                  cx="50%"
                  cy="50%"
                  innerRadius={80}
                  outerRadius={105}
                  paddingAngle={3}
                  dataKey="count"
                  nameKey="label"
                  stroke="none"
                  cornerRadius={5}
                >
                  {chartData.items
                    .filter((i) => i.count > 0)
                    .map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                </Pie>
                <Tooltip 
                  cursor={false}
                  wrapperStyle={{ zIndex: 100 }}
                  contentStyle={{ 
                    backgroundColor: '#ffffff',
                    borderRadius: '8px', 
                    border: '1px solid #e2e8f0', 
                    boxShadow: '0 4px 12px -2px rgb(0 0 0 / 0.08)', 
                    color: '#0f172a',
                    fontSize: '12px',
                    padding: '8px 12px'
                  }}
                  itemStyle={{ color: '#334155', fontWeight: 500 }}
                  formatter={(value: unknown, name: unknown) => {
                    const count = Number(value);
                    const pct = chartData.total > 0 ? Math.round((count / chartData.total) * 100) : 0;
                    return [`${count} (${pct}%)`, String(name)];
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            {/* Center Stat */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-4xl font-light tracking-tight text-slate-900">
                {chartData.under6moPct}%
              </span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-1">
                HIRED &lt; 6 MO
              </span>
            </div>
          </div>

          {/* Vertical Legend List */}
          <div className="flex flex-col w-full max-w-xs gap-3">
            <div className="text-left mb-2">
              <span className="text-xs text-slate-400 font-medium">
                Based on {chartData.total} responses
              </span>
            </div>
            {chartData.items.map((item) => {
              if (item.count === 0) return null
              return (
                <div key={item.key} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-[15px] font-medium text-slate-600">
                      {item.label}
                    </span>
                  </div>
                  <span className="text-[15px] font-semibold text-slate-900 tabular-nums">
                    {item.pct}%
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
