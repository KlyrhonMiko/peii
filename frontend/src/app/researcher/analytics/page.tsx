"use client"

import { useState, useEffect } from "react"
import { ClientPEIIDimensionsChart } from "@/components/ClientPEIIDimensionsChart"
import { ClientSentimentDivergenceChart } from "@/components/ClientSentimentDivergenceChart"
import { ClientDemographicsOverview } from "@/components/ClientDemographicsOverview"
import { DashboardFilters } from "@/components/DashboardFilters"
import { Target, AlertTriangle, Activity, CheckCircle, Database } from "lucide-react"
import { fetchSurveys, fetchPEII } from "@/lib/surveys"
import type { PEIIDomainScore } from "@/components/PEIIDimensionsChart"
import type { PEIIDemographics } from "@/lib/surveys"

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
  const [filters, setFilters] = useState({ department: "All Departments", batch: "All Batches" })
  const [chartData, setChartData] = useState<PEIIDomainScore[]>([])
  const [demographics, setDemographics] = useState<PEIIDemographics | null>(null)
  const [divergenceData, setDivergenceData] = useState<any[]>([])
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

        const data = await fetchPEII(activeTracerSurvey.id, {
          batch: filters.batch,
          department: filters.department
        })

        if (data.cohort_result && data.cohort_result.domains) {
          setChartData(data.cohort_result.domains.map(d => ({
            dimension: d.dimension,
            preGrad: d.pre_grad,
            postGrad: d.post_grad
          })))
        } else {
          setChartData([])
        }
        
        setDemographics(data.demographics)
        
        if (data.sentiment_divergence && data.sentiment_divergence.tiers) {
          setDivergenceData(data.sentiment_divergence.tiers)
        } else {
          setDivergenceData([])
        }
      } catch (error) {
        console.error("Failed to load PEII data", error)
        setChartData([])
        setDemographics(null)
        setDivergenceData([])
      } finally {
        setIsLoading(false)
      }
    }
    
    loadData()
  }, [filters])

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

          {/* Demographics Overview */}
          <ClientDemographicsOverview demographics={demographics} isLoading={isLoading} />

          {/* Charts Grid */}
          <div className="grid gap-6 lg:grid-cols-2 mt-8">
            <div className="rounded-xl border border-slate-200/80 bg-white shadow-sm shadow-slate-100/50 overflow-hidden">
              <ClientPEIIDimensionsChart data={chartData} isLoading={isLoading} />
            </div>

            <div className="rounded-xl border border-slate-200/80 bg-white shadow-sm shadow-slate-100/50 overflow-hidden">
              <ClientSentimentDivergenceChart data={divergenceData} />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
