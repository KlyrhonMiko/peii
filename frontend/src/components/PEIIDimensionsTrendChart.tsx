"use client"

import { useMemo, useState } from "react"
import { Line, LineChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts"
import type { PEIIHistoricalTrend } from "@/lib/surveys"
import { getDimensionColor } from "@/lib/dimension-colors"

export interface PEIIDimensionsTrendChartProps {
  data: PEIIHistoricalTrend[]
  isLoading?: boolean
  isExport?: boolean
}

function formatValue(val: number) {
  return val > 0 ? `+${val.toFixed(2)}` : val.toFixed(2)
}

interface TooltipPayloadEntry {
  name: string
  value: number | string
  color?: string
  [key: string]: unknown
}

interface CustomTooltipProps {
  active?: boolean
  payload?: TooltipPayloadEntry[]
  label?: string | number
  hoveredLine?: string | null
}

function CustomTooltip({ active, payload, label, hoveredLine }: CustomTooltipProps) {
  if (active && payload && payload.length) {
    // If a specific line is hovered/isolated, only show its data in the tooltip
    let filteredPayload = payload
    if (hoveredLine) {
      filteredPayload = payload.filter((entry) => entry.name === hoveredLine)
    }
    
    const sortedPayload = [...filteredPayload].sort((a, b) => Number(b.value) - Number(a.value))
    
    return (
      <div className="bg-white/95 backdrop-blur-sm p-4 border border-slate-200 rounded-xl shadow-lg min-w-[280px]">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
          <span className="font-bold text-slate-900 text-xs uppercase tracking-wider">Batch {label}</span>
          <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Net Gain (1–5 Scale)</span>
        </div>
        <div className="space-y-2">
          {sortedPayload.map((entry, index) => {
            const entryColor = entry.color ?? "#3b82f6"
            return (
              <div key={index} className="flex items-start justify-between gap-6 text-sm">
                <div className="flex items-start gap-2.5 flex-1">
                  <div 
                    className="w-2.5 h-1 rounded-[1px] mt-2 shrink-0" 
                    style={{ backgroundColor: entryColor }} 
                  />
                  <span className="leading-tight text-slate-700 font-medium">
                    {entry.name}
                  </span>
                </div>
                <span 
                  className="font-mono font-semibold" 
                  style={{ color: entryColor }}
                >
                  {formatValue(Number(entry.value))} pts
                </span>
              </div>
            )
          })}
        </div>
        <div className="mt-3 pt-2 border-t border-slate-100 text-[10px] text-slate-400 leading-tight">
          Workforce outcome minus college baseline (1.0–5.0 Likert scale)
        </div>
      </div>
    )
  }
  return null
}

export function PEIIDimensionsTrendChart({ data, isLoading, isExport }: PEIIDimensionsTrendChartProps) {
  const chartData = useMemo(() => {
    const sorted = [...data].sort((a, b) => a.batch_year.localeCompare(b.batch_year))
    return sorted.map(d => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const flat: any = { batch_year: d.batch_year }
      if (d.domains) {
        for (const dom of d.domains) {
          flat[dom.dimension] = dom.post_grad - dom.pre_grad
        }
      }
      return flat
    })
  }, [data])

  const dimensions = useMemo(() => {
    const dims = new Set<string>()
    for (const d of data) {
      if (d.domains) {
        for (const dom of d.domains) {
          dims.add(dom.dimension)
        }
      }
    }
    return Array.from(dims).sort()
  }, [data])

  const [hoveredLine, setHoveredLine] = useState<string | null>(null)

  return (
    <div className="h-full flex flex-col">
      <div className={isExport ? "mb-8" : "mb-6"}>
        <h3 className={isExport ? "text-4xl font-bold tracking-tight text-slate-900" : "text-2xl font-bold tracking-tight text-slate-900"}>
          Dimension Trend Comparison
        </h3>
        <p className={isExport ? "text-xl text-slate-500 mt-3 mb-8 max-w-4xl" : "text-sm text-slate-500 mt-1 mb-5 max-w-3xl"}>
          Cohort net competency gain per dimension (1–5 scale): Measures graduate skill growth from college baseline to workplace outcome (Post-Grad − Pre-Grad) across cohorts.
        </p>

        {/* Custom Editorial Legend */}
        <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
          {dimensions.map((dim) => {
            const isFaded = hoveredLine !== null && hoveredLine !== dim
            const color = getDimensionColor(dim).hex
            return (
              <div 
                key={dim}
                className="flex items-center gap-2.5 cursor-pointer transition-all duration-300 select-none group"
                style={{ opacity: isFaded ? 0.35 : 1 }}
                onMouseEnter={() => setHoveredLine(dim)}
                onMouseLeave={() => setHoveredLine(null)}
              >
                <div 
                  className={`rounded-full transition-transform duration-300 group-hover:scale-y-150 ${isExport ? 'w-6 h-[6px]' : 'w-3.5 h-[3px]'}`} 
                  style={{ backgroundColor: color }} 
                />
                <span className={`font-medium tracking-wide ${isExport ? 'text-lg text-slate-700 font-semibold' : 'text-[13px] text-slate-600'}`}>
                  {dim}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      <div className="w-full aspect-[21/9] min-h-[460px]">
        {isLoading ? (
          <div className="w-full h-full flex items-center justify-center">
            <div className="animate-pulse flex space-x-2">
              <div className="h-2 w-2 bg-slate-300 rounded-full"></div>
              <div className="h-2 w-2 bg-slate-300 rounded-full"></div>
              <div className="h-2 w-2 bg-slate-300 rounded-full"></div>
            </div>
          </div>
        ) : chartData.length === 0 ? (
          <div className="w-full h-full flex items-center justify-center text-slate-400 text-sm">
            Not enough historical data
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart 
              data={chartData} 
              margin={{ top: 10, right: 20, left: -10, bottom: 25 }}
              onMouseLeave={() => setHoveredLine(null)}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis 
                dataKey="batch_year" 
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#64748b', fontSize: isExport ? 16 : 12, fontWeight: 500 }}
                dy={10}
              />
              <YAxis 
                domain={[(dataMin: number) => Math.min(0, dataMin), 'auto']}
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#64748b', fontSize: isExport ? 16 : 12, fontWeight: 500 }}
                tickFormatter={(val) => val > 0 ? `+${val.toFixed(1)}` : val.toFixed(1)}
                dx={-15}
              />
              <ReferenceLine 
                y={0} 
                stroke="#94a3b8" 
                strokeDasharray="4 4" 
                label={{ 
                  value: "0.00 Baseline (No Change)", 
                  position: "insideBottomRight", 
                  fill: "#94a3b8", 
                  fontSize: isExport ? 16 : 10,
                  fontWeight: 500
                }} 
              />
              <Tooltip 
                content={<CustomTooltip hoveredLine={hoveredLine} />} 
                cursor={{ stroke: '#e2e8f0', strokeWidth: 2, strokeDasharray: 'none' }} 
              />

              {dimensions.map((dim) => {
                const isHovered = hoveredLine === dim
                const isFaded = hoveredLine !== null && hoveredLine !== dim
                const color = getDimensionColor(dim).hex
                return (
                  <Line
                    key={dim}
                    type="monotone"
                    dataKey={dim}
                    name={dim}
                    stroke={color}
                    strokeWidth={isExport ? (isHovered ? 6 : 4.5) : (isHovered ? 4 : 2.5)}
                    strokeOpacity={isFaded ? 0.15 : 1}
                    dot={isFaded ? false : { r: isExport ? 7 : 4, fill: color, strokeWidth: isExport ? 3 : 2, stroke: "#fff" }}
                    activeDot={isFaded ? false : { r: isExport ? 10 : 6, fill: color, strokeWidth: 0 }}
                    onMouseEnter={() => setHoveredLine(dim)}
                    style={{ transition: 'all 0.3s ease' }}
                  />
                )
              })}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Editorial Legend */}
      <div className={`flex items-center gap-6 mt-6 pt-4 border-t border-slate-100 ${isExport ? 'text-base text-slate-500' : 'text-xs text-slate-500'}`}>
        <div className="flex items-center gap-2.5">
          <div className="w-5 h-0.5 border-b-2 border-dashed border-slate-400" />
          <span className="font-medium text-slate-500">0.00 Baseline (No Change)</span>
        </div>
      </div>
    </div>
  )
}
