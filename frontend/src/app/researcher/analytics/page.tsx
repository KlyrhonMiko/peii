"use client"

import { useState, useEffect, useMemo } from "react"
import { ClientPEIIDimensionsChart } from "@/components/ClientPEIIDimensionsChart"
import { ClientFeedbackClassificationChart } from "@/components/ClientFeedbackClassificationChart"
import { ClientDemographicsOverview } from "@/components/ClientDemographicsOverview"
import { ClientPEIIHistoricalTrendChart } from "@/components/ClientPEIIHistoricalTrendChart"
import { ClientDomainGainChart } from "@/components/ClientDomainGainChart"
import { ClientKeyOutcomes } from "@/components/ClientKeyOutcomes"
import { ClientDegreeAlignment } from "@/components/ClientDegreeAlignment"
import { ClientCurriculumFeedback } from "@/components/ClientCurriculumFeedback"
import { DashboardFilters } from "@/components/DashboardFilters"
import { Skeleton } from "@/components/ui/skeleton"
import { Target, AlertTriangle, Database, Users, TrendingUp } from "lucide-react"
import {
  fetchSurveys,
  fetchPEII,
  fetchResponseAggregates,
  TRACER_STUDY_SURVEY_TITLE,
} from "@/lib/surveys"
import type { PEIIDomainScore } from "@/components/PEIIDimensionsChart"
import type { PEIIDemographics, PEIIHistoricalTrend, SurveyResponseAggregate, FeedbackClassification, QualitativeFeedback } from "@/lib/surveys"

