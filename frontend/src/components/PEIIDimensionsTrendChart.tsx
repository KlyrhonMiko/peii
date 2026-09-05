"use client"

import { useMemo, useState } from "react"
import { Line, LineChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import type { TooltipProps } from "recharts"
import type { ValueType, NameType } from "recharts/types/component/DefaultTooltipContent"
import type { PEIIHistoricalTrend } from "@/lib/surveys"

export interface PEIIDimensionsTrendChartProps {
  data: PEIIHistoricalTrend[]
  isLoading?: boolean
}

const COLORS = [
  "#3b82f6", // blue-500
  "#8b5cf6", // violet-500
  "#f43f5e", // rose-500
  "#f59e0b", // amber-500
  "#10b981", // emerald-500
]

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
  hoveredLine: string | null
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
      <div className="bg-white/95 backdrop-blur-sm p-4 border border-slate-200 rounded-xl shadow-lg min-w-[260px]">
        <p className="font-semibold text-slate-900 mb-3 border-b border-slate-100 pb-2">Batch {label}</p>
        <div className="space-y-2">
          {sortedPayload.map((entry, index) => {
            const entryColor = entry.color ?? "#3b82f6"
            return (
              <div key={index} className="flex items-start justify-between gap-6 text-sm">
                <div className="flex items-start gap-2.5 flex-1">
                  <div 
                    className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" 
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
                  {formatValue(Number(entry.value))}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }
  return null
}

export function PEIIDimensionsTrendChart({ data, isLoading }: PEIIDimensionsTrendChartProps) {
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
      <div className="mb-10">
        <h3 className="font-semibold text-slate-900 text-lg">Dimension Trend Comparison</h3>
        <p className="text-sm text-slate-500 mt-1 mb-8 max-w-3xl">
          Compare the trajectories of all 5 dimensions. Hover over a line or legend item to isolate it and resolve overlapping.
        </p>

        {/* Custom Editorial Legend */}
        <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
          {dimensions.map((dim, i) => {
            const isFaded = hoveredLine !== null && hoveredLine !== dim
            return (
              <div 
                key={dim}
                className="flex items-center gap-2.5 cursor-pointer transition-all duration-300 select-none group"
                style={{ opacity: isFaded ? 0.35 : 1 }}
                onMouseEnter={() => setHoveredLine(dim)}
                onMouseLeave={() => setHoveredLine(null)}
              >
                <div 
                  className="w-3.5 h-[3px] rounded-full transition-transform duration-300 group-hover:scale-y-150" 
                  style={{ backgroundColor: COLORS[i % COLORS.length] ?? "#3b82f6" }} 
                />
                <span className="text-[13px] font-medium text-slate-600 tracking-wide">
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
                tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 500 }}
                dy={10}
              />
              <YAxis 
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 500 }}
                tickFormatter={(val) => val > 0 ? `+${val.toFixed(1)}` : val.toFixed(1)}
                dx={-15}
              />
              <Tooltip 
                content={<CustomTooltip hoveredLine={hoveredLine} />} 
                cursor={{ stroke: '#e2e8f0', strokeWidth: 2, strokeDasharray: 'none' }} 
              />

              {dimensions.map((dim, i) => {
                const isHovered = hoveredLine === dim
                const isFaded = hoveredLine !== null && hoveredLine !== dim
                const color = COLORS[i % COLORS.length] ?? "#3b82f6"
                return (
                  <Line
                    key={dim}
                    type="monotone"
                    dataKey={dim}
                    name={dim}
                    stroke={color}
                    strokeWidth={isHovered ? 4 : 2.5}
                    strokeOpacity={isFaded ? 0.15 : 1}
                    dot={isFaded ? false : { r: 4, fill: color, strokeWidth: 2, stroke: "#fff" }}
                    activeDot={isFaded ? false : { r: 6, fill: color, strokeWidth: 0 }}
                    onMouseEnter={() => setHoveredLine(dim)}
                    style={{ transition: 'all 0.3s ease' }}
                  />
                )
              })}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
