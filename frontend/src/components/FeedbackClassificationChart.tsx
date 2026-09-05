"use client"

import type { FeedbackClassification } from "@/lib/surveys"
import { getDimensionColor } from "@/lib/dimension-colors"

export function FeedbackClassificationChart({ data }: { data?: FeedbackClassification[] | undefined }) {
  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-slate-500 text-sm bg-slate-50/50 rounded-xl">
        No sentiment data available for this cohort.
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full w-full relative">
      <div className="mb-6 flex flex-col gap-1">
        <h3 className="font-semibold text-slate-900">Feedback Sentiment by Dimension</h3>
        <p className="text-sm text-slate-500">Distribution of positive, neutral, and negative feedback across dimensions</p>
      </div>

      <div className="flex flex-col gap-8 flex-1 justify-center px-2">
        {data.map((row) => {
          const total = row.positive + row.neutral + row.negative
          if (total === 0) return null
          
          const posPct = (row.positive / total) * 100
          const neuPct = (row.neutral / total) * 100
          const negPct = (row.negative / total) * 100
          const color = getDimensionColor(row.dimension)

          return (
            <div key={row.dimension} className="flex flex-col gap-2.5 group py-1">
              <div className="flex justify-between items-center text-sm">
                <div className="flex items-center gap-2.5">
                  <div 
                    className="w-1 h-3.5 rounded-[1px] shrink-0"
                    style={{ backgroundColor: color.hex }}
                  />
                  <span className="font-semibold text-slate-800">{row.dimension}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-emerald-600">
                    {posPct.toFixed(0)}% Pos
                  </span>
                  {negPct > 0 && (
                    <span className="text-xs font-semibold text-rose-600">
                      {negPct.toFixed(0)}% Neg
                    </span>
                  )}
                  <span className="text-xs font-medium text-slate-400 opacity-60 group-hover:opacity-100 transition-opacity">
                    {total} {total === 1 ? 'Comment' : 'Comments'}
                  </span>
                </div>
              </div>
              
              {/* The Track */}
              <div className="w-full h-3 bg-slate-100 rounded-full flex overflow-hidden shadow-inner">
                {posPct > 0 && (
                  <div 
                    className="bg-emerald-500 h-full transition-all duration-700 ease-out hover:brightness-105"
                    style={{ width: `${posPct}%` }}
                    title={`${posPct.toFixed(1)}% Positive (${row.positive} comments)`}
                  />
                )}
                {neuPct > 0 && (
                  <div 
                    className="bg-slate-200 h-full transition-all duration-700 ease-out hover:brightness-95"
                    style={{ width: `${neuPct}%` }}
                    title={`${neuPct.toFixed(1)}% Neutral (${row.neutral} comments)`}
                  />
                )}
                {negPct > 0 && (
                  <div 
                    className="bg-rose-500 h-full transition-all duration-700 ease-out hover:brightness-110"
                    style={{ width: `${negPct}%` }}
                    title={`${negPct.toFixed(1)}% Negative (${row.negative} comments)`}
                  />
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-10 flex flex-col sm:flex-row gap-6 px-2 pt-6 border-t border-slate-100">
        <div className="flex items-center gap-2.5 flex-1">
          <div className="w-4 h-1.5 rounded-[2px] bg-emerald-500 shadow-sm shrink-0" />
          <div className="flex flex-col">
            <span className="text-[11px] uppercase font-bold tracking-wider text-slate-800">Positive</span>
            <span className="text-[10px] text-slate-400">Encouraging / constructive</span>
          </div>
        </div>
        <div className="flex items-center gap-2.5 flex-1">
          <div className="w-4 h-1.5 rounded-[2px] bg-slate-200 border border-slate-300/50 shadow-sm shrink-0" />
          <div className="flex flex-col">
            <span className="text-[11px] uppercase font-bold tracking-wider text-slate-800">Neutral</span>
            <span className="text-[10px] text-slate-400">Balanced / neutral remarks</span>
          </div>
        </div>
        <div className="flex items-center gap-2.5 flex-1">
          <div className="w-4 h-1.5 rounded-[2px] bg-rose-500 shadow-sm shrink-0" />
          <div className="flex flex-col">
            <span className="text-[11px] uppercase font-bold tracking-wider text-slate-800">Negative</span>
            <span className="text-[10px] text-rose-600 font-medium">Critical / needs attention</span>
          </div>
        </div>
      </div>
    </div>
  )
}