function AnalyticsSkeleton() {
  return (
    <div className="pb-12">
      {/* Main Asymmetric Grid Skeleton — header is already rendered above */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 mt-12">

        {/* LEFT COLUMN (8 cols) */}
        <div className="lg:col-span-8 flex flex-col gap-24">

          {/* Historical Trend — aspect-[21/9] min-h-[400px] */}
          <div className="pb-16 border-b border-slate-200 space-y-6">
            <div className="space-y-1.5">
              <Skeleton className="h-[1.125rem] w-48" />
              <Skeleton className="h-3.5 w-60" />
            </div>
            <Skeleton className="w-full aspect-[21/9] min-h-[400px] rounded-xl" />
          </div>

          {/* Domain Gain — axis header + 6 dumbbell rows */}
          <div className="pb-16 border-b border-slate-200 space-y-8">
            <div className="space-y-1.5">
              <Skeleton className="h-[1.125rem] w-44" />
              <Skeleton className="h-3.5 w-64" />
            </div>
            {/* Axis header bar */}
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

          {/* Radar Chart — h-[400px] */}
          <div className="pb-16 border-b border-slate-200 space-y-6">
            <div className="space-y-1.5">
              <Skeleton className="h-[1.125rem] w-52" />
              <Skeleton className="h-3.5 w-56" />
            </div>
            <Skeleton className="h-[400px] w-full rounded-xl" />
          </div>

          {/* Feedback Sentiment — ~6 dimension rows with h-3 bar */}
          <div className="pb-16 border-b border-slate-200 space-y-6">
            <div className="space-y-1.5">
              <Skeleton className="h-[1.125rem] w-56" />
              <Skeleton className="h-3.5 w-72" />
            </div>
            <div className="flex flex-col gap-8 px-2">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="flex flex-col gap-3">
                  <Skeleton className="h-3.5 w-48" />
                  <Skeleton className="h-3 w-full rounded-full" />
                </div>
              ))}
            </div>
            {/* Legend */}
            <div className="flex gap-6 px-2 mt-10">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>

          {/* Curriculum Feedback — header + filter tabs + 4 feedback cards */}
          <div className="pb-16 space-y-6">
            <div className="space-y-1.5">
              <Skeleton className="h-[1.125rem] w-48" />
              <Skeleton className="h-3.5 w-64" />
            </div>
            {/* Dimension filter pills */}
            <div className="flex gap-2 flex-wrap">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-7 w-24 rounded-full" />
              ))}
            </div>
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="rounded-xl border border-slate-100 p-4 space-y-2.5">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-5 w-16 rounded-full" />
                    <Skeleton className="h-3.5 w-28" />
                  </div>
                  <Skeleton className="h-3.5 w-full" />
                  <Skeleton className="h-3.5 w-4/5" />
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* RIGHT COLUMN (4 cols) */}
        <div className="lg:col-span-4 flex flex-col gap-16 lg:border-l border-slate-200 lg:pl-16">

          {/* Analytics Metrics Ledger — 4 stat blocks (label → text-5xl number → subtext) */}
          <div className="flex flex-col gap-12 pb-16 border-b border-slate-200">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex flex-col">
                {/* uppercase tracking label */}
                <Skeleton className="h-3 w-32 mb-4" />
                {/* text-5xl font-light value — could be multi-line word */}
                <Skeleton className="h-14 w-40 mb-2" />
                {/* subValue */}
                <Skeleton className="h-3.5 w-28" />
              </div>
            ))}
          </div>

          {/* Demographics Overview — 3 ledger blocks (label → text-5xl → sub) */}
          <div className="pb-16 border-b border-slate-200 flex flex-col gap-12">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex flex-col">
                <Skeleton className="h-3 w-36 mb-6" />
                <Skeleton className="h-14 w-32 mb-2" />
                <Skeleton className="h-3.5 w-24" />
              </div>
            ))}
          </div>

          {/* Employment Stability — label → text-5xl % → segmented bar */}
          <div className="pb-16 border-b border-slate-200 space-y-6">
            <div className="space-y-1.5">
              <Skeleton className="h-[1.125rem] w-40" />
              <Skeleton className="h-3.5 w-64" />
            </div>
            <div className="flex flex-col gap-2 mt-4">
              <Skeleton className="h-14 w-20" />
              <Skeleton className="h-3.5 w-32" />
            </div>
            <Skeleton className="h-3 w-full rounded-full" />
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-3 w-20" />
              ))}
            </div>
          </div>

          {/* Degree Alignment — same structure as Employment Stability */}
          <div className="pb-16 space-y-6">
            <div className="space-y-1.5">
              <Skeleton className="h-[1.125rem] w-36" />
              <Skeleton className="h-3.5 w-56" />
            </div>
            <div className="flex flex-col gap-2 mt-4">
              <Skeleton className="h-14 w-20" />
              <Skeleton className="h-3.5 w-28" />
            </div>
            <Skeleton className="h-3 w-full rounded-full" />
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-3 w-20" />
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

