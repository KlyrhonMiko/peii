"use client"

import { Line, LineChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import type { TooltipProps } from "recharts"
import type { ValueType, NameType } from "recharts/types/component/DefaultTooltipContent"
import type { PEIIHistoricalTrend } from "@/lib/surveys"

function CustomTooltip({ active, payload, label }: TooltipProps<ValueType, NameType>) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white p-3 border border-slate-200 rounded-lg shadow-sm">
        <p className="font-semibold text-slate-900 mb-1">Batch {label}</p>
        <p className="text-emerald-600 font-medium text-sm">
          PEII Score: {Number(payload[0].value).toFixed(2)}
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
            stroke="#0f172a"
            strokeWidth={3}
            dot={{ r: 4, fill: "#0f172a", strokeWidth: 2, stroke: "#fff" }}
            activeDot={{ r: 6, fill: "#334155", strokeWidth: 0 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
