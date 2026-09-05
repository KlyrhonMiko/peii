"use client"

import { Line, LineChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import type { PEIIHistoricalTrend } from "@/lib/surveys"

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
  if (active && payload && payload.length) {
    const first = payload[0]
    const val = typeof first?.value === "number" ? first.value : Number(first?.value ?? 0)
    return (
      <div className="bg-white p-3 border border-slate-200 rounded-lg shadow-sm">
        <p className="font-semibold text-slate-900 mb-1">Batch {label}</p>
        <p className="text-emerald-600 font-medium text-sm">
          PEII Score: {val.toFixed(2)}
        </p>
      </div>
    )
  }
  return null
}

export interface CohortTrendChartProps {
  data: PEIIHistoricalTrend[]
}

export function CohortTrendChart({ data }: CohortTrendChartProps) {
  const chartData = [...data]
    .sort((a, b) => a.batch_year.localeCompare(b.batch_year))
    .map(d => ({
      year: d.batch_year,
      score: Number(d.peii_score.toFixed(2)),
    }))

  if (chartData.length === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center text-slate-400 text-sm font-medium">
        No historical trend data available.
      </div>
    )
  }

  return (
    <div className="h-full w-full min-w-0 relative">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <LineChart data={chartData} margin={{ top: 20, right: 20, left: -10, bottom: 0 }}>
          <defs>
            <linearGradient id="cohortTrendStroke" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#3b82f6" />
              <stop offset="25%" stopColor="#8b5cf6" />
              <stop offset="50%" stopColor="#f43f5e" />
              <stop offset="75%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#10b981" />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis
            dataKey="year"
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#64748b", fontSize: 11, fontWeight: 500 }}
            dy={10}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#64748b", fontSize: 11, fontWeight: 500 }}
            tickFormatter={(val: number) => val.toFixed(1)}
            dx={-10}
          />
          <Tooltip content={<CustomTooltip />} />
          <Line
            type="monotone"
            dataKey="score"
            stroke="url(#cohortTrendStroke)"
            strokeWidth={3.5}
            dot={{ r: 4.5, fill: "#10b981", strokeWidth: 2, stroke: "#fff" }}
            activeDot={{ r: 7, fill: "#059669", strokeWidth: 2, stroke: "#fff" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
