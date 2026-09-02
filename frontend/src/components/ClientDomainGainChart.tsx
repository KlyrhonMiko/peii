"use client"

import { useMemo } from "react"
import type { PEIIDomainScore } from "./PEIIDimensionsChart"

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

  return (
    <div className="w-full flex flex-col">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-slate-900">Domain Improvement</h3>
          <p className="text-sm text-slate-500 mt-1">
            Pre-grad baseline vs. post-grad outcome
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
          <div className="flex flex-col">
            {/* Axis Header */}
            <div className="flex w-full text-[10px] uppercase tracking-widest text-slate-400 font-bold border-b border-slate-200 pb-3 mb-6">
              <div className="w-[40%] md:w-1/3">Domain</div>
              <div className="w-[60%] md:w-2/3 flex justify-between relative pl-4 pr-2">
                <span>0</span>
                <span>1</span>
                <span>2</span>
                <span>3</span>
                <span>4</span>
                <span>5</span>
              </div>
            </div>

            {/* Dumbbell Rows */}
            <div className="flex flex-col gap-10">
              {chartData.map((d, i) => {
                const preLeft = (d.preGrad / 5) * 100
                const postLeft = (d.postGrad / 5) * 100
                const width = Math.abs(postLeft - preLeft)
                const isPositive = d.postGrad >= d.preGrad

                return (
                  <div key={d.dimension} className="flex items-center w-full group animate-in fade-in slide-in-from-bottom-2 duration-700 fill-mode-both" style={{ animationDelay: `${i * 100}ms`}}>
                    {/* Label */}
                    <div className="w-[40%] md:w-1/3 pr-4 md:pr-8 flex flex-col">
                      <span className="text-sm md:text-base font-medium text-slate-900 leading-tight">{d.dimension}</span>
                      <span className="text-xs font-semibold text-slate-500 mt-1">+{d.gain.toFixed(2)} gain</span>
                    </div>
                    
                    {/* Track Container */}
                    <div className="w-[60%] md:w-2/3 relative h-8 flex items-center pl-4 pr-2">
                      
                      {/* Sub-grid lines (vertical ticks) */}
                      {[0, 20, 40, 60, 80, 100].map(tick => (
                        <div key={tick} className="absolute h-full w-[1px] bg-slate-100" style={{ left: `calc(${tick}% + 16px - ${tick * 0.16}px)` }}></div>
                      ))}

                      {/* Thin background track */}
                      <div className="absolute w-[calc(100%-16px)] left-4 h-[1px] bg-slate-200"></div>

                      {/* Connecting Gain Line */}
                      <div 
                        className={`absolute h-1.5 ${isPositive ? 'bg-slate-900' : 'bg-slate-300'} top-1/2 -translate-y-1/2 rounded-full transition-all duration-700 origin-left`}
                        style={{ left: `calc(${Math.min(preLeft, postLeft)}% + 16px - ${Math.min(preLeft, postLeft) * 0.16}px)`, width: `calc(${width}% - 4px)` }}
                      ></div>

                      {/* Pre-Grad Baseline Dot (Hollow) */}
                      <div 
                        className="absolute w-3.5 h-3.5 rounded-full border-2 border-slate-400 bg-white top-1/2 -translate-y-1/2 z-10 transition-all duration-700 shadow-sm group-hover:scale-125 group-hover:border-slate-500"
                        style={{ left: `calc(${preLeft}% + 16px - ${preLeft * 0.16}px - 7px)` }}
                        title={`Pre-Grad Baseline: ${d.preGrad.toFixed(2)}`}
                      ></div>

                      {/* Post-Grad Outcome Dot (Solid) */}
                      <div 
                        className={`absolute w-4 h-4 rounded-full ${isPositive ? 'bg-slate-900' : 'bg-slate-400'} top-1/2 -translate-y-1/2 z-20 transition-all duration-700 shadow-sm group-hover:scale-125`}
                        style={{ left: `calc(${postLeft}% + 16px - ${postLeft * 0.16}px - 8px)` }}
                        title={`Post-Grad Outcome: ${d.postGrad.toFixed(2)}`}
                      >
                        {/* Ping animation */}
                        <div className="absolute inset-0 rounded-full bg-slate-900 opacity-20 animate-ping" style={{ animationDuration: '3s' }}></div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            
            {/* Legend */}
            <div className="flex items-center gap-6 mt-12 pt-6 border-t border-slate-200 text-xs text-slate-500 font-medium uppercase tracking-wider">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full border-2 border-slate-400 bg-white"></div>
                <span>Pre-Grad</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3.5 h-3.5 rounded-full bg-slate-900"></div>
                <span>Post-Grad</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
