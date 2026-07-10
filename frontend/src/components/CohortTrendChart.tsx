"use client"

import { useMemo } from "react"
import { Line, LineChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"

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
      const offset = ((yearVal % 5) / 5) * 0.04 - 0.02 // Deterministic offset
      return {
        ...d,
        score: Number(Math.min(1.0, Math.max(0, d.score * multiplier + offset)).toFixed(2))
      }
    })

    if (filters?.batch && filters.batch !== "All Batches") {
      // If a specific batch is selected, only show data around that batch or just that batch point
      // To keep it looking like a trend, we'll just show data up to that batch year if it exists
      chartData = chartData.filter(d => d.year <= filters.batch)
      if (chartData.length === 0) {
        // Fallback if batch is not in our data
        chartData = [{ year: filters.batch, score: 0.75 }]
      }
    }

    return chartData
  }, [filters])

  return (
    <div className="h-full w-full min-w-0 relative">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <LineChart
          data={data}
          margin={{ top: 8, right: 16, left: -10, bottom: 20 }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
          <XAxis
            dataKey="year"
            stroke="#94a3b8"
            fontSize={11}
            fontWeight={500}
            tickLine={false}
            axisLine={false}
            dy={8}
            fontFamily="inherit"
          />
          <YAxis
            domain={[0, 1]}
            tickFormatter={(value) => value.toFixed(1)}
            stroke="#94a3b8"
            fontSize={11}
            fontWeight={500}
            tickLine={false}
            axisLine={false}
            dx={-4}
            fontFamily="inherit"
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#ffffff',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 4px 12px rgb(0 0 0 / 0.08)',
              fontFamily: 'inherit',
              fontSize: '12px',
              padding: '8px 12px',
            }}
            labelStyle={{ fontWeight: 600, color: '#1e293b', fontSize: '12px', marginBottom: '2px' }}
            formatter={(value: TooltipValue) => [formatTooltipValue(value), "PEII Score"]}
          />
          <Line
            type="monotone"
            dataKey="score"
            stroke="#10b981"
            strokeWidth={2.5}
            dot={{ r: 3.5, strokeWidth: 2, stroke: "#10b981", fill: "#ffffff" }}
            activeDot={{ r: 5, stroke: "#10b981", fill: "#10b981" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
