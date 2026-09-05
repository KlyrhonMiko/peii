"use client"

import { useMemo } from "react"

export interface PEIIDomainScore {
  dimension: string
  preGrad: number
  postGrad: number
}

export interface ClientDomainGainChartProps {
  data: PEIIDomainScore[]
  isLoading?: boolean
}

export function ClientDomainGainChart({ data, isLoading }: ClientDomainGainChartProps) {
  const chartData = useMemo(() => {
    return data
      .map(d => ({
        ...d,
        gain: Math.max(0, d.postGrad - d.preGrad), 
      }))
      .sort((a, b) => b.gain - a.gain)
  }, [data])

  const dimensionColors: Record<string, { pre: string, post: string }> = {
    "Civic Engagement and Community Contribution": { pre: "bg-blue-200", post: "bg-blue-500" },
    "Employability and Economic Mobility": { pre: "bg-purple-200", post: "bg-purple-500" },
    "Family Upliftment and Financial Stability": { pre: "bg-rose-200", post: "bg-rose-500" },
    "Government Trust and LGU Support Valuation": { pre: "bg-amber-200", post: "bg-amber-500" },
    "Personal Development and Life Quality": { pre: "bg-emerald-200", post: "bg-emerald-500" },
  }

  return (
    <div className="w-full flex flex-col">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-slate-900">Domain Improvement</h3>
          <p className="text-sm text-slate-500 mt-1">
            Cohort average scores (1-5 scale): Pre-grad baseline vs. post-grad outcome
          </p>
        </div>
      </div>

      <div className="flex-1 w-full relative">
        {isLoading ? (
          <div className="w-full h-[300px] flex items-center justify-center">
            <div className="animate-pulse flex space-x-2">
              <div className="h-2 w-2 bg-slate-300 rounded-full"></div>
              <div className="h-2 w-2 bg-slate-300 rounded-full"></div>
              <div className="h-2 w-2 bg-slate-300 rounded-full"></div>
            </div>
          </div>
        ) : chartData.length === 0 ? (
          <div className="w-full h-[300px] flex items-center justify-center text-slate-400 text-sm">
            No domain data available
          </div>
        ) : (
          <div className="flex flex-col h-[460px]">
            {/* Chart Area */}
            <div className="flex-1 flex mt-2">
              {/* Y-axis */}
              <div className="w-8 flex flex-col justify-between text-[10px] font-bold text-slate-400 text-right pr-4 py-0">
                {[5, 4, 3, 2, 1, 0].map(tick => (
                  <span key={tick} className={`leading-none transform -translate-y-1/2 ${tick === 0 ? 'opacity-0' : ''}`}>
                    {tick}
                  </span>
                ))}
              </div>
              
              {/* Chart Grid & Bars */}
              <div className="flex-1 relative flex flex-col">
                <div className="relative flex-1">
                  {/* Grid Lines */}
                  <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                    {[5, 4, 3, 2, 1, 0].map(tick => (
                      <div key={tick} className={`w-full h-[1px] ${tick === 0 ? 'bg-transparent' : 'bg-slate-200/60'}`}></div>
                    ))}
                  </div>

                  {/* Bars Container */}
                  <div className="absolute inset-0 flex justify-around items-end z-10">
                    {chartData.map((d, i) => {
                      const color = dimensionColors[d.dimension] || { pre: "bg-slate-200", post: "bg-slate-500" }
                      // Calculate height based on 0-5 scale
                      const preHeight = Math.max(0, (d.preGrad / 5) * 100)
                      const postHeight = Math.max(0, (d.postGrad / 5) * 100)

                      return (
                        <div key={d.dimension} className="flex flex-col items-center justify-end h-full w-full group relative animate-in fade-in slide-in-from-bottom-2 duration-700 fill-mode-both" style={{ animationDelay: `${i * 100}ms` }}>
                          {/* Gain Label (Hover) */}
                          <div className="absolute -top-6 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-semibold text-slate-500 whitespace-nowrap bg-white px-2 py-1 rounded shadow-sm border border-slate-100 z-20">
                            +{d.gain.toFixed(2)} gain
                          </div>

                          {/* Bar Pair */}
                          <div className="flex items-end justify-center gap-1 w-full h-full relative px-1 md:px-2">
                             <div 
                               className={`w-full max-w-[28px] ${color.pre} rounded-t-sm transition-all duration-700`}
                               style={{ height: `${preHeight}%` }}
                               title={`Pre-Grad Baseline: ${d.preGrad.toFixed(2)}`}
                             ></div>
                             <div 
                               className={`w-full max-w-[28px] ${color.post} rounded-t-sm transition-all duration-700 shadow-sm`}
                               style={{ height: `${postHeight}%` }}
                               title={`Post-Grad Outcome: ${d.postGrad.toFixed(2)}`}
                             ></div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* X-axis Labels Container */}
                <div className="flex justify-around items-start pt-4 border-t border-slate-200">
                  {chartData.map((d) => (
                    <div key={d.dimension} className="w-full text-center px-1">
                      <span className="text-[10px] sm:text-xs font-medium text-slate-600 leading-tight block break-words">
                        {d.dimension}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Legend */}
            <div className="flex items-center justify-center gap-6 mt-6 pt-6 text-xs text-slate-500 font-medium uppercase tracking-wider">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-sm bg-slate-200 border border-slate-300"></div>
                <span>Pre-Grad (Lighter)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-sm bg-slate-500"></div>
                <span>Post-Grad (Solid)</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
