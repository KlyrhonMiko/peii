"use client"

import { useMemo, useState } from "react"
import { getDimensionColor } from "@/lib/dimension-colors"

export interface PEIIDomainScore {
  dimension: string
  preGrad: number
  postGrad: number
}

export interface ClientDomainGainChartProps {
  data: PEIIDomainScore[]
  isLoading?: boolean
  isExport?: boolean
}

interface DomainTooltipProps {
  data: PEIIDomainScore & { gain: number }
}

function DomainTooltip({ data }: DomainTooltipProps) {
  const color = getDimensionColor(data.dimension)

  return (
    <div className="bg-white/95 backdrop-blur-md px-3 py-2 border border-slate-200 shadow-sm text-left w-max">
      <div className="flex items-center gap-2 mb-1.5">
        <div className="w-2 h-0.5 shrink-0" style={{ backgroundColor: color.hex }} />
        <span className="font-semibold text-slate-900 text-[10px] uppercase tracking-wider leading-none">
          {data.dimension}
        </span>
      </div>
      <div className="flex items-center gap-3 text-[11px] leading-none">
        <div className="flex items-center gap-1.5">
          <span className="text-slate-500">Pre</span>
          <span className="font-mono font-medium text-slate-700">{data.preGrad.toFixed(2)}</span>
        </div>
        <span className="text-slate-300">→</span>
        <div className="flex items-center gap-1.5">
          <span className="text-slate-500">Post</span>
          <span className="font-mono font-medium text-slate-900">{data.postGrad.toFixed(2)}</span>
        </div>
        <div className="flex items-center gap-1.5 ml-1 pl-3 border-l border-slate-200">
          <span className="text-slate-500">Gain</span>
          <span className="font-mono font-semibold" style={{ color: color.hex }}>
            +{data.gain.toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  )
}

export function ClientDomainGainChart({ data, isLoading, isExport }: ClientDomainGainChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  const chartData = useMemo(() => {
    return data
      .map(d => ({
        ...d,
        gain: Math.max(0, d.postGrad - d.preGrad), 
      }))
      .sort((a, b) => b.gain - a.gain)
  }, [data])

  const activeData = hoveredIndex !== null ? chartData[hoveredIndex] ?? null : null

  return (
    <div className="w-full flex flex-col">
      {/* Editorial Header */}
      <div className={isExport ? "mb-10 flex items-start justify-between" : "mb-8 flex items-start justify-between"}>
        <div>
          <h3 className={isExport ? "text-3xl font-bold tracking-tight text-slate-900" : "text-2xl font-bold tracking-tight text-slate-900"}>
            Domain Improvement
          </h3>
          <p className={isExport ? "text-base text-slate-500 mt-2" : "text-sm text-slate-500 mt-1"}>
            Cohort average scores (1–5 scale): Pre-grad baseline vs. post-grad outcome
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
          <div className="flex flex-col h-[520px]">
            {/* Chart Area */}
            <div className="flex-1 flex flex-col mt-8 relative">
              
              {/* Top Section: Y-axis + Grid & Bars */}
              <div className="flex-1 flex relative">
                
                {/* Y-axis & Grid Lines (Combined Container for perfect alignment) */}
                <div className="absolute inset-0 flex">
                  
                  {/* Y-axis Labels */}
                  <div className="w-8 relative h-full shrink-0">
                    {[5, 4, 3, 2, 1, 0].map(tick => {
                      const bottomPercent = (tick / 5) * 100
                      if (tick === 0) return null // Hide 0 label
                      return (
                        <div 
                          key={`label-${tick}`} 
                          className="absolute w-full pr-4 text-[10px] font-bold text-slate-400 text-right leading-none z-20"
                          style={{ bottom: `${bottomPercent}%`, transform: 'translateY(50%)' }}
                        >
                          <span>{tick}</span>
                        </div>
                      )
                    })}
                  </div>
                  
                  {/* Chart Grid Area */}
                  <div className="flex-1 relative h-full">
                    
                    {/* Grid Lines */}
                    <div className="absolute inset-0 pointer-events-none">
                      {[5, 4, 3, 2, 1, 0].map(tick => {
                        const bottomPercent = (tick / 5) * 100
                        return (
                          <div 
                            key={`grid-${tick}`} 
                            className="absolute w-full h-[1px] bg-slate-200/60"
                            style={{ bottom: `${bottomPercent}%` }}
                          />
                        )
                      })}
                    </div>

                    {/* Floating Editorial Tooltip */}
                    {activeData && (
                      <div 
                        className="absolute z-30 pointer-events-none transition-all duration-200 -top-8 animate-in fade-in zoom-in-95"
                        style={{
                          left: hoveredIndex === 0 
                            ? '8px' 
                            : hoveredIndex === chartData.length - 1 
                              ? 'auto' 
                              : `${((hoveredIndex ?? 0) + 0.5) * (100 / chartData.length)}%`,
                          right: hoveredIndex === chartData.length - 1 ? '8px' : 'auto',
                          transform: (hoveredIndex === 0 || hoveredIndex === chartData.length - 1) 
                            ? 'none' 
                            : 'translateX(-50%)',
                        }}
                      >
                        <DomainTooltip data={activeData} />
                      </div>
                    )}

                    {/* Bars Container */}
                    <div className="absolute inset-0 flex justify-around items-end z-10">
                      {chartData.map((d, index) => {
                      const color = getDimensionColor(d.dimension)
                      const isHovered = hoveredIndex === index
                      const isFaded = hoveredIndex !== null && !isHovered

                      // Calculate height based on 0-5 scale
                      const preHeight = Math.max(0, (d.preGrad / 5) * 100)
                      const postHeight = Math.max(0, (d.postGrad / 5) * 100)

                      return (
                        <div 
                          key={d.dimension} 
                          className="flex flex-col items-center justify-end h-full w-full relative cursor-pointer transition-opacity duration-300"
                          style={{ opacity: isFaded ? 0.35 : 1 }}
                          onMouseEnter={() => setHoveredIndex(index)}
                          onMouseLeave={() => setHoveredIndex(null)}
                        >
                          {/* Bar Pair */}
                          <div className={`flex items-end justify-center gap-1.5 w-full h-full relative px-1 md:px-2 transition-transform duration-300 ${isHovered ? 'scale-[1.02]' : ''}`}>
                             
                             {/* Pre Bar */}
                             <div className="flex flex-col items-center justify-end h-full w-full max-w-[32px]">
                               <span className="text-[10px] font-semibold text-slate-500 mb-1 opacity-0 group-hover:opacity-100 sm:opacity-100 transition-opacity">
                                 {d.preGrad.toFixed(1)}
                               </span>
                               <div 
                                 className={`w-full ${color.tailwindPre} rounded-t-[3px] transition-all duration-700`}
                                 style={{ height: `${preHeight}%` }}
                               />
                             </div>

                             {/* Post Bar */}
                             <div className="flex flex-col items-center justify-end h-full w-full max-w-[32px]">
                               <span className="text-[11px] font-bold text-slate-800 mb-1 opacity-0 group-hover:opacity-100 sm:opacity-100 transition-opacity">
                                 {d.postGrad.toFixed(1)}
                               </span>
                               <div 
                                 className={`w-full ${color.tailwindPost} rounded-t-[3px] transition-all duration-700 shadow-sm`}
                                 style={{ height: `${postHeight}%` }}
                               />
                             </div>

                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Section: X-axis Labels & Data Table */}
            <div className="flex flex-col pt-3 pl-8">
                <div className="w-full flex flex-col">
                  {/* Dimension Names Row */}
                  <div className="flex justify-around items-start">
                    {chartData.map((d, index) => {
                      const color = getDimensionColor(d.dimension)
                      const isHovered = hoveredIndex === index
                      return (
                        <div 
                          key={`dim-${d.dimension}`} 
                          className="w-full text-center px-1 flex flex-col items-center gap-1.5 cursor-pointer select-none"
                          onMouseEnter={() => setHoveredIndex(index)}
                          onMouseLeave={() => setHoveredIndex(null)}
                        >
                          <div 
                            className={`w-4 h-1 rounded-[1px] shrink-0 transition-transform duration-300 ${isHovered ? 'scale-y-150' : ''}`}
                            style={{ backgroundColor: color.hex }} 
                          />
                          <span className={`text-[10px] sm:text-xs leading-tight block break-words transition-colors duration-200 h-8 ${isHovered ? 'text-slate-900 font-semibold' : 'text-slate-600 font-medium'}`}>
                            {d.dimension}
                          </span>
                        </div>
                      )
                    })}
                  </div>

                  {/* Gain Data Row */}
                  <div className="flex justify-around items-center pt-3 mt-1 border-t border-slate-100/60 relative">
                    {chartData.map((d, index) => {
                      const color = getDimensionColor(d.dimension)
                      const isHovered = hoveredIndex === index
                      return (
                        <div 
                          key={`gain-${d.dimension}`}
                          className="w-full text-center px-1 cursor-pointer select-none"
                          onMouseEnter={() => setHoveredIndex(index)}
                          onMouseLeave={() => setHoveredIndex(null)}
                        >
                          <span 
                            className={`text-[11px] font-mono tracking-tight transition-all duration-200 ${isHovered ? 'font-bold' : 'font-medium opacity-80'}`}
                            style={{ color: color.hex }}
                          >
                            +{d.gain.toFixed(2)}
                          </span>
                        </div>
                      )
                    })}
                    
                    {/* Row Label (Visible on md+) */}
                    <div className="absolute -left-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden md:block">
                      Gain
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Legend */}
            <div className="flex items-center justify-center gap-8 mt-6 pt-6 text-xs text-slate-500 font-medium uppercase tracking-wider">
              <div className="flex items-center gap-2">
                <div className="w-4 h-1.5 rounded-[2px] bg-slate-200 border border-slate-300"></div>
                <span className="text-slate-600">Pre-Grad (Lighter Tint)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-1.5 rounded-[2px] bg-slate-700"></div>
                <span className="text-slate-600">Post-Grad (Solid Dimension Color)</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
