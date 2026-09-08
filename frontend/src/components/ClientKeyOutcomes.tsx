"use client"

import { useMemo } from "react"
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts"
import type { SurveyResponseAggregate } from "@/lib/surveys"

export interface ClientKeyOutcomesProps {
  aggregates: SurveyResponseAggregate[]
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

export function ClientKeyOutcomes({ aggregates, isLoading, isExport }: ClientKeyOutcomesProps) {
  const chartData = useMemo(() => {
    if (!aggregates || aggregates.length === 0) return null
    
    const matchingQuestions = aggregates.filter(a => 
      a.question_text.toLowerCase().includes('stable source of income or employment')
    )
    const employmentQuestion = matchingQuestions.length > 1 ? matchingQuestions[1] : matchingQuestions[0]

    if (!employmentQuestion) return null

    const data = employmentQuestion.cells
      .map(c => ({
        name: String(c.value),
        value: c.count
      }))
      .filter(c => c.value > 0)
      
    // Sort in standard Likert order
    const order = ["Strongly Agree", "Agree", "Neutral", "Disagree", "Strongly Disagree"]
    data.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name))

    const total = data.reduce((acc, curr) => acc + curr.value, 0)
    
    const dataWithPct = data.map(c => ({
      ...c,
      pct: total > 0 ? Math.round((c.value / total) * 100) : 0
    }))

    const positivePct = dataWithPct
      .filter(d => d.name === "Strongly Agree" || d.name === "Agree")
      .reduce((acc, curr) => acc + curr.pct, 0)
      
    return { data: dataWithPct, total, positivePct }
  }, [aggregates])

  return (
    <div className="flex flex-col">
      <div className={isExport ? "mb-4 flex flex-col min-h-[130px]" : "mb-6 flex flex-col"}>
        <div className="mb-2">
          <span className={`border-l-2 border-violet-500 pl-2 font-bold uppercase tracking-[0.2em] text-violet-600 ${isExport ? 'text-xs' : 'text-[10px]'}`}>
            Employability Domain
          </span>
        </div>
        <h3 className={isExport ? "text-2xl font-bold tracking-tight text-slate-900" : "text-xl font-bold tracking-tight text-slate-900"}>
          Employment Stability
        </h3>
        <p className={isExport ? "text-base text-slate-500 mt-1.5" : "text-sm text-slate-500 mt-1"}>
          &ldquo;I have a stable source of income or employment&rdquo; (Post-Grad)
        </p>
      </div>

      <div className="flex flex-col">
        {isLoading ? (
          <div className="animate-pulse flex flex-col gap-4">
            <div className="h-12 w-24 bg-slate-100 rounded"></div>
            <div className="h-3 w-full bg-slate-100 rounded-full"></div>
          </div>
        ) : !chartData || chartData.total === 0 ? (
          <div className="text-slate-400 text-sm">No employment data available in current survey</div>
        ) : (
          <div className="flex flex-col items-center mt-8">
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
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px -2px rgb(0 0 0 / 0.1)', fontSize: '13px' }}
                    itemStyle={{ color: '#334155' }}
                    formatter={(value: unknown, name: unknown) => [`${String(value)} responses (${Math.round((Number(value) / chartData.total) * 100)}%)`, String(name)]}
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
            <div className={`flex flex-col w-full max-w-sm mt-10`}>
              <div className="flex flex-col mb-6 items-center text-center">
                <span className={`${isExport ? 'text-lg' : 'text-base'} font-medium text-slate-800 leading-snug`}>
                  Report Stable Employment
                </span>
                <span className={`${isExport ? 'text-base' : 'text-sm'} font-normal text-slate-500 mt-1.5 leading-snug`}>
                  Based on {chartData.total} responses
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
    </div>
  )
}
