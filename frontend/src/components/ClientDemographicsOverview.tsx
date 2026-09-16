"use client"



import type { PEIIDemographics } from "@/lib/surveys"

export function ClientDemographicsOverview({
  demographics,
  isLoading,
  isExport
}: {
  demographics: PEIIDemographics | null
  isLoading?: boolean
  isExport?: boolean
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
  const topBarangay = demographics.barangay_distribution ? getTop(demographics.barangay_distribution) : null

  // First-generation graduate percentage
  const firstGenYes = demographics.first_gen_distribution?.["Yes"] || 0
  const firstGenTotal = Object.values(demographics.first_gen_distribution || {}).reduce((a, b) => a + b, 0)
  const firstGenPct = firstGenTotal > 0 ? Math.round((firstGenYes / firstGenTotal) * 100) : null

  const labelClass = `font-bold uppercase tracking-[0.2em] text-slate-500 ${isExport ? 'text-xs' : 'text-[10px]'}`

  return (
    <div className={isExport ? "flex flex-row items-start justify-between w-full" : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-700 fill-mode-both"}>
      
      {/* Primary Demographic */}
      <div className="flex flex-col">
        <div className="mb-2">
          <span className={labelClass}>Gender Majority</span>
        </div>
        <div className="flex flex-col gap-1">
          {topGender ? (
            <>
              <span className="text-4xl font-light tracking-tighter text-slate-900 leading-[1.1] break-words">
                {Math.round((topGender[1] / demographics.total_responses) * 100)}%
              </span>
              <span className="text-sm font-medium text-slate-500">
                {topGender[0]} ({demographics.total_responses} respondents)
              </span>
            </>
          ) : (
            <>
              <span className="text-4xl font-light tracking-tighter text-slate-900 leading-[1.1] break-words">
                {demographics.total_responses}
              </span>
              <span className="text-sm font-medium text-slate-500">
                Total Respondents
              </span>
            </>
          )}
        </div>
      </div>

      {/* First Generation Graduate Indicator */}
      {firstGenPct !== null && (
        <div className="flex flex-col" style={{ animationDelay: '50ms' }}>
          <div className="mb-2">
            <span className={labelClass}>First-Gen College Graduate</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-4xl font-light tracking-tighter text-indigo-900 leading-[1.1] break-words">
              {firstGenPct}%
            </span>
            <span className="text-sm font-medium text-slate-500">
              {firstGenYes} first-in-family graduates
            </span>
          </div>
        </div>
      )}

      {/* Top Location & Barangay */}
      <div className="flex flex-col" style={{ animationDelay: '100ms' }}>
        <div className="mb-2">
          <span className={labelClass}>Primary Location</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className={`font-light tracking-tighter text-slate-900 leading-[1.1] break-words ${(topLocation?.[0]?.length || 0) > 15 ? 'text-2xl' : 'text-4xl'}`}>
            {topLocation ? topLocation[0] : "—"}
          </span>
          {topBarangay ? (
            <span className="text-sm font-medium text-slate-500">
              Top: Brgy. {topBarangay[0]} ({topBarangay[1]})
            </span>
          ) : topLocation && (
            <span className="text-sm font-medium text-slate-500">
              {Math.round((topLocation[1] / demographics.total_responses) * 100)}% of cohort
            </span>
          )}
        </div>
      </div>

      {/* Top Department */}
      <div className="flex flex-col" style={{ animationDelay: '200ms' }}>
        <div className="mb-2">
          <span className={labelClass}>Top Program</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className={`font-light tracking-tighter text-slate-900 leading-[1.1] break-words ${(topDept?.[0]?.length || 0) > 15 ? 'text-2xl' : 'text-4xl'}`}>
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
