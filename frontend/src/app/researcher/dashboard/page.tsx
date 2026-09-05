"use client"

import { useState, useEffect, useMemo } from "react"
import { ClientCohortTrendChart } from "@/components/ClientCohortTrendChart"
import { ClientDomainGainChart } from "@/components/ClientDomainGainChart"
import { ClientDemographicsOverview } from "@/components/ClientDemographicsOverview"
import { DashboardFilters } from "@/components/DashboardFilters"
import { Skeleton } from "@/components/ui/skeleton"
import { TrendingUp, Users, Sparkles, Database } from "lucide-react"
import { fetchSurveys, fetchPEII, TRACER_STUDY_SURVEY_TITLE } from "@/lib/surveys"
import type { PEIIDemographics, PEIIHistoricalTrend } from "@/lib/surveys"
import type { PEIIDomainScore } from "@/components/ClientDomainGainChart"

function DashboardSkeleton() {
  return (
    <div className="pb-12">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 mt-12">

        {/* LEFT COLUMN (8 cols) */}
        <div className="lg:col-span-8 flex flex-col gap-24">

          {/* Cohort Trend chart skeleton */}
          <div className="pb-16 border-b border-slate-200 space-y-6">
            <div className="space-y-1.5">
              <Skeleton className="h-[1.125rem] w-48" />
              <Skeleton className="h-3.5 w-60" />
            </div>
            <Skeleton className="w-full h-[460px] rounded-xl" />
          </div>

          {/* Domain Improvement dumbbell skeleton */}
          <div className="pb-16 space-y-8">
            <div className="space-y-1.5">
              <Skeleton className="h-[1.125rem] w-44" />
              <Skeleton className="h-3.5 w-56" />
            </div>
            {/* Axis header */}
            <div className="flex w-full pb-3 border-b border-slate-200">
              <Skeleton className="h-3 w-16" />
            </div>
            {/* 6 dumbbell rows */}
            <div className="flex flex-col gap-10">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="flex items-center w-full gap-4">
                  <div className="w-[40%] space-y-1.5">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                  <div className="w-[60%] h-8 flex items-center">
                    <Skeleton className="h-1.5 w-full rounded-full" />
                  </div>
                </div>
              ))}
            </div>
            {/* Legend */}
            <div className="flex items-center gap-6 pt-6 border-t border-slate-200">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>

        </div>

        {/* RIGHT COLUMN (4 cols) */}
        <div className="lg:col-span-4 flex flex-col gap-16 lg:border-l border-slate-200 lg:pl-16">
          <div className="flex flex-col gap-12">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex flex-col">
                <Skeleton className="h-3 w-32 mb-4" />
                <Skeleton className="h-14 w-40 mb-2" />
                <Skeleton className="h-3.5 w-28" />
              </div>
            ))}
          </div>

          {/* Demographics skeleton */}
          <div className="flex flex-col gap-12 pt-16 border-t border-slate-200">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex flex-col">
                <Skeleton className="h-3 w-36 mb-6" />
                <Skeleton className="h-14 w-32 mb-2" />
                <Skeleton className="h-3.5 w-24" />
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}

