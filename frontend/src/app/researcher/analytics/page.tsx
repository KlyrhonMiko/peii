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
import { Target, AlertTriangle, Database, Users, TrendingUp } from "lucide-react"
import { fetchSurveys, fetchPEII, fetchResponseAggregates } from "@/lib/surveys"
import type { PEIIDomainScore } from "@/components/PEIIDimensionsChart"
import type { PEIIDemographics, PEIIHistoricalTrend, SurveyResponseAggregate, FeedbackClassification, QualitativeFeedback } from "@/lib/surveys"

export default function AnalyticsPage() {
  const [filters, setFilters] = useState({ department: "All Departments", batch: "All Batches" })
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

  useEffect(() => {
    async function loadData() {
      setIsLoading(true)
      try {
        const { surveys } = await fetchSurveys({ status: "Active" })
        const activeTracerSurvey = surveys.find(s => s.title === "GRADUATE TRACER STUDY SURVEY")
        if (!activeTracerSurvey) {
          setChartData([])
          return
        }
        setSurveyId(activeTracerSurvey.id)

        const [data, aggData] = await Promise.all([
          fetchPEII(activeTracerSurvey.id, {
            batch: filters.batch,
            department: filters.department
          }),
          fetchResponseAggregates(activeTracerSurvey.id)
        ])

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
        setIsLoading(false)
      }
    }
    
    void loadData()
  }, [filters])

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
        <div className="flex items-center justify-center py-20 text-slate-400">Loading data...</div>
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
                <ClientCurriculumFeedback surveyId={surveyId} feedbacks={qualitativeFeedback} isLoading={isLoading} />
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

