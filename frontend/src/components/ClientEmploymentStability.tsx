"use client"

import { useMemo } from "react"
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts"
import type { SurveyResponseAggregate } from "@/lib/surveys"

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

export function ClientEmploymentStability({
  statusDistribution,
  typeDistribution,
  isLoading,
  isExport,
}: ClientEmploymentStabilityProps) {
  const metrics = useMemo(() => {
    if (!statusDistribution && !typeDistribution) return null

    // Status items
    const statusCells = statusDistribution?.cells || []
    const statusTotal = statusDistribution?.total || 0
    const fullTimeCount = statusCells.find((c) => String(c.value).includes("full-time"))?.count || 0
    const fullTimePct = statusTotal > 0 ? Math.round((fullTimeCount / statusTotal) * 100) : 0

    // Type items
    const typeCells = typeDistribution?.cells || []
    const typeTotal = typeDistribution?.total || 0
    const permanentCount = typeCells.find((c) => String(c.value).includes("Permanent"))?.count || 0
    const permanentPct = typeTotal > 0 ? Math.round((permanentCount / typeTotal) * 100) : 0

    return {
      fullTimePct,
      fullTimeCount,
      statusTotal,
      permanentPct,
      permanentCount,
      typeTotal,
      statusBreakdown: statusCells
        .map((c) => ({
          name: String(c.value),
          count: c.count,
          pct: statusTotal > 0 ? Math.round((c.count / statusTotal) * 100) : 0,
        }))
        .filter((c) => c.count > 0),
      typeBreakdown: typeCells
        .map((c) => ({
          name: String(c.value),
          count: c.count,
          pct: typeTotal > 0 ? Math.round((c.count / typeTotal) * 100) : 0,
        }))
        .filter((c) => c.count > 0),
    }
  }, [statusDistribution, typeDistribution])

  return (
    <div className="flex flex-col w-full">
      {/* Editorial Header */}
      <div className={isExport ? "mb-10 flex items-start justify-between" : "mb-8 flex items-start justify-between"}>
        <div>
          <h3 className={isExport ? "text-3xl font-bold tracking-tight text-slate-900" : "text-2xl font-bold tracking-tight text-slate-900"}>
            Employment Quality & Security
          </h3>
          <p className={isExport ? "text-base text-slate-500 mt-2" : "text-sm text-slate-500 mt-1"}>
            Full-time placement and permanent contract rate
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="animate-pulse flex flex-col gap-4 py-6">
          <div className="h-12 w-28 bg-slate-100 rounded" />
          <div className="h-4 w-full bg-slate-100 rounded-full" />
        </div>
      ) : !metrics ? (
        <div className="text-slate-400 text-sm py-8">
          No employment security data available in the current survey.
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-10 py-6">
          {/* Centered Donut Chart */}
          <div className="h-56 w-56 relative shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={metrics.typeBreakdown}
                  cx="50%"
                  cy="50%"
                  innerRadius={80}
                  outerRadius={105}
                  paddingAngle={3}
                  dataKey="count"
                  stroke="none"
                  cornerRadius={5}
                >
                  {metrics.typeBreakdown.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={CONTRACT_COLORS[entry.name] || DEFAULT_COLOR} />
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
                    const pct = metrics.typeTotal > 0 ? Math.round((count / metrics.typeTotal) * 100) : 0;
                    return [`${count} (${pct}%)`, String(name)];
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            {/* Center Stat */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-4xl font-light tracking-tight text-slate-900">
                {metrics.permanentPct}%
              </span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-1">
                PERMANENT
              </span>
            </div>
          </div>

          {/* Vertical Legend List */}
          <div className="flex flex-col w-full max-w-xs gap-3 mt-4">
            <div className="text-center mb-2">
              <span className="text-sm text-slate-500 font-medium">
                Based on {metrics.typeTotal} responses
              </span>
            </div>
            {metrics.typeBreakdown.map((item) => (
              <div key={item.name} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: CONTRACT_COLORS[item.name] || DEFAULT_COLOR }}
                  />
                  <span className="text-[15px] font-medium text-slate-600">
                    {item.name}
                  </span>
                </div>
                <span className="text-[15px] font-semibold text-slate-900 tabular-nums">
                  {item.pct}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