export default function DashboardPage() {
  const [filters, setFilters] = useState({ department: "All Departments", degree: "All Degrees", batch: "All Batches" })
  const [demographics, setDemographics] = useState<PEIIDemographics | null>(null)
  const [chartData, setChartData] = useState<PEIIDomainScore[]>([])
  const [peiiScore, setPeiiScore] = useState<number | null>(null)
  const [historicalTrend, setHistoricalTrend] = useState<PEIIHistoricalTrend[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [hasData, setHasData] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function fetchDashboardData() {
      if (!cancelled) setIsLoading(true)
      try {
        const { surveys } = await fetchSurveys({
          status: "Active",
          search: TRACER_STUDY_SURVEY_TITLE,
          limit: 100,
        })
        const activeTracerSurvey = surveys.find(s => s.title === TRACER_STUDY_SURVEY_TITLE)
        if (!activeTracerSurvey) {
          if (!cancelled) setHasData(false)
          return
        }

        const data = await fetchPEII(activeTracerSurvey.id, {
          batch: filters.batch,
          department: filters.department,
          degree: filters.degree,
        })

        if (cancelled) return

        if (data.cohort_result?.domains) {
          setChartData(
            data.cohort_result.domains.map(d => ({
              dimension: d.dimension,
              preGrad: d.pre_grad,
              postGrad: d.post_grad,
            }))
          )
          setPeiiScore(data.cohort_result.peii_score ?? null)
          setHistoricalTrend(data.historical_trend ?? [])
        } else {
          setChartData([])
          setPeiiScore(null)
          setHistoricalTrend([])
        }

        setDemographics(data.demographics)
        setHasData((data.demographics?.total_responses ?? 0) > 0)
      } catch (error) {
        if (cancelled) return
        console.error("Failed to load dashboard data", error)
        setDemographics(null)
        setChartData([])
        setPeiiScore(null)
        setHistoricalTrend([])
        setHasData(false)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void fetchDashboardData()
    return () => { cancelled = true }
  }, [filters])

  const ledgerMetrics = useMemo(() => {
    const totalResponses = demographics?.total_responses ?? 0

    let totalGain = 0
    chartData.forEach(d => { totalGain += d.postGrad - d.preGrad })
    const avgGain = chartData.length > 0 ? totalGain / chartData.length : 0

    let highestGainDomain = "N/A"
    let highestGain = -999
    chartData.forEach(d => {
      const gain = d.postGrad - d.preGrad
      if (gain > highestGain) {
        highestGain = gain
        highestGainDomain = d.dimension
      }
    })
    if (highestGain === -999) highestGain = 0

    const isAllBatches = filters.batch === "All Batches"
    const batchIndicator = isAllBatches ? "Average of all previous changes" : `Batch ${filters.batch}`

    return [
      {
        label: "Total Responses",
        value: totalResponses > 0 ? totalResponses.toLocaleString() : "—",
        subValue: "Sample size reliability",
        icon: Users,
      },
      {
        label: "PEII Score",
        value: peiiScore !== null ? peiiScore.toFixed(2) : "—",
        subValue: "Weighted cohort score",
        indicator: peiiScore !== null ? batchIndicator : undefined,
        icon: TrendingUp,
      },
      {
        label: "Transformative Gain",
        value: chartData.length > 0 ? `+${avgGain.toFixed(2)}` : "—",
        subValue: "Avg pre→post domain gap",
        indicator: chartData.length > 0 ? batchIndicator : undefined,
        icon: Sparkles,
      },
      {
        label: "Primary Driver",
        value: highestGainDomain,
        subValue: chartData.length > 0 ? `+${highestGain.toFixed(2)} gain` : "No domain data",
        indicator: chartData.length > 0 && highestGainDomain !== "No data" ? batchIndicator : undefined,
        icon: TrendingUp,
      },
    ]
  }, [demographics, chartData, peiiScore, filters.batch])

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
        {(!isLoading && (!demographics || demographics.total_responses === 0) && filters.department === "All Departments" && filters.batch === "All Batches") ? null : (
          <DashboardFilters onFilterChange={setFilters} />
        )}
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        <DashboardSkeleton />
      ) : !hasData ? (
        <div className="mt-8 flex flex-col items-center justify-center py-32 text-center border border-dashed border-slate-300 rounded-2xl bg-slate-50/50">
          <div className="w-16 h-16 bg-white rounded-2xl shadow-sm border border-slate-100 flex items-center justify-center mb-6">
            <Database className="w-8 h-8 text-slate-300" />
          </div>
          <h3 className="text-xl font-semibold text-slate-900 mb-2">No Dashboard Data Found</h3>
          <p className="text-slate-500 max-w-md mb-6">
            {(filters.department !== "All Departments" || filters.batch !== "All Batches")
              ? "There are no survey responses matching the selected filters. Try adjusting your batch or department criteria."
              : "The analytics database is currently empty. Wait for alumni to complete the tracer study."}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 mt-12">

            {/* LEFT COLUMN (8 cols): Chart canvas */}
            <div className="lg:col-span-8 flex flex-col gap-24">

              {/* Cohort Trend Line Chart */}
              <div className="pb-16 border-b border-slate-200">
                <div className="mb-6">
                  <h3 className="font-semibold text-slate-900">Cohort Trend Analysis</h3>
                  <p className="text-sm text-slate-500 mt-1">
                    Historical PEII scores across recent graduating years
                  </p>
                </div>
                <div className="h-[460px] w-full">
                  <ClientCohortTrendChart data={historicalTrend} />
                </div>
              </div>

              {/* Domain Improvement — paired bar chart */}
              <div className="pb-16">
                <ClientDomainGainChart data={chartData} isLoading={isLoading} />
              </div>

            </div>

            {/* RIGHT COLUMN (4 cols): Metrics ledger only */}
            <div className="lg:col-span-4 flex flex-col gap-16 lg:border-l border-slate-200 lg:pl-16">

              <div className="flex flex-col gap-12 pb-16 border-b border-slate-200">
                {ledgerMetrics.map((stat) => (
                  <div key={stat.label} className="flex flex-col">
                    <div className="flex items-center gap-2 mb-4">
                      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                        {stat.label}
                      </span>
                    </div>
                    <div className="text-5xl font-light tracking-tighter text-slate-900 mb-2 leading-[1.1] break-words">
                      {stat.value}
                    </div>
                    <div className="mt-1 space-y-0.5">
                      <div className="text-sm font-medium text-slate-700">
                        {stat.subValue}
                      </div>
                      {stat.indicator && (
                        <div className="text-xs text-slate-400 font-normal">
                          {stat.indicator}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Demographics — fills the remaining right rail */}
              <div className="pt-0">
                <ClientDemographicsOverview demographics={demographics} isLoading={isLoading} />
              </div>

            </div>
          </div>
        </>
      )}
    </div>
  )
}
