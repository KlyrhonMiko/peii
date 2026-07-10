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

const getTierColor = (tier: number) => {
  switch (tier) {
    case 1: return "#10b981"
    case 2: return "#3b82f6"
    case 3: return "#f59e0b"
    case 4: return "#ef4444"
    default: return "#9ca3af"
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
    <div>
      <div className="px-5 py-4 border-b border-slate-100">
        <h3 className="text-[14px] font-semibold text-slate-900">Institutional Feature Importance</h3>
        <p className="text-[12px] text-slate-400 mt-0.5">Factors driving alumni success and PEII scores</p>
      </div>
      <div className="px-4 py-4">
        {/* Tier Legend */}
        <div className="flex items-center gap-4 mb-4 px-1">
          {Object.entries(tierLabels).map(([tier, label]) => (
            <div key={tier} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: getTierColor(Number(tier)) }} />
              <span className="text-[11px] text-slate-500 font-medium">{label}</span>
            </div>
          ))}
        </div>
        <div className="h-[360px] min-h-[360px] w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 4, right: 24, left: 8, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} vertical={true} stroke="#f1f5f9" />
              <XAxis
                type="number"
                domain={[0, 1]}
                tickFormatter={(v) => v.toFixed(1)}
                fontSize={11}
                fontWeight={500}
                stroke="#94a3b8"
                tickLine={false}
                axisLine={false}
                fontFamily="inherit"
              />
              <YAxis
                dataKey="factor"
                type="category"
                width={140}
                tick={{ fontSize: 12, fontWeight: 500, fill: "#475569" }}
                tickLine={false}
                axisLine={false}
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
                formatter={(value: TooltipValue) => [formatTooltipValue(value), "Score"]}
              />
              <Bar dataKey="score" radius={[0, 4, 4, 0]} barSize={28}>
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={getTierColor(entry.tier)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
