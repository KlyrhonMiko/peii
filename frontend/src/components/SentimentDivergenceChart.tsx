"use client"

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts"

type TooltipValue = number | string | readonly (number | string)[] | undefined

function formatTooltipValue(value: TooltipValue) {
  if (typeof value === "number") {
    return `${value.toFixed(1)}%`
  }
  if (Array.isArray(value)) {
    return value.join(", ")
  }
  return value ?? ""
}

import type { SentimentDivergenceTier } from "@/lib/surveys"

export function SentimentDivergenceChart({ data }: { data?: SentimentDivergenceTier[] }) {
  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-slate-500 text-sm bg-slate-50/50">
        No sentiment data available for this cohort.
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full relative overflow-hidden bg-white">
      {/* Background decoration */}
      <div className="absolute -top-24 -right-24 w-48 h-48 bg-rose-50 rounded-full blur-3xl opacity-60 pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-emerald-50 rounded-full blur-3xl opacity-60 pointer-events-none" />

      <div className="px-5 py-4 border-b border-slate-100 bg-white/50 backdrop-blur-sm z-10 relative">
        <h3 className="text-[14px] font-semibold text-slate-900">Sentiment vs. Outcome Divergence (Phase 2)</h3>
        <p className="text-[12px] text-slate-500 mt-0.5">Agreement between composite PEII score and RoBERTa-Tagalog sentiment analysis</p>
      </div>
      
      <div className="h-[400px] w-full px-4 py-6 z-10 relative">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 10, right: 30, left: 10, bottom: 10 }}
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={false} vertical={true} stroke="#f1f5f9" />
            <XAxis
              type="number"
              domain={[0, 100]}
              tickFormatter={(v) => `${v}%`}
              fontSize={11}
              fontWeight={500}
              stroke="#94a3b8"
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              dataKey="tier"
              type="category"
              width={140}
              tick={{ fontSize: 11, fontWeight: 500, fill: "#475569" }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              cursor={{ fill: '#f8fafc' }}
              contentStyle={{
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                backdropFilter: 'blur(8px)',
                borderRadius: '12px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 10px 25px -5px rgb(0 0 0 / 0.1)',
                fontFamily: 'inherit',
                fontSize: '12px',
                padding: '12px 16px',
              }}
              itemStyle={{ fontWeight: 500, fontSize: '13px', paddingTop: '4px' }}
              labelStyle={{ fontWeight: 700, color: '#0f172a', fontSize: '12px', marginBottom: '8px' }}
              formatter={(value: TooltipValue, name: string | number | undefined) => [
                formatTooltipValue(value), 
                name === "agreement" ? "Alignment" : "Divergence Flagged"
              ]}
            />
            <Legend 
              wrapperStyle={{ fontSize: '12px', fontWeight: 500, paddingTop: '20px' }}
              formatter={(value) => value === "agreement" ? "Alignment (Valid)" : "Divergence Flagged (Review)"}
            />
            <Bar 
              name="agreement" 
              dataKey="agreement" 
              stackId="a" 
              fill="#10b981" 
              radius={[0, 0, 0, 0]} 
              barSize={32} 
            />
            <Bar 
              name="divergence" 
              dataKey="divergence" 
              stackId="a" 
              fill="#f43f5e" 
              radius={[0, 6, 6, 0]} 
              barSize={32} 
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