export default function AnalyticsPage() {
  const [filters, setFilters] = useState({ department: "All Departments", degree: "All Degrees", batch: "All Batches" })
  const [chartData, setChartData] = useState<PEIIDomainScore[]>([])
  const [demographics, setDemographics] = useState<PEIIDemographics | null>(null)
  const [classificationData, setClassificationData] = useState<FeedbackClassification[]>([])
  const [peiiScore, setPeiiScore] = useState<number | null>(null)
  const [peiiIndex, setPeiiIndex] = useState<number | null>(null)
  const [historicalTrend, setHistoricalTrend] = useState<PEIIHistoricalTrend[]>([])
  const [qualitativeFeedback, setQualitativeFeedback] = useState<QualitativeFeedback[]>([])
  const [aggregates, setAggregates] = useState<SurveyResponseAggregate[]>([])
  const [surveyId, setSurveyId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function fetchData() {
      if (!cancelled) setIsLoading(true)
      try {
        const { surveys } = await fetchSurveys({
          status: "Active",
          search: TRACER_STUDY_SURVEY_TITLE,
          limit: 100,
        })
        const activeTracerSurvey = surveys.find(s => s.title === TRACER_STUDY_SURVEY_TITLE)
        if (!activeTracerSurvey) {
          if (!cancelled) setChartData([])
          return
        }
        if (!cancelled) setSurveyId(activeTracerSurvey.id)

        const [data, aggData] = await Promise.all([
          fetchPEII(activeTracerSurvey.id, {
            batch: filters.batch,
            department: filters.department,
            degree: filters.degree
          }),
          fetchResponseAggregates(activeTracerSurvey.id)
        ])

        if (cancelled) return
        setAggregates(aggData || [])

        if (data.cohort_result && data.cohort_result.domains) {
          setChartData(data.cohort_result.domains.map(d => ({
            dimension: d.dimension,
            preGrad: d.pre_grad,
            postGrad: d.post_grad
          })))
          setPeiiScore(data.cohort_result.peii_score ?? null)
          setPeiiIndex(data.cohort_result.peii_index ?? null)
          setHistoricalTrend(data.historical_trend || [])
          setQualitativeFeedback(data.qualitative_feedback || [])
        } else {
          setChartData([])
          setPeiiScore(null)
          setPeiiIndex(null)
          setHistoricalTrend([])
          setQualitativeFeedback([])
        }

        setDemographics(data.demographics)

        if (data.feedback_classification && data.feedback_classification.classifications) {
          setClassificationData(data.feedback_classification.classifications)
        } else {
          setClassificationData([])
        }
      } catch (error) {
        if (cancelled) return
        console.error("Failed to load PEII data", error)
        setChartData([])
        setDemographics(null)
        setClassificationData([])
        setPeiiScore(null)
        setPeiiIndex(null)
        setHistoricalTrend([])
        setQualitativeFeedback([])
        setAggregates([])
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void fetchData()
    return () => { cancelled = true }
  }, [filters, refreshKey])

  const analyticsMetrics = useMemo(() => {
    if (!demographics) return []

    let highestGainDomain = "N/A"
    let highestGain = -999
    let lowestGainDomain = "N/A"
    let lowestGain = 999

    chartData.forEach(d => {
      const gain = d.postGrad - d.preGrad
      if (gain > highestGain) {
        highestGain = gain
        highestGainDomain = d.dimension
      }
      if (gain < lowestGain) {
        lowestGain = gain
        lowestGainDomain = d.dimension
      }
    })

    if (highestGain === -999) highestGain = 0
    if (lowestGain === 999) lowestGain = 0

    return [
      {
        label: "Total Responses",
        value: demographics.total_responses.toLocaleString(),
        subValue: "Sample Size Reliability",
        icon: Users,
        color: "text-blue-600",
        bgColor: "bg-blue-50",
        borderColor: "border-blue-100",
      },
      {
        label: "PEII Improvement Score",
        value: peiiScore !== null ? `${peiiScore > 0 ? '+' : ''}${peiiScore.toFixed(2)}` : "0.00",
        subValue: peiiIndex !== null ? `${peiiIndex.toFixed(1)}% vs Baseline` : "Overall Weighted Gain",
        icon: Target,
        color: "text-emerald-600",
        bgColor: "bg-emerald-50",
        borderColor: "border-emerald-100",
      },
      {
        label: "Primary Driver",
        value: highestGainDomain,
        subValue: `+${highestGain.toFixed(2)} Gain`,
        icon: TrendingUp,
        color: "text-indigo-600",
        bgColor: "bg-indigo-50",
        borderColor: "border-indigo-100",
      },
      {
        label: "Needs Attention",
        value: lowestGainDomain,
        subValue: `${lowestGain > 0 ? '+' : ''}${lowestGain.toFixed(2)} Gain`,
        icon: AlertTriangle,
      },
    ]
  }, [demographics, chartData, peiiScore, peiiIndex])

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
        {/* Only hide filters if the database is completely empty (no active filters and 0 results) */}
        {(!isLoading && (!demographics || demographics.total_responses === 0) && filters.department === "All Departments" && filters.batch === "All Batches") ? null : (
          <DashboardFilters onFilterChange={setFilters} />
        )}
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        <AnalyticsSkeleton />
      ) : (!demographics || demographics.total_responses === 0) ? (
        <div className="mt-8 flex flex-col items-center justify-center py-32 text-center border border-dashed border-slate-300 rounded-2xl bg-slate-50/50">
          <div className="w-16 h-16 bg-white rounded-2xl shadow-sm border border-slate-100 flex items-center justify-center mb-6">
            <Database className="w-8 h-8 text-slate-300" />
          </div>
          <h3 className="text-xl font-semibold text-slate-900 mb-2">No Analytics Data Found</h3>
          <p className="text-slate-500 max-w-md mb-6">
            {(filters.department !== "All Departments" || filters.batch !== "All Batches") 
              ? "There are no survey responses matching the selected filters. Try adjusting your batch or department criteria."
              : "The analytics database is currently empty. Wait for alumni to complete the tracer study."}
          </p>
        </div>
      ) : (
        <>
          {/* Main Asymmetric Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 mt-12">
            
            {/* LEFT COLUMN (8 cols): Canvas for macro-charts */}
            <div className="lg:col-span-8 flex flex-col gap-24">
              
              {/* Historical Trend spans full 8 cols */}
              <div className="pb-16 border-b border-slate-200">
                <ClientPEIIHistoricalTrendChart data={historicalTrend} isLoading={isLoading} />
              </div>

              {/* Domain Gain spans full 8 cols */}
              <div className="pb-16 border-b border-slate-200">
                <ClientDomainGainChart data={chartData} isLoading={isLoading} />
              </div>

              {/* Radar Chart */}
              <div className="pb-16 border-b border-slate-200">
                <ClientPEIIDimensionsChart data={chartData} isLoading={isLoading} />
              </div>

              {/* Feedback Sentiment Chart */}
              <div className="pb-16 border-b border-slate-200">
                <ClientFeedbackClassificationChart data={classificationData} />
              </div>

              {/* Curriculum Feedback */}
              <div className="pb-16">
                <ClientCurriculumFeedback surveyId={surveyId} feedbacks={qualitativeFeedback} isLoading={isLoading} onRefresh={() => setRefreshKey(k => k + 1)} />
              </div>

            </div>

            {/* RIGHT COLUMN (4 cols): Dense Telemetry & Metadata */}
            <div className="lg:col-span-4 flex flex-col gap-16 lg:border-l border-slate-200 lg:pl-16">
              
              {/* Insights Ledger stacked vertically */}
              <div className="flex flex-col gap-12 pb-16 border-b border-slate-200">
                {analyticsMetrics.map((stat) => (
                  <div key={stat.label} className="flex flex-col">
                    <div className="flex items-center gap-2 mb-4">
                      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">{stat.label}</span>
                    </div>
                    <div className="text-5xl font-light tracking-tighter text-slate-900 mb-2 leading-[1.1] break-words">
                      {stat.value}
                    </div>
                    <div className="text-sm font-medium text-slate-500 mt-1">
                      {stat.subValue}
                    </div>
                  </div>
                ))}
              </div>

              {/* Demographics Overview stacked vertically */}
              <div className="pb-16 border-b border-slate-200">
                 <ClientDemographicsOverview demographics={demographics} isLoading={isLoading} />
              </div>

              {/* Key Outcomes in sidebar */}
              <div className="pb-16 border-b border-slate-200">
                <ClientKeyOutcomes aggregates={aggregates} isLoading={isLoading} />
              </div>

              {/* Degree Alignment in sidebar */}
              <div className="pb-16">
                <ClientDegreeAlignment aggregates={aggregates} isLoading={isLoading} />
              </div>

            </div>
          </div>
        </>
      )}
    </div>
  )
}

