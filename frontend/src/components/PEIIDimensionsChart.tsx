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

export interface PEIIDomainScore {
  dimension: string
  preGrad: number
  postGrad: number
}

interface PEIIDimensionsChartProps {
  data: PEIIDomainScore[]
  isLoading?: boolean
}

export function PEIIDimensionsChart({ data, isLoading }: PEIIDimensionsChartProps) {
  return (
    <div className="flex flex-col h-full relative overflow-hidden">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-slate-900">Multi-Dimensional Index</h3>
          <p className="text-sm text-slate-500 mt-1">Pre-Graduation vs. Post-Graduation</p>
        </div>
      </div>

      <div className="h-[400px] w-full z-10 relative">
        {isLoading ? (
          <div className="w-full h-full flex items-center justify-center text-slate-400 text-sm">Loading data...</div>
        ) : data.length === 0 ? (
          <div className="w-full h-full flex items-center justify-center text-slate-400 text-sm">No data available for these filters.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart cx="50%" cy="50%" outerRadius="65%" data={data}>
            <defs>
              <linearGradient id="colorPost" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#0f172a" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#0f172a" stopOpacity={0.1} />
              </linearGradient>
              <linearGradient id="colorPre" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#94a3b8" stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <PolarGrid stroke="#e2e8f0" />
            <PolarAngleAxis 
              dataKey="dimension" 
              tick={({ payload, x, y, textAnchor }) => {
                // Shorten "Employability and Economic Mobility" -> "Employability"
                let shortName = payload.value.split(" and ")[0];
                if (shortName.includes("NGO")) shortName = "Govt Trust"; // Special case
                
                const words = shortName.split(" ");
                const line1 = words[0];
                const line2 = words.slice(1).join(" ");
                
                return (
                  <text x={x} y={y} className="text-[10px] font-medium fill-slate-600" textAnchor={textAnchor}>
                    <tspan x={x} dy={0}>{line1}</tspan>
                    {line2 && <tspan x={x} dy={12}>{line2}</tspan>}
                  </text>
                );
              }}
            />
            <PolarRadiusAxis 
              domain={[0, 5]} 
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
              formatter={(value: TooltipValue, name: string | number | undefined) => [
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
              stroke="#0f172a"
              strokeWidth={2}
              fill="url(#colorPost)"
              fillOpacity={1}
            />
            </RadarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
