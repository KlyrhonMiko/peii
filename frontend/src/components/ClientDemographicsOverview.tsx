"use client"

import { Users, MapPin, GraduationCap } from "lucide-react"
import type { PEIIDemographics } from "@/lib/surveys"

export function ClientDemographicsOverview({
  demographics,
  isLoading
}: {
  demographics: PEIIDemographics | null
  isLoading?: boolean
}) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-pulse mb-8">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-32 rounded-2xl bg-slate-100 border border-slate-200/60" />
        ))}
      </div>
    )
  }

  if (!demographics) return null

  // Calculate top values
  const getTop = (dist: Record<string, number>) => {
    const entries = Object.entries(dist).sort((a, b) => b[1] - a[1])
    return entries.length > 0 ? entries[0] : null
  }

  const topGender = getTop(demographics.gender_distribution)
  const topLocation = getTop(demographics.location_distribution)
  const topDept = getTop(demographics.department_distribution)

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700 fill-mode-both">
      
      {/* Total Responses */}
      <div className="flex flex-col justify-between p-6 rounded-2xl bg-white border border-slate-200/80 shadow-sm shadow-slate-100/50 relative overflow-hidden group">
        <div className="absolute -right-8 -top-8 w-32 h-32 bg-blue-50 rounded-full blur-3xl opacity-60 group-hover:bg-blue-100 transition-colors duration-500" />
        <div className="flex items-center gap-3 text-slate-500 font-medium z-10">
          <div className="p-2.5 bg-blue-50/80 text-blue-600 rounded-xl border border-blue-100/50">
            <Users size={18} strokeWidth={2.5} />
          </div>
          Total Respondents
        </div>
        <div className="mt-5 flex items-baseline gap-2 z-10">
          <span className="text-4xl font-bold tracking-tight text-slate-900">
            {demographics.total_responses}
          </span>
          {topGender && (
            <span className="text-sm font-medium text-slate-500">
              ({topGender[0]} Majority)
            </span>
          )}
        </div>
      </div>

      {/* Top Location */}
      <div className="flex flex-col justify-between p-6 rounded-2xl bg-white border border-slate-200/80 shadow-sm shadow-slate-100/50 relative overflow-hidden group" style={{ animationDelay: '100ms' }}>
        <div className="absolute -right-8 -top-8 w-32 h-32 bg-emerald-50 rounded-full blur-3xl opacity-60 group-hover:bg-emerald-100 transition-colors duration-500" />
        <div className="flex items-center gap-3 text-slate-500 font-medium z-10">
          <div className="p-2.5 bg-emerald-50/80 text-emerald-600 rounded-xl border border-emerald-100/50">
            <MapPin size={18} strokeWidth={2.5} />
          </div>
          Primary Location
        </div>
        <div className="mt-5 flex flex-col z-10">
          <span className="text-2xl font-bold tracking-tight text-slate-900 truncate">
            {topLocation ? topLocation[0] : "—"}
          </span>
          {topLocation && (
            <span className="text-sm font-medium text-slate-500 mt-0.5">
              {Math.round((topLocation[1] / demographics.total_responses) * 100)}% of cohort
            </span>
          )}
        </div>
      </div>

      {/* Top Department */}
      <div className="flex flex-col justify-between p-6 rounded-2xl bg-white border border-slate-200/80 shadow-sm shadow-slate-100/50 relative overflow-hidden group" style={{ animationDelay: '200ms' }}>
        <div className="absolute -right-8 -top-8 w-32 h-32 bg-purple-50 rounded-full blur-3xl opacity-60 group-hover:bg-purple-100 transition-colors duration-500" />
        <div className="flex items-center gap-3 text-slate-500 font-medium z-10">
          <div className="p-2.5 bg-purple-50/80 text-purple-600 rounded-xl border border-purple-100/50">
            <GraduationCap size={18} strokeWidth={2.5} />
          </div>
          Top Program
        </div>
        <div className="mt-5 flex flex-col z-10">
          <span className="text-2xl font-bold tracking-tight text-slate-900 truncate">
            {topDept ? topDept[0] : "—"}
          </span>
          {topDept && (
            <span className="text-sm font-medium text-slate-500 mt-0.5">
              {topDept[1]} respondents
            </span>
          )}
        </div>
      </div>

    </div>
  )
}
