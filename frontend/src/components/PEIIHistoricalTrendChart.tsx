"use client"

import { useMemo } from "react"
import { Line, LineChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, LabelList } from "recharts"
import type { PEIIHistoricalTrend } from "@/lib/surveys"

export interface PEIIHistoricalTrendChartProps {
  data: PEIIHistoricalTrend[]
  isLoading?: boolean
  isExport?: boolean
}

interface TooltipPayloadEntry {
  value?: number | string
  [key: string]: unknown
}

interface CustomTooltipProps {
  active?: boolean
  payload?: TooltipPayloadEntry[]
  label?: string | number
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (active && payload && payload.length > 0 && payload[0]) {
    const first = payload[0]
    const val = typeof first.value === "number" ? first.value : Number(first.value ?? 0)
    return (
      <div className="bg-white/95 backdrop-blur-md px-3.5 py-2.5 border border-slate-200 shadow-sm text-left min-w-[220px]">
        <div className="flex items-center justify-between border-b border-slate-100 pb-1.5 mb-2">
          <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">Batch {label}</span>
          <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">1–5 Likert Scale</span>
        </div>
        <div className="flex items-baseline justify-between gap-3 mb-1.5">
          <span className="text-xs text-slate-600 font-medium">Composite PEII Gain</span>
          <span className="text-emerald-600 font-bold font-mono text-sm">
            +{val.toFixed(2)} pts
          </span>
        </div>
        <p className="text-[11px] text-slate-500 border-t border-slate-100 pt-1.5 leading-snug">
          Workforce outcome exceeded college baseline by {val.toFixed(2)} pts
        </p>
      </div>
    )
  }
  return null
}

interface PointLabelProps {
  x?: number
  y?: number
  value?: number | string
  isExport?: boolean | undefined
}

function PointLabel({ x, y, value, isExport }: PointLabelProps) {
  if (x === undefined || y === undefined || value === undefined || value === null) return null
  const num = typeof value === "number" ? value : Number(value)
  if (isNaN(num)) return null

  const formatted = num > 0 ? `+${num.toFixed(2)}` : num.toFixed(2)

  return (
    <text
      x={x}
      y={y - 10}
      textAnchor="middle"
      fill="#334155"
      fontSize={isExport ? 16 : 11}
      fontWeight={600}
      fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
      style={{
        paintOrder: "stroke fill",
        stroke: "#ffffff",
        strokeWidth: 3,
        strokeLinecap: "round",
        strokeLinejoin: "round",
      }}
      className="pointer-events-none select-none"
    >
      {formatted}
    </text>
  )
}

export function PEIIHistoricalTrendChart({ data, isLoading, isExport }: PEIIHistoricalTrendChartProps) {
  const chartData = useMemo(() => {
    return [...data].sort((a, b) => a.batch_year.localeCompare(b.batch_year))
  }, [data])

  return (
    <div className="h-full flex flex-col">
      {/* Editorial Header */}
      <div className={isExport ? "mb-10 flex items-start justify-between min-h-[110px]" : "mb-8 flex items-start justify-between min-h-[110px]"}>
        <div className="pr-14">
          <h3 className={isExport ? "text-3xl font-bold tracking-tight text-slate-900" : "text-2xl font-bold tracking-tight text-slate-900"}>
            Historical PEII Trend
          </h3>
          <p className={isExport ? "text-base text-slate-500 mt-2" : "text-sm text-slate-500 mt-1"}>
            Cohort average value-added score (1–5 scale): Net competency gain from college baseline to workplace outcome (Post-Grad − Pre-Grad)
          </p>
        </div>
      </div>

      <div className="w-full h-[350px] sm:h-[420px]">
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
            <LineChart data={chartData} margin={{ top: 32, right: 30, left: -10, bottom: 25 }}>
              <defs>
                <linearGradient id="peiiTrendStroke" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#3b82f6" />
                  <stop offset="25%" stopColor="#8b5cf6" />
                  <stop offset="50%" stopColor="#f43f5e" />
                  <stop offset="75%" stopColor="#f59e0b" />
                  <stop offset="100%" stopColor="#10b981" />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#cbd5e1" />
              <XAxis 
                dataKey="batch_year" 
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#64748b', fontSize: isExport ? 16 : 11, fontWeight: 500 }}
                dy={10}
              />
              <YAxis 
                domain={[(dataMin: number) => Math.min(0, dataMin), 'auto']}
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#64748b', fontSize: isExport ? 16 : 11, fontWeight: 500 }}
                tickFormatter={(val) => val > 0 ? `+${val.toFixed(1)}` : val.toFixed(1)}
                dx={-10}
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
              <Tooltip content={<CustomTooltip />} />
              <Line 
                type="monotone" 
                dataKey="peii_score" 
                stroke="url(#peiiTrendStroke)" 
                strokeWidth={isExport ? 5 : 3.5}
                dot={{ r: isExport ? 8 : 5, fill: "#10b981", strokeWidth: isExport ? 4 : 2.5, stroke: "#fff" }}
                activeDot={{ r: isExport ? 10 : 7.5, fill: "#059669", strokeWidth: isExport ? 4 : 2.5, stroke: "#fff" }}
              >
                <LabelList
                  dataKey="peii_score"
                  content={<PointLabel isExport={isExport} />}
                />
              </Line>
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Editorial Legend */}
      <div className={`flex items-center gap-6 mt-6 pt-4 border-t border-slate-100 ${isExport ? 'text-base' : 'text-xs'}`}>
        <div className="flex items-center gap-2.5">
          <div className="w-5 h-1 rounded-full bg-gradient-to-r from-blue-500 via-rose-500 to-emerald-500" />
          <span className="font-semibold text-slate-700">Cohort PEII Value-Add</span>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="w-5 h-0.5 border-b-2 border-dashed border-slate-400" />
          <span className="font-medium text-slate-500">0.00 Baseline (No Change)</span>
        </div>
      </div>
    </div>
  )
}
