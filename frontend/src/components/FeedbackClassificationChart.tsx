"use client"

import type { FeedbackClassification } from "@/lib/surveys"
import { getDimensionColor } from "@/lib/dimension-colors"

export function FeedbackClassificationChart({ 
  data, 
  isExport 
}: { 
  data?: FeedbackClassification[] | undefined
  isExport?: boolean | undefined 
}) {
  const tTitle = isExport ? "text-3xl font-bold tracking-tight text-slate-900" : "text-2xl font-bold tracking-tight text-slate-900"
  const tSub = isExport ? "text-base text-slate-500 mt-1.5" : "text-sm text-slate-500"
  const tRow = isExport ? "flex justify-between items-center text-lg mb-1" : "flex justify-between items-center text-sm"
  const tMarker = isExport ? "w-1.5 h-5 rounded-[1px] shrink-0" : "w-1 h-3.5 rounded-[1px] shrink-0"
  const tPctPos = isExport ? "text-base font-semibold text-emerald-600" : "text-xs font-semibold text-emerald-600"
  const tPctNeu = isExport ? "text-base font-semibold text-slate-500" : "text-xs font-semibold text-slate-500"
  const tPctNeg = isExport ? "text-base font-semibold text-rose-600" : "text-xs font-semibold text-rose-600"
  const tComments = isExport ? "text-base font-medium text-slate-400 opacity-60 ml-2" : "text-xs font-medium text-slate-400 opacity-60 group-hover:opacity-100 transition-opacity ml-1"
  const tTrack = isExport ? "w-full h-5 bg-slate-100 rounded-full flex overflow-hidden shadow-inner" : "w-full h-3 bg-slate-100 rounded-full flex overflow-hidden shadow-inner"
  
  const tLegendIcon = isExport ? "w-6 h-2 rounded-[2px] shadow-sm shrink-0" : "w-4 h-1.5 rounded-[2px] shadow-sm shrink-0"
  const tLegendTitle = isExport ? "text-sm uppercase font-bold tracking-wider text-slate-800" : "text-[11px] uppercase font-bold tracking-wider text-slate-800"
  const tLegendDesc = isExport ? "text-sm text-slate-400" : "text-[10px] text-slate-400"
  const tLegendDescNeg = isExport ? "text-sm text-rose-600 font-medium" : "text-[10px] text-rose-600 font-medium"
  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-slate-500 text-sm bg-slate-50/50 rounded-xl">
        No sentiment data available for this cohort.
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full w-full relative">
      <div className={isExport ? "mb-8 flex flex-col gap-1" : "mb-6 flex flex-col gap-1"}>
        <h3 className={tTitle}>
          Feedback Sentiment by Dimension
        </h3>
        <p className={tSub}>
          Distribution of positive, neutral, and negative feedback across dimensions
        </p>
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
              <div className={tRow}>
                <div className="flex items-center gap-2.5">
                  <div 
                    className={tMarker}
                    style={{ backgroundColor: color.hex }}
                  />
                  <span className="font-semibold text-slate-800">{row.dimension}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className={tPctPos}>
                    {posPct.toFixed(0)}% Pos
                  </span>
                  {neuPct > 0 && (
                    <span className={tPctNeu}>
                      {neuPct.toFixed(0)}% Neu
                    </span>
                  )}
                  {negPct > 0 && (
                    <span className={tPctNeg}>
                      {negPct.toFixed(0)}% Neg
                    </span>
                  )}
                  <span className={tComments}>
                    {total} {total === 1 ? 'Comment' : 'Comments'}
                  </span>
                </div>
              </div>
              
              {/* The Track */}
              <div className={tTrack}>
                {posPct > 0 && (
                  <div 
                    className="bg-emerald-500 h-full transition-all duration-700 ease-out hover:brightness-105"
                    style={{ width: `${posPct}%` }}
                    title={`${posPct.toFixed(1)}% Positive (${row.positive} comments)`}
                  />
                )}
                {neuPct > 0 && (
                  <div 
                    className="bg-slate-300 h-full transition-all duration-700 ease-out hover:brightness-95"
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
          <div className={`${tLegendIcon} bg-emerald-500`} />
          <div className="flex flex-col">
            <span className={tLegendTitle}>Positive</span>
            <span className={tLegendDesc}>Encouraging / constructive</span>
          </div>
        </div>
        <div className="flex items-center gap-2.5 flex-1">
          <div className={`${tLegendIcon} bg-slate-300 border border-slate-400/30`} />
          <div className="flex flex-col">
            <span className={tLegendTitle}>Neutral</span>
            <span className={tLegendDesc}>Balanced / neutral remarks</span>
          </div>
        </div>
        <div className="flex items-center gap-2.5 flex-1">
          <div className={`${tLegendIcon} bg-rose-500`} />
          <div className="flex flex-col">
            <span className={tLegendTitle}>Negative</span>
            <span className={tLegendDescNeg}>Critical / needs attention</span>
          </div>
        </div>
      </div>
    </div>
  )
}
