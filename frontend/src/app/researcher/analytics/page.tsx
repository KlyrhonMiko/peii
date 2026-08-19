"use client"

import { useState } from "react"
import { ClientPEIIDimensionsChart } from "@/components/ClientPEIIDimensionsChart"
import { ClientSentimentDivergenceChart } from "@/components/ClientSentimentDivergenceChart"
import { DashboardFilters } from "@/components/DashboardFilters"
import { Target, AlertTriangle, Activity, CheckCircle } from "lucide-react"

const analyticsMetrics = [
  {
    label: "Primary Driver",
    value: "Curriculum Relevance",
    subValue: "0.92 Impact Score",
    icon: Target,
    color: "text-emerald-600",
  },
  {
    label: "Needs Attention",
    value: "Alumni Network",
    subValue: "0.35 Impact Score",
    icon: AlertTriangle,
    color: "text-amber-600",
  },
  {
    label: "Highest Variance",
    value: "Career Services",
    subValue: "Differs by Dept.",
    icon: Activity,
    color: "text-indigo-600",
  },
  {
    label: "Data Confidence",
    value: "94%",
    subValue: "Sample Size Reliability",
    icon: CheckCircle,
    color: "text-blue-600",
  },
]

export default function AnalyticsPage() {
  const [, setFilters] = useState({ department: "All Departments", batch: "All Batches" })

  return (
    <div className="space-y-12 animate-in fade-in duration-500 max-w-6xl mx-auto pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 pb-6 border-b border-slate-200">
        <div className="space-y-2">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">Statistical Analytics</h2>
          <p className="text-base text-slate-500 max-w-xl">
            Deep dive into institutional factors and the mathematical models driving the Pasig Education Impact Index.
          </p>
        </div>
        <DashboardFilters onFilterChange={setFilters} />
      </div>

      {/* Insights Ledger */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-slate-200 border-y border-slate-200">
        {analyticsMetrics.map((stat) => (
          <div key={stat.label} className="flex flex-col p-6 lg:p-8 hover:bg-slate-50/50 transition-colors">
            <div className="flex items-center gap-2 mb-6">
              <stat.icon className="w-[15px] h-[15px] text-slate-400" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{stat.label}</span>
            </div>
            
            <div className="mt-auto">
              <div className="text-lg font-semibold tracking-tight text-slate-900 mb-1.5 leading-snug">
                {stat.value}
              </div>
              <div className="text-[13px] font-medium text-slate-400">
                {stat.subValue}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Charts Grid */}
      <div className="grid gap-6 lg:grid-cols-2 mt-8">
        <div className="rounded-xl border border-slate-200/80 bg-white shadow-sm shadow-slate-100/50 overflow-hidden">
          <ClientPEIIDimensionsChart />
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-white shadow-sm shadow-slate-100/50 overflow-hidden">
          <ClientSentimentDivergenceChart />
        </div>
      </div>
    </div>
  )
}
