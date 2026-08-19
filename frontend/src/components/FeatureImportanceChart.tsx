"use client"

import { Bar, BarChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts"

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

const data = [
  { factor: "Curriculum Relevance", score: 0.92, tier: 1 },
  { factor: "Faculty Mentorship", score: 0.85, tier: 1 },
  { factor: "Industry Partnerships", score: 0.72, tier: 2 },
  { factor: "Career Services", score: 0.65, tier: 2 },
  { factor: "Extracurriculars", score: 0.51, tier: 3 },
  { factor: "Alumni Network", score: 0.35, tier: 4 },
]

// Professional monochromatic palette (Slate)
const getTierColor = (tier: number) => {
  switch (tier) {
    case 1: return "#0f172a" // Slate 900
    case 2: return "#334155" // Slate 700
    case 3: return "#64748b" // Slate 500
    case 4: return "#94a3b8" // Slate 400
    default: return "#cbd5e1" // Slate 300
  }
}

const tierLabels: Record<number, string> = {
  1: "Highly Transformative",
  2: "Significant Impact",
  3: "Moderate Impact",
  4: "Marginal Impact",
}

export function FeatureImportanceChart() {
  return (
    <div className="flex flex-col h-full max-w-5xl">
      <div className="py-2 pb-8">
        <h3 className="text-[15px] font-semibold text-slate-900 tracking-tight">Institutional Feature Importance</h3>
        <p className="text-[13px] text-slate-500 mt-1">Factors driving alumni success and PEII scores</p>
      </div>
      <div className="flex-1 flex flex-col">
        {/* Tier Legend */}
        <div className="flex flex-wrap items-center gap-6 mb-10 pl-2">
          {Object.entries(tierLabels).map(([tier, label]) => (
            <div key={tier} className="flex items-center gap-2.5">
              <div 
                className="w-2 h-2 rounded-full" 
                style={{ backgroundColor: getTierColor(Number(tier)) }} 
              />
              <span className="text-[12px] font-medium text-slate-500">{label}</span>
            </div>
          ))}
        </div>
        <div className="h-[380px] w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 0, right: 32, left: 0, bottom: 0 }}
              barSize={12}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} vertical={true} stroke="#f8fafc" />
              <XAxis
                type="number"
                domain={[0, 1]}
                tickFormatter={(v) => v.toFixed(1)}
                fontSize={12}
                fontWeight={400}
                stroke="#94a3b8"
                tickLine={false}
                axisLine={false}
                tickMargin={16}
                fontFamily="inherit"
              />
              <YAxis
                dataKey="factor"
                type="category"
                width={180}
                tick={{ fontSize: 13, fontWeight: 400, fill: "#475569" }}
                tickLine={false}
                axisLine={false}
                tickMargin={24}
                fontFamily="inherit"
              />
              <Tooltip
                cursor={{ fill: 'transparent' }}
                contentStyle={{
                  backgroundColor: '#ffffff',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  boxShadow: '0 4px 12px rgb(0 0 0 / 0.04)',
                  fontFamily: 'inherit',
                  fontSize: '12px',
                  padding: '10px 14px',
                }}
                labelStyle={{ fontWeight: 600, color: '#0f172a', fontSize: '13px', marginBottom: '6px' }}
                itemStyle={{ color: '#475569', fontSize: '12px', fontWeight: 500 }}
                formatter={(value: TooltipValue) => [formatTooltipValue(value), "Score"]}
              />
              <Bar 
                dataKey="score" 
                radius={[8, 8, 8, 8]} 
                background={{ fill: '#f1f5f9', radius: 8 }}
                animationDuration={1000}
              >
                {data.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={getTierColor(entry.tier)}
                    className="transition-all duration-300 hover:opacity-80 cursor-pointer"
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
