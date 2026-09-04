"use client"

import { useMemo } from "react"
import { Line, LineChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import type { TooltipProps } from "recharts"
import type { ValueType, NameType } from "recharts/types/component/DefaultTooltipContent"
import type { PEIIHistoricalTrend } from "@/lib/surveys"

export interface PEIIHistoricalTrendChartProps {
  data: PEIIHistoricalTrend[]
  isLoading?: boolean
}

function CustomTooltip({ active, payload, label }: TooltipProps<ValueType, NameType>) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white p-3 border border-slate-200 rounded-lg shadow-sm">
        <p className="font-semibold text-slate-900 mb-1">Batch {label}</p>
        <p className="text-emerald-600 font-medium text-sm">
          PEII Score: +{payload[0].value.toFixed(2)}
        </p>
      </div>
    )
  }
  return null
}

export function PEIIHistoricalTrendChart({ data, isLoading }: PEIIHistoricalTrendChartProps) {
  const chartData = useMemo(() => {
    return [...data].sort((a, b) => a.batch_year.localeCompare(b.batch_year))
  }, [data])

  return (
    <div className="h-full flex flex-col">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-slate-900">Historical PEII Trend</h3>
          <p className="text-sm text-slate-500 mt-1">
            Year-over-year impact score tracking
          </p>
        </div>
      </div>

      <div className="w-full aspect-[21/9] min-h-[400px]">
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
            <LineChart data={chartData} margin={{ top: 20, right: 20, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis 
                dataKey="batch_year" 
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#64748b', fontSize: 11, fontWeight: 500 }}
                dy={10}
              />
              <YAxis 
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#64748b', fontSize: 11, fontWeight: 500 }}
                tickFormatter={(val) => `+${val.toFixed(1)}`}
                dx={-10}
              />
              <Tooltip content={<CustomTooltip />} />
              <Line 
                type="monotone" 
                dataKey="peii_score" 
                stroke="#0f172a" 
                strokeWidth={3}
                dot={{ r: 4, fill: "#0f172a", strokeWidth: 2, stroke: "#fff" }}
                activeDot={{ r: 6, fill: "#334155", strokeWidth: 0 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
