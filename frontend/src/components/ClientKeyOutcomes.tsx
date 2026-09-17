"use client"

import { useMemo } from "react"
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts"
import type { SurveyResponseAggregate } from "@/lib/surveys"

export interface ClientKeyOutcomesProps {
  distribution: SurveyResponseAggregate | null
  isLoading?: boolean
  isExport?: boolean
}

// Colors for the Likert scale segments aligned with Employability dimension (Hex for Recharts)
const SCALE_COLORS_HEX: Record<string, string> = {
  "Strongly Agree": "#7c3aed", // violet-600
  "Agree": "#a78bfa",          // violet-400
  "Neutral": "#ddd6fe",        // violet-200
  "Disagree": "#cbd5e1",       // slate-300
  "Strongly Disagree": "#e2e8f0" // slate-200
}

export function ClientKeyOutcomes({ distribution, isLoading, isExport }: ClientKeyOutcomesProps) {
  const chartData = useMemo(() => {
    if (!distribution) return null
    const data = distribution.cells
      .map(c => ({
        name: String(c.value),
        value: c.count
      }))
      .filter(c => c.value > 0)
      
    // Sort in standard Likert order
    const order = ["Strongly Agree", "Agree", "Neutral", "Disagree", "Strongly Disagree"]
    data.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name))

    const total = distribution.total
    
    const dataWithPct = data.map(c => ({
      ...c,
      pct: total > 0 ? Math.round((c.value / total) * 100) : 0
    }))

    const favorableCount = data
      .filter(d => d.name === "Strongly Agree" || d.name === "Agree")
      .reduce((acc, curr) => acc + curr.value, 0)
    const positivePct = total > 0 ? Math.round(favorableCount / total * 100) : 0

    return { data: dataWithPct, total, positivePct }
  }, [distribution])

  return (
    <div className="flex flex-col w-full h-full">
      {/* Editorial Header */}
      <div className={isExport ? "mb-10 flex items-start justify-between min-h-[130px]" : "mb-8 flex items-start justify-between min-h-[130px]"}>
        <div className="pr-14">
          <h3 className={isExport ? "text-3xl font-bold tracking-tight text-slate-900" : "text-2xl font-bold tracking-tight text-slate-900"}>
            Employment Stability
          </h3>
          <p className={isExport ? "text-base text-slate-500 mt-2" : "text-sm text-slate-500 mt-1"}>
            &ldquo;I have a stable source of income or employment&rdquo; (Post-Grad)
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="animate-pulse flex flex-col gap-4 py-6">
          <div className="h-12 w-24 bg-slate-100 rounded"></div>
          <div className="h-3 w-full bg-slate-100 rounded-full"></div>
        </div>
      ) : !chartData || chartData.total === 0 ? (
        <div className="text-slate-400 text-sm py-8">No employment data available in current survey</div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-10 py-6">
          {/* Donut Chart */}
          <div className="relative w-48 h-48 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData.data}
                  cx="50%"
                  cy="50%"
                  innerRadius={68}
                  outerRadius={92}
                  paddingAngle={3}
                  dataKey="value"
                  stroke="none"
                  cornerRadius={4}
                >
                  {chartData.data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={SCALE_COLORS_HEX[entry.name] || '#cbd5e1'} />
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
            {/* Center Text */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none mt-1">
              <span className="text-5xl font-light tracking-tighter text-slate-900 leading-none">
                {chartData.positivePct}%
              </span>
              <span className="text-xs uppercase font-bold tracking-widest text-slate-400 mt-2">
                Favorable
              </span>
            </div>
          </div>
          
          {/* Info Text and Legend */}
          <div className="flex flex-col w-full max-w-sm">
            <div className="flex flex-col mb-6 items-center text-center">
              <span className={`${isExport ? 'text-lg' : 'text-base'} font-medium text-slate-800 leading-snug`}>
                Report Stable Employment
              </span>
              <span className={`${isExport ? 'text-base' : 'text-sm'} font-normal text-slate-500 mt-1.5 leading-snug`}>
                Based on {chartData.total} {chartData.total === 1 ? "response" : "responses"}
              </span>
            </div>
            
            {/* Legend */}
            <div className="flex flex-col gap-3.5">
              {chartData.data.map(segment => (
                <div key={segment.name} className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: SCALE_COLORS_HEX[segment.name] || '#cbd5e1' }} />
                    <span className={`${isExport ? 'text-base' : 'text-sm'} font-medium text-slate-600 truncate`}>
                      {segment.name}
                    </span>
                  </div>
                  <span className={`${isExport ? 'text-base' : 'text-sm'} font-semibold text-slate-900 tabular-nums shrink-0`}>
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
