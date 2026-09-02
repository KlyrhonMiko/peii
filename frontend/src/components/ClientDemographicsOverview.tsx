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
    <div className="flex flex-col gap-12 animate-in fade-in slide-in-from-bottom-4 duration-700 fill-mode-both">
      
      {/* Total Responses */}
      <div className="flex flex-col">
        <div className="mb-6">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Total Respondents</span>
        </div>
        <div className="mt-auto flex flex-col gap-2">
          <span className="text-5xl font-light tracking-tighter text-slate-900 leading-[1.1] break-words">
            {demographics.total_responses}
          </span>
          {topGender && (
            <span className="text-sm font-medium text-slate-500">
              {Math.round((topGender[1] / demographics.total_responses) * 100)}% {topGender[0]}
            </span>
          )}
        </div>
      </div>

      {/* Top Location */}
      <div className="flex flex-col" style={{ animationDelay: '100ms' }}>
        <div className="mb-6">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Primary Location</span>
        </div>
        <div className="mt-auto flex flex-col gap-2">
          <span className="text-5xl font-light tracking-tighter text-slate-900 leading-[1.1] break-words">
            {topLocation ? topLocation[0] : "—"}
          </span>
          {topLocation && (
            <span className="text-sm font-medium text-slate-500">
              {Math.round((topLocation[1] / demographics.total_responses) * 100)}% of cohort
            </span>
          )}
        </div>
      </div>

      {/* Top Department */}
      <div className="flex flex-col" style={{ animationDelay: '200ms' }}>
        <div className="mb-6">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Top Program</span>
        </div>
        <div className="mt-auto flex flex-col gap-2">
          <span className="text-5xl font-light tracking-tighter text-slate-900 leading-[1.1] break-words">
            {topDept ? topDept[0] : "—"}
          </span>
          {topDept && (
            <span className="text-sm font-medium text-slate-500">
              {topDept[1]} respondents
            </span>
          )}
        </div>
      </div>

    </div>
  )
}
