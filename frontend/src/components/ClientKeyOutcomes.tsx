"use client"

import { useMemo } from "react"
import type { SurveyResponseAggregate } from "@/lib/surveys"

export interface ClientKeyOutcomesProps {
  aggregates: SurveyResponseAggregate[]
  isLoading?: boolean
}

// Colors for the Likert scale segments aligned with Employability dimension
const SCALE_COLORS: Record<string, string> = {
  "Strongly Agree": "bg-violet-600",
  "Agree": "bg-violet-400",
  "Neutral": "bg-violet-200",
  "Disagree": "bg-slate-300",
  "Strongly Disagree": "bg-slate-200"
}

export function ClientKeyOutcomes({ aggregates, isLoading }: ClientKeyOutcomesProps) {
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
    const positiveCount = data
      .filter(d => d.name === "Strongly Agree" || d.name === "Agree")
      .reduce((acc, curr) => acc + curr.value, 0)
      
    return { data, total, positivePct: total > 0 ? (positiveCount / total) * 100 : 0 }
  }, [aggregates])

  return (
    <div className="flex flex-col">
      <div className="mb-6 flex flex-col">
        <div className="mb-2">
          <span className="border-l-2 border-violet-500 pl-2 text-[10px] font-bold uppercase tracking-[0.2em] text-violet-600">
            Employability Domain
          </span>
        </div>
        <h3 className="font-semibold text-slate-900">Employment Stability</h3>
        <p className="text-sm text-slate-500 mt-1">
          &ldquo;I have a stable source of income or employment&rdquo; (Post-Grad)
        </p>
      </div>

      <div className="flex flex-col mt-4">
        {isLoading ? (
          <div className="animate-pulse flex flex-col gap-4">
            <div className="h-12 w-24 bg-slate-100 rounded"></div>
            <div className="h-3 w-full bg-slate-100 rounded-full"></div>
          </div>
        ) : !chartData || chartData.total === 0 ? (
          <div className="text-slate-400 text-sm">No employment data available in current survey</div>
        ) : (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col">
              <span className="text-5xl font-light tracking-tighter text-slate-900 leading-[1.1] break-words">
                {Math.round(chartData.positivePct)}%
              </span>
              <span className="text-sm font-medium text-slate-500 mt-2">
                Report Stable Employment
              </span>
            </div>

            {/* Segmented Bar */}
            <div className="flex flex-col gap-3">
              <div className="w-full flex h-3 rounded-full overflow-hidden">
                {chartData.data.map(segment => (
                  <div
                    key={segment.name}
                    className={`${SCALE_COLORS[segment.name] || 'bg-slate-100'} h-full transition-all hover:opacity-80`}
                    style={{ width: `${(segment.value / chartData.total) * 100}%` }}
                    title={`${segment.name}: ${Math.round((segment.value / chartData.total) * 100)}%`}
                  />
                ))}
              </div>
              
              {/* Legend */}
              <div className="flex flex-wrap gap-x-5 gap-y-2 mt-2">
                {chartData.data.map(segment => (
                  <div key={segment.name} className="flex items-center gap-1.5">
                    <div className={`w-3.5 h-1 rounded-[1px] ${SCALE_COLORS[segment.name] || 'bg-slate-100'}`} />
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">
                      {segment.name}
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
