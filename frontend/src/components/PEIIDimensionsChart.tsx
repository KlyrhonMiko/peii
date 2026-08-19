"use client"

import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts"

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
  { dimension: "Employability & Economics", preGrad: 0.65, postGrad: 0.88 },
  { dimension: "Family & Finance", preGrad: 0.60, postGrad: 0.82 },
  { dimension: "Personal Development", preGrad: 0.70, postGrad: 0.76 },
  { dimension: "Civic Engagement", preGrad: 0.55, postGrad: 0.65 },
  { dimension: "Governance & Support", preGrad: 0.50, postGrad: 0.58 },
]

export function PEIIDimensionsChart() {
  return (
    <div className="flex flex-col h-full relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute -top-24 -right-24 w-48 h-48 bg-emerald-50 rounded-full blur-3xl opacity-50 pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-blue-50 rounded-full blur-3xl opacity-50 pointer-events-none" />

      <div className="px-5 py-4 border-b border-slate-100 bg-white/50 backdrop-blur-sm z-10 relative">
        <h3 className="text-[14px] font-semibold text-slate-900">Multi-Dimensional Index (Phase 1)</h3>
        <p className="text-[12px] text-slate-500 mt-0.5">Pre-Graduation baseline vs. Post-Graduation AHP-weighted scores</p>
      </div>

      <div className="h-[400px] w-full px-4 py-6 z-10 relative">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart cx="50%" cy="50%" outerRadius="75%" data={data}>
            <defs>
              <linearGradient id="colorPost" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0.1} />
              </linearGradient>
              <linearGradient id="colorPre" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#94a3b8" stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <PolarGrid stroke="#e2e8f0" />
            <PolarAngleAxis 
              dataKey="dimension" 
              tick={{ fill: '#475569', fontSize: 11, fontWeight: 500 }}
            />
            <PolarRadiusAxis 
              domain={[0, 1]} 
              tick={false}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
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
              labelStyle={{ fontWeight: 700, color: '#0f172a', fontSize: '12px', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}
              formatter={(value: TooltipValue, name: any) => [
                formatTooltipValue(value),
                name === "preGrad" ? "Pre-Grad Baseline" : "Post-Grad Outcome"
              ]}
            />
            <Legend 
              wrapperStyle={{ fontSize: '12px', fontWeight: 500, paddingTop: '20px' }}
              formatter={(value) => value === "preGrad" ? "Pre-Grad Baseline" : "Post-Grad Outcome"}
            />
            <Radar
              name="preGrad"
              dataKey="preGrad"
              stroke="#94a3b8"
              strokeDasharray="4 4"
              fill="url(#colorPre)"
              fillOpacity={1}
            />
            <Radar
              name="postGrad"
              dataKey="postGrad"
              stroke="#10b981"
              strokeWidth={2}
              fill="url(#colorPost)"
              fillOpacity={1}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
