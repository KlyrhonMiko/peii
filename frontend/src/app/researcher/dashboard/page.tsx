"use client"

import { useState, useMemo } from "react"
import { ClientCohortTrendChart } from "@/components/ClientCohortTrendChart"
import { DashboardFilters } from "@/components/DashboardFilters"
import { TrendingUp, Users, Briefcase, Sparkles, ArrowUpRight } from "lucide-react"

const baseStats = [
  {
    label: "Average PEII Score",
    baseValue: 0.82,
    change: "+0.04",
    changeLabel: "from last year",
    icon: TrendingUp,
    iconBg: "bg-emerald-50",
    iconColor: "text-emerald-600",
    changeColor: "text-emerald-600",
  },
  {
    label: "Total Alumni Tracked",
    baseValue: 12450,
    change: "+1,200",
    changeLabel: "this cohort",
    icon: Users,
    iconBg: "bg-blue-50",
    iconColor: "text-blue-600",
    changeColor: "text-blue-600",
  },
  {
    label: "Employment Rate",
    baseValue: 91,
    change: null,
    changeLabel: "Within 6 months of graduation",
    icon: Briefcase,
    iconBg: "bg-violet-50",
    iconColor: "text-violet-600",
    changeColor: "text-slate-500",
    isPercent: true,
  },
  {
    label: "Highest Impact Tier",
    baseValue: 1,
    change: null,
    changeLabel: "Highly Transformative",
    icon: Sparkles,
    iconBg: "bg-amber-50",
    iconColor: "text-amber-600",
    changeColor: "text-emerald-600",
    valueColor: "text-emerald-600",
    badge: true,
    isTier: true,
  },
]

export default function DashboardPage() {
  const [filters, setFilters] = useState({ department: "All Departments", batch: "All Batches" })

  // Calculate dynamic mock stats based on filters
  const stats = useMemo(() => {
    let multiplier = 1
    if (filters.department !== "All Departments") multiplier *= 0.8 // slightly lower/different numbers for specific dept
    if (filters.batch !== "All Batches") multiplier *= 0.2 // much smaller numbers for a specific batch

    return baseStats.map(stat => {
      let value: string | number = stat.baseValue
      if (typeof value === 'number' && !stat.isTier && !stat.isPercent) {
        value = Math.floor(value * multiplier)
        if (stat.label === "Average PEII Score") {
           // Score should stay between 0.6 and 0.95
           value = (0.7 + (multiplier * 0.15)).toFixed(2)
        } else {
           value = value.toLocaleString()
        }
      } else if (stat.isPercent) {
         value = `${Math.min(99, Math.floor(stat.baseValue - (1 - multiplier) * 10))}%`
      } else if (stat.isTier) {
         value = `Tier ${stat.baseValue}`
      }

      return {
        ...stat,
        value: String(value)
      }
    })
  }, [filters])

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-[20px] font-semibold text-slate-900 tracking-tight">Dashboard Overview</h2>
          <p className="text-[13px] text-slate-500 mt-0.5">
            High-level overview of the Pasig Education Impact Index (PEII) analytics and cohort tracking.
          </p>
        </div>
        <DashboardFilters onFilterChange={setFilters} />
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-slate-200/80 bg-white p-4 hover:border-slate-300/80 transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-medium text-slate-500">{stat.label}</span>
              <div className={`w-7 h-7 rounded-lg ${stat.iconBg} flex items-center justify-center`}>
                <stat.icon className={`w-[14px] h-[14px] ${stat.iconColor}`} />
              </div>
            </div>
            <div className={`text-[28px] font-semibold mt-2 leading-none tracking-tight ${stat.valueColor || "text-slate-900"}`}>
              {stat.value}
            </div>
            <div className="flex items-center mt-2 gap-1.5">
              {stat.change && (
                <span className={`text-[12px] font-medium ${stat.changeColor} flex items-center gap-0.5`}>
                  <ArrowUpRight className="w-3 h-3" />
                  {stat.change}
                </span>
              )}
              {stat.badge ? (
                <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                  {stat.changeLabel}
                </span>
              ) : (
                <span className="text-[12px] text-slate-400">{stat.changeLabel}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="rounded-xl border border-slate-200/80 bg-white">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h3 className="text-[14px] font-semibold text-slate-900">Cohort Trend Analysis</h3>
            <p className="text-[12px] text-slate-400 mt-0.5">Historical PEII scores across recent graduating years</p>
          </div>
          {/* Filters are now at the top, but we could put them here too. */}
        </div>
        <div className="h-[320px] w-full px-4 py-4">
          <ClientCohortTrendChart filters={filters} />
        </div>
      </div>
    </div>
  )
}
