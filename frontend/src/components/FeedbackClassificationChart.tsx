"use client"

import type { FeedbackClassification } from "@/lib/surveys"

export function FeedbackClassificationChart({ data }: { data?: FeedbackClassification[] }) {
  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-slate-500 text-sm bg-slate-50/50">
        No sentiment data available for this cohort.
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full w-full relative">
      <div className="mb-6 flex flex-col gap-1">
        <h3 className="font-semibold text-slate-900">Feedback Sentiment by Dimension</h3>
        <p className="text-sm text-slate-500">Distribution of positive, neutral, and negative feedback</p>
      </div>

      <div className="flex flex-col gap-8 flex-1 justify-center px-2">
        {data.map((row) => {
          const total = row.positive + row.neutral + row.negative
          if (total === 0) return null
          
          const posPct = (row.positive / total) * 100
          const neuPct = (row.neutral / total) * 100
          const negPct = (row.negative / total) * 100

          return (
            <div key={row.dimension} className="flex flex-col gap-3 group py-1">
              <div className="flex justify-between items-end text-sm">
                <span className="font-medium text-slate-700">{row.dimension}</span>
                <span className="font-medium text-slate-900 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  {total} Comments
                </span>
              </div>
              
              {/* The Track */}
              <div className="w-full h-3 bg-slate-100 rounded-full flex overflow-hidden">
                {posPct > 0 && (
                  <div 
                    className="bg-slate-900 h-full transition-all duration-1000 ease-out"
                    style={{ width: `${posPct}%` }}
                    title={`${posPct.toFixed(1)}% Positive`}
                  />
                )}
                {neuPct > 0 && (
                  <div 
                    className="bg-slate-200 h-full transition-all duration-1000 ease-out"
                    style={{ width: `${neuPct}%` }}
                    title={`${neuPct.toFixed(1)}% Neutral`}
                  />
                )}
                {negPct > 0 && (
                  <div 
                    className="bg-slate-400 h-full transition-all duration-1000 ease-out"
                    style={{ width: `${negPct}%` }}
                    title={`${negPct.toFixed(1)}% Negative`}
                  />
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-10 flex flex-col sm:flex-row gap-6 px-2">
        <div className="flex items-start gap-2 flex-1">
          <div className="w-3 h-3 bg-slate-900 rounded-sm shrink-0 mt-[2px]" />
          <div className="flex flex-col">
            <span className="text-[11px] uppercase font-bold tracking-wider text-slate-900">Positive</span>
          </div>
        </div>
        <div className="flex items-start gap-2 flex-1">
          <div className="w-3 h-3 bg-slate-200 rounded-sm shrink-0 mt-[2px]" />
          <div className="flex flex-col">
            <span className="text-[11px] uppercase font-bold tracking-wider text-slate-900">Neutral</span>
          </div>
        </div>
        <div className="flex items-start gap-2 flex-1">
          <div className="w-3 h-3 bg-slate-400 rounded-sm shrink-0 mt-[2px]" />
          <div className="flex flex-col">
            <span className="text-[11px] uppercase font-bold tracking-wider text-slate-900">Negative</span>
          </div>
        </div>
      </div>
    </div>
  )
}
