"use client"

import { useMemo } from "react"
import { BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer, LabelList } from "recharts"
import type { SurveyResponseAggregate } from "@/lib/surveys"

const CHANNEL_SHORT_NAMES: Record<string, string> = {
  "Online application": "Online",
  "Business / self-employment": "Business",
}

export interface ClientJobChannelsProps {
  distribution?: SurveyResponseAggregate | null
  isLoading?: boolean
  isExport?: boolean
}

export function ClientJobChannels({
  distribution,
  isLoading,
  isExport,
}: ClientJobChannelsProps) {
  const chartData = useMemo(() => {
    if (!distribution || distribution.total === 0) return null

    const data = distribution.cells
      .map((c) => ({
        name: String(c.value).trim(),
        shortName: CHANNEL_SHORT_NAMES[String(c.value).trim()] || String(c.value).trim(),
        count: c.count,
        pct: distribution.total > 0 ? Math.round((c.count / distribution.total) * 100) : 0,
      }))
      .filter((c) => c.count > 0)
      .sort((a, b) => b.count - a.count)

    return {
      channels: data,
      total: distribution.total,
    }
  }, [distribution])

  return (
    <div className="flex flex-col w-full flex-1 h-full">
      {/* Editorial Header */}
      <div className={isExport ? "mb-10 flex items-start justify-between pr-14" : "mb-8 flex items-start justify-between pr-14"}>
        <div>
          <h3 className={isExport ? "text-3xl font-bold tracking-tight text-slate-900" : "text-2xl font-bold tracking-tight text-slate-900"}>
            First Job Acquisition Channels
          </h3>
          <p className={isExport ? "text-base text-slate-500 mt-2" : "text-sm text-slate-500 mt-1"}>
            Primary recruitment sources and search pathways utilized by alumni
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="animate-pulse flex flex-col gap-3 py-6 mt-auto">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-9 w-full bg-slate-100 rounded-lg" />
          ))}
        </div>
      ) : !chartData ? (
        <div className="text-slate-400 text-sm py-8 mt-auto">
          No job acquisition channel data available for the current filter selection.
        </div>
      ) : (
        <div className="flex flex-col gap-4 mt-auto">
          {/* Vertical Bar Chart */}
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData.channels}
                margin={{ top: 10, right: 0, left: -20, bottom: 0 }}
              >
                <XAxis
                  dataKey="shortName"
                  axisLine={{ stroke: "#e2e8f0" }}
                  tickLine={false}
                  tick={{ fill: "#64748b", fontSize: 11 }}
                  interval={0}
                />
                <YAxis
                  type="number"
                  unit="%"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                />
                <Tooltip
                  cursor={{ fill: "rgba(241, 245, 249, 0.6)" }}
                  contentStyle={{
                    borderRadius: "8px",
                    border: "1px solid #e2e8f0",
                    boxShadow: "0 4px 12px -2px rgb(0 0 0 / 0.08)",
                    fontSize: "12px",
                  }}
                  formatter={(value: unknown, _name: unknown, entry: unknown) => {
                    const item = (entry as { payload: { count: number; pct: number } }).payload
                    return [`${item.count} hires (${item.pct}%)`, "Share"]
                  }}
                  labelFormatter={(_label, payload) => {
                    if (payload && payload.length > 0 && payload[0]?.payload) {
                      return payload[0].payload.name
                    }
                    return ""
                  }}
                />
                <Bar
                  dataKey="pct"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={64}
                >
                  <LabelList
                    dataKey="count"
                    position="top"
                    fill="#64748b"
                    fontSize={12}
                    fontWeight={500}
                  />
                  {chartData.channels.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={index === 0 ? "#0ea5e9" : "#cbd5e1"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  )
}
