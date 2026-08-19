"use client"

import { useMemo } from "react"
import { Bar, BarChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"

type TooltipValue = number | string | readonly (number | string)[] | undefined

function formatTooltipValue(value: TooltipValue) {
  if (typeof value === "number") {
    return value.toFixed(2)
  }

  if (Array.isArray(value)) {
    return value.join(", ")
  }

  return value ?? ""
}

const baseData = [
  { year: "2020", score: 0.62 },
  { year: "2021", score: 0.68 },
  { year: "2022", score: 0.74 },
  { year: "2023", score: 0.79 },
  { year: "2024", score: 0.83 },
  { year: "2025", score: 0.88 },
]

export interface CohortTrendChartProps {
  filters?: { department: string; batch: string }
}

export function CohortTrendChart({ filters }: CohortTrendChartProps) {
  const data = useMemo(() => {
    let multiplier = 1
    if (filters?.department && filters.department !== "All Departments") multiplier *= 0.9
    
    let chartData = baseData.map(d => {
      const yearVal = parseInt(d.year) || 0
      const offset = ((yearVal % 5) / 5) * 0.04 - 0.02
      return {
        ...d,
        score: Number(Math.min(1.0, Math.max(0, d.score * multiplier + offset)).toFixed(2))
      }
    })

    if (filters?.batch && filters.batch !== "All Batches") {
      chartData = chartData.filter(d => d.year <= filters.batch)
      if (chartData.length === 0) {
        chartData = [{ year: filters.batch, score: 0.75 }]
      }
    }

    return chartData
  }, [filters])

  return (
    <div className="h-full w-full min-w-0 relative">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <BarChart
          data={data}
          margin={{ top: 20, right: 20, left: -20, bottom: 25 }}
          barSize={40}
        >
          <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#e2e8f0" />
          <XAxis
            dataKey="year"
            stroke="#94a3b8"
            fontSize={12}
            fontWeight={500}
            tickLine={false}
            axisLine={false}
            dy={10}
            fontFamily="inherit"
          />
          <YAxis
            domain={[0, 1]}
            tickFormatter={(value) => value.toFixed(1)}
            stroke="#94a3b8"
            fontSize={12}
            fontWeight={500}
            tickLine={false}
            axisLine={false}
            dx={-12}
            fontFamily="inherit"
          />
          <Tooltip
            cursor={{ fill: '#f1f5f9', opacity: 0.5 }}
            contentStyle={{
              backgroundColor: '#ffffff',
              borderRadius: '4px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
              fontFamily: 'inherit',
              padding: '8px 12px',
            }}
            labelStyle={{ fontWeight: 600, color: '#475569', fontSize: '12px', marginBottom: '4px' }}
            formatter={(value: TooltipValue) => [
              <span key="val" className="font-semibold text-slate-900 text-sm">{formatTooltipValue(value)}</span>, 
              <span key="lbl" className="text-slate-500 font-medium ml-1 text-xs">PEII Score</span>
            ]}
          />
          <Bar
            dataKey="score"
            fill="#0f172a"
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
