"use client"

import { useState, useMemo } from "react"
import { ClientCohortTrendChart } from "@/components/ClientCohortTrendChart"
import { DashboardFilters } from "@/components/DashboardFilters"
import { TrendingUp, Users, Briefcase, Sparkles, ArrowUpRight } from "lucide-react"

const baseStats = [
  {
    label: "Post-Graduation PEII Score",
    baseValue: 0.82,
    change: "+0.11",
    changeLabel: "vs Pre-Grad Baseline",
    icon: TrendingUp,
    color: "text-indigo-600",
    trend: "text-emerald-600",
  },
  {
    label: "Total Alumni Tracked",
    baseValue: 12450,
    change: "+1,200",
    changeLabel: "this cohort",
    icon: Users,
    color: "text-blue-600",
    trend: "text-emerald-600",
  },
  {
    label: "Transformative Gain",
    baseValue: 0.11,
    change: null,
    changeLabel: "Avg gap between Pre & Post scores",
    icon: Sparkles,
    color: "text-purple-600",
    trend: "text-emerald-600",
    isFloat: true,
  },
  {
    label: "Sentiment Divergence",
    baseValue: 8.5,
    change: "-1.2%",
    changeLabel: "vs previous cohort",
    icon: Briefcase,
    color: "text-amber-600",
    trend: "text-emerald-600",
    isPercent: true,
  },
]

export default function DashboardPage() {
  const [filters, setFilters] = useState({ department: "All Departments", batch: "All Batches" })

  const stats = useMemo(() => {
    let multiplier = 1
    if (filters.department !== "All Departments") multiplier *= 0.8
    if (filters.batch !== "All Batches") multiplier *= 0.2

    return baseStats.map(stat => {
      let value: string | number = stat.baseValue
      if (typeof value === 'number' && !stat.isPercent && !stat.isFloat) {
        value = Math.floor(value * multiplier)
        if (stat.label === "Post-Graduation PEII Score") {
           // Score should stay between 0.6 and 0.95
           value = (0.7 + (multiplier * 0.12)).toFixed(2)
        } else {
           value = value.toLocaleString()
        }
      } else if (stat.isPercent) {
         value = `${(stat.baseValue * multiplier).toFixed(1)}%`
      } else if (stat.isFloat) {
         value = `+${(stat.baseValue * multiplier).toFixed(2)}`
      }

      return {
        ...stat,
        value: String(value)
      }
    })
  }, [filters])

  return (
    <div className="space-y-12 animate-in fade-in duration-500 max-w-6xl mx-auto pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 pb-6 border-b border-slate-200">
        <div className="space-y-2">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">Dashboard Overview</h2>
          <p className="text-base text-slate-500 max-w-xl">
            Real-time analytics and cohort tracking for the Pasig Education Impact Index.
          </p>
        </div>
        <DashboardFilters onFilterChange={setFilters} />
      </div>

      {/* Stats Section - Editorial Ledger */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-slate-200 border-y border-slate-200">
        {stats.map((stat) => (
          <div key={stat.label} className="flex flex-col p-6 lg:p-8 hover:bg-slate-50/50 transition-colors">
            <div className="flex items-center gap-2 mb-6">
              <stat.icon className="w-[15px] h-[15px] text-slate-400" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{stat.label}</span>
            </div>
            
            <div className="mt-auto">
              <div className="text-4xl font-semibold tracking-tight text-slate-900 mb-3">
                {stat.value}
              </div>
              <div className="flex items-center gap-1.5">
                {stat.change ? (
                  <span className={`text-[13px] font-semibold flex items-center ${stat.trend}`}>
                    <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" />
                    {stat.change}
                  </span>
                ) : null}
                <span className="text-[13px] font-medium text-slate-400">{stat.changeLabel}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Chart Section */}
      <div className="mt-8">
        <div className="mb-6 px-2">
          <h3 className="text-lg font-semibold text-slate-900 tracking-tight">Cohort Trend Analysis</h3>
          <p className="text-[13px] font-medium text-slate-500 mt-0.5">Historical PEII scores across recent graduating years</p>
        </div>
        <div className="h-[460px] w-full">
          <ClientCohortTrendChart filters={filters} />
        </div>
      </div>
    </div>
  )
}
