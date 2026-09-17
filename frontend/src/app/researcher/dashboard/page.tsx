"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { ClientFeedbackClassificationChart } from "@/components/ClientFeedbackClassificationChart"
import { ClientDemographicsOverview } from "@/components/ClientDemographicsOverview"
import { ClientPEIIHistoricalTrendChart } from "@/components/ClientPEIIHistoricalTrendChart"
import { ClientDomainGainChart } from "@/components/ClientDomainGainChart"
import { ClientKeyOutcomes } from "@/components/ClientKeyOutcomes"
import { ClientDegreeAlignment } from "@/components/ClientDegreeAlignment"
import { ClientCurriculumFeedback } from "@/components/ClientCurriculumFeedback"
import { ClientPEIIDimensionsTrendChart } from "@/components/ClientPEIIDimensionsTrendChart"
import { ClientIncomeDistribution } from "@/components/ClientIncomeDistribution"
import { ClientHiringVelocity } from "@/components/ClientHiringVelocity"
import { ClientJobChannels } from "@/components/ClientJobChannels"
import { ClientEmploymentStability } from "@/components/ClientEmploymentStability"
import { DashboardNav } from "@/components/DashboardNav"
import { DashboardFilters, departmentDegrees } from "@/components/DashboardFilters"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Target, AlertTriangle, Database, Users, TrendingUp, Download, Loader2, ChevronDown, Check } from "lucide-react"
import {
  fetchSurveys,
  fetchPEII,
} from "@/lib/surveys"
import { getDimensionColor } from "@/lib/dimension-colors"
import type { PEIIDomainScore } from "@/components/ClientDomainGainChart"
import type { PEIIAnalyticsResponse, PEIIDemographics, PEIIHistoricalTrend, FeedbackClassification, QualitativeFeedback, Survey } from "@/lib/surveys"

const peiiTitleWord = /\bpeii\b/i
const surveyTitleWord = /\bsurvey\b/i

function AnalyticsSkeleton({ filters }: { filters?: { batch: string } }) {
  const showTrends = !filters || filters.batch === "All Batches"

  return (
    <div className="pb-12">
      {/* Main Asymmetric Grid Skeleton — header is already rendered above */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 mt-12">

        {/* LEFT COLUMN (8 cols) */}
        <div className="lg:col-span-8 flex flex-col gap-24">

          {/* Historical Trend — aspect-[21/9] min-h-[400px] */}
          {showTrends && (
            <div className="pb-16 border-b border-slate-200 space-y-6">
              <div className="space-y-1.5">
                <Skeleton className="h-[1.125rem] w-48" />
                <Skeleton className="h-3.5 w-60" />
              </div>
              <Skeleton className="w-full aspect-[21/9] min-h-[400px] rounded-xl" />
            </div>
          )}

          {/* Domain Gain — skeleton */}
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

          {/* Monthly Income Distribution — skeleton */}
          <div className="pb-16 border-b border-slate-200 space-y-6">
            <div className="space-y-1.5">
              <Skeleton className="h-[1.125rem] w-64" />
              <Skeleton className="h-3.5 w-72" />
            </div>
            <div className="flex flex-col gap-5 pt-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-4 w-32 shrink-0" />
                  <Skeleton className="h-7 w-full rounded-md" />
                </div>
              ))}
            </div>
          </div>

          {/* Hiring Velocity — skeleton */}
          <div className="pb-16 border-b border-slate-200 space-y-6">
            <div className="space-y-1.5">
              <Skeleton className="h-[1.125rem] w-56" />
              <Skeleton className="h-3.5 w-80" />
            </div>
            <div className="flex flex-col gap-3 pt-2">
              <Skeleton className="h-12 w-24" />
              <Skeleton className="h-3.5 w-48" />
            </div>
            <Skeleton className="h-3 w-full rounded-full" />
            <div className="flex flex-wrap gap-4 pt-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-3 w-24" />
              ))}
            </div>
          </div>

          {/* Job Search Channels — skeleton */}
          <div className="pb-16 border-b border-slate-200 space-y-6">
            <div className="space-y-1.5">
              <Skeleton className="h-[1.125rem] w-60" />
              <Skeleton className="h-3.5 w-72" />
            </div>
            <div className="flex flex-col gap-4 pt-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex flex-col gap-1.5">
                  <div className="flex justify-between">
                    <Skeleton className="h-3.5 w-40" />
                    <Skeleton className="h-3.5 w-12" />
                  </div>
                  <Skeleton className="h-2 w-full rounded-full" />
                </div>
              ))}
            </div>
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
            {/* Dimension filter tab strip */}
            <div className="flex gap-6 border-b border-slate-200 pb-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-4 w-20 rounded-none" />
              ))}
            </div>
            <div className="space-y-0 divide-y divide-slate-100">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="py-6 space-y-3">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-3 w-1 rounded-[1px]" />
                      <Skeleton className="h-3 w-24 rounded-none" />
                    </div>
                    <Skeleton className="h-4 w-20 rounded-none" />
                  </div>
                  <Skeleton className="h-5 w-full rounded-none" />
                  <Skeleton className="h-5 w-4/5 rounded-none" />
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

          {/* Employment Stability (Contract & Status) */}
          <div className="pb-16 border-b border-slate-200 space-y-6">
            <div className="space-y-1.5">
              <Skeleton className="h-[1.125rem] w-44" />
              <Skeleton className="h-3.5 w-60" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/50 space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-8 w-16" />
                <Skeleton className="h-2.5 w-24" />
              </div>
              <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/50 space-y-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-8 w-16" />
                <Skeleton className="h-2.5 w-24" />
              </div>
            </div>
            <Skeleton className="h-2.5 w-full rounded-full" />
          </div>

          {/* Key Outcomes (Perceived Likert) — label → text-5xl % → segmented bar */}
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

function ExportableSection({ id, name, children, filters, hideButton }: { id: string, name: string, children: React.ReactNode, filters: { batch: string, department: string, degree: string }, hideButton?: boolean }) {
  const currentFilters = useRef(filters)
  useEffect(() => { currentFilters.current = filters }, [filters])
  const handleExport = async () => {
    const exportFilters = filters
    try {
      const exportPromise = (async () => {
        await new Promise(r => setTimeout(r, 150))
        const { toPng } = await import('html-to-image')
        if (currentFilters.current !== exportFilters) throw new Error("Filters changed during export. Please export again.")
        const el = document.getElementById(id)
        if (!el) throw new Error("Element not found")

        // Add 48px padding to all sides for a nice breathing room
        const width = el.offsetWidth + 96
        const height = el.offsetHeight + 96

        const dataUrl = await toPng(el, {
          pixelRatio: 2,
          backgroundColor: '#f8fafc',
          width: width,
          height: height,
          style: {
            padding: '48px',
            margin: '0',
            borderRadius: '0px'
          },
          filter: (node: HTMLElement) => node.getAttribute('data-export-exclude') !== 'true'
        })
        if (currentFilters.current !== exportFilters) throw new Error("Filters changed during export. Please export again.")
        const link = document.createElement('a')
        link.href = dataUrl
        const date = new Date().toISOString().split('T')[0]
        link.download = `peii-${name.toLowerCase().replace(/\s+/g, '-')}-${filters.batch}-${filters.department}${filters.degree === "All Degrees" ? "" : `-${filters.degree}`}-${date}.png`
        link.click()
      })();

      toast.promise(exportPromise, {
        loading: `Exporting ${name}...`,
        success: `${name} exported successfully`,
        error: `Failed to export ${name}`
      })
      await exportPromise
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <div className="relative group/export w-full flex-1 flex flex-col min-w-0">
      {!hideButton && (
        <button
          onClick={handleExport}
          title={`Export ${name} as Image`}
          className="absolute top-2 right-2 z-20 transition-colors duration-300 p-2 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100/80"
        >
          <Download className="w-4 h-4" />
        </button>
      )}
      <div id={id} className="w-full flex-1 flex flex-col min-w-0">
        {children}
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const [surveys, setSurveys] = useState<Survey[]>([])
  const [selectedSurveyId, setSelectedSurveyId] = useState("")
  const [isSurveyLoading, setIsSurveyLoading] = useState(true)
  const [surveyError, setSurveyError] = useState(false)
  const [surveyRefreshKey, setSurveyRefreshKey] = useState(0)
  const [filters, setFilters] = useState({ department: "All Departments", degree: "All Degrees", batch: "All Batches" })
  const [chartData, setChartData] = useState<PEIIDomainScore[]>([])
  const [demographics, setDemographics] = useState<PEIIDemographics | null>(null)
  const [classificationData, setClassificationData] = useState<FeedbackClassification[]>([])
  const [peiiScore, setPeiiScore] = useState<number | null>(null)
  const [peiiIndex, setPeiiIndex] = useState<number | null>(null)
  const [historicalTrend, setHistoricalTrend] = useState<PEIIHistoricalTrend[]>([])
  const [qualitativeFeedback, setQualitativeFeedback] = useState<QualitativeFeedback[]>([])
  const [qualitativeFeedbackTotal, setQualitativeFeedbackTotal] = useState(0)
  const [qualitativeFeedbackTruncated, setQualitativeFeedbackTruncated] = useState(false)
  const [qualitativeFeedbackPlaceholderCount, setQualitativeFeedbackPlaceholderCount] = useState(0)
  const [outcomes, setOutcomes] = useState<PEIIAnalyticsResponse["outcome_distributions"] | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [availableBatches, setAvailableBatches] = useState<string[]>([])
  const [availableDepartments, setAvailableDepartments] = useState<string[]>([])
  const [availableDegrees, setAvailableDegrees] = useState<string[]>([])
  const isInitialDataLoaded = useRef(false)
  const [isExporting, setIsExporting] = useState(false)
  const [surveyOpen, setSurveyOpen] = useState(false)

  const handleExportDashboard = async () => {
    if (isLoading || isExporting || !demographics?.total_responses) return
    try {
      setIsExporting(true)

      const exportPromise = (async () => {
        // Yield to let the toast render and the hidden layout mount/animate
        await new Promise(r => setTimeout(r, 1500))

        const { toPng } = await import('html-to-image')
        const deptSuffix = filters.department === "All Departments" ? "" : ` - ${filters.department}`
        const degreeSuffix = filters.degree === "All Degrees" ? "" : ` - ${filters.degree}`
        const baseFilename = `PEII Poster - ${filters.batch}${deptSuffix}${degreeSuffix}`

        const sections = [
          { id: 'section-overview', suffix: '1-Overview' },
          { id: 'section-performance', suffix: '2-Performance' },
          { id: 'section-employment', suffix: '3-Employment' },
          { id: 'section-feedback', suffix: '4-Feedback' },
        ]

        for (const section of sections) {
          const el = document.getElementById(section.id)
          if (el) {
            const width = el.offsetWidth + 96
            const height = el.offsetHeight + 96

            const dataUrl = await toPng(el, {
              pixelRatio: 2,
              backgroundColor: '#ffffff',
              width: width,
              height: height,
              style: {
                padding: '48px',
                margin: '0',
                borderRadius: '0px'
              },
              filter: (node: HTMLElement) => node.getAttribute('data-export-exclude') !== 'true'
            })
            const link = document.createElement('a')
            link.href = dataUrl
            link.download = `${baseFilename} - ${section.suffix}.png`
            link.click()
            // Delay to prevent browser blocking
            await new Promise(r => setTimeout(r, 500))
          }
        }
      })();

      toast.promise(exportPromise, {
        loading: 'Generating dashboard exports...',
        success: 'Dashboard sections exported successfully',
        error: 'Failed to export dashboard'
      })

      await exportPromise
    } catch (error) {
      console.error('Failed to export dashboard', error)
    } finally {
      setIsExporting(false)
    }
  }

  const prevFiltersRef = useRef(filters)

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    async function loadSurveys() {
      setIsSurveyLoading(true)
      setSurveyError(false)
      try {
        const activeSurveys: Survey[] = []
        let offset = 0
        while (true) {
          const page = await fetchSurveys({ status: "Active", limit: 100, offset }, controller.signal)
          activeSurveys.push(...page.surveys)
          if (!page.pagination?.has_next || page.surveys.length === 0) break
          offset += 100
        }
        if (!cancelled) {
          setSurveys(activeSurveys)
          const defaultSurvey = activeSurveys.find((survey) =>
            peiiTitleWord.test(survey.title) && surveyTitleWord.test(survey.title),
          )
          if (defaultSurvey) setSelectedSurveyId((current) => current || defaultSurvey.id)
        }
      } catch (error) {
        if (cancelled || controller.signal.aborted) return
        console.error("Failed to load active surveys", error)
        setSurveyError(true)
      } finally {
        if (!cancelled) setIsSurveyLoading(false)
      }
    }

    void loadSurveys()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [surveyRefreshKey])

  useEffect(() => {
    if (!selectedSurveyId) return
    let cancelled = false
    const controller = new AbortController()

    const isFilterChange = prevFiltersRef.current !== filters
    prevFiltersRef.current = filters

    async function fetchData() {
      function resetFetchedData() {
        setChartData([])
        setDemographics(null)
        setClassificationData([])
        setPeiiScore(null)
        setPeiiIndex(null)
        setHistoricalTrend([])
        setQualitativeFeedback([])
        setQualitativeFeedbackTotal(0)
        setQualitativeFeedbackTruncated(false)
        setOutcomes(null)
      }

      if (!cancelled) {
        if (isFilterChange || !isInitialDataLoaded.current) {
          setIsLoading(true)
        }
        setFetchError(null)
      }
      try {
        const data = await fetchPEII(
          selectedSurveyId,
          {
            batch: filters.batch,
            department: filters.department,
            degree: filters.degree,
          },
          controller.signal,
        )
        if (cancelled) return
        setOutcomes(data.outcome_distributions ?? null)

        if (!isInitialDataLoaded.current) {
          if (data.historical_trend) {
            const batches = Array.from(new Set(data.historical_trend.map(t => t.batch_year))).sort().reverse()
            setAvailableBatches(batches)
          }
          if (data.demographics?.department_distribution) {
            const returnedDegrees = Object.keys(data.demographics.department_distribution)
            setAvailableDegrees(returnedDegrees)
            const activeDepartments = new Set<string>()
            for (const degree of returnedDegrees) {
              for (const [dept, degrees] of Object.entries(departmentDegrees)) {
                if (degrees.includes(degree) || degrees.includes(degree.trim())) {
                  activeDepartments.add(dept)
                }
              }
            }
            const depts = Array.from(activeDepartments).sort()
            setAvailableDepartments(depts)
          }
          isInitialDataLoaded.current = true
        }

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
          setQualitativeFeedbackTotal(data.qualitative_feedback_total)
          setQualitativeFeedbackTruncated(data.qualitative_feedback_truncated)
          setQualitativeFeedbackPlaceholderCount(data.qualitative_feedback_placeholder_count ?? 0)
        } else {
          setChartData([])
          setPeiiScore(null)
          setPeiiIndex(null)
          setHistoricalTrend([])
          setQualitativeFeedback([])
          setQualitativeFeedbackTotal(0)
          setQualitativeFeedbackTruncated(false)
          setQualitativeFeedbackPlaceholderCount(0)
        }

        setDemographics(data.demographics)

        if (data.feedback_classification && data.feedback_classification.classifications) {
          setClassificationData(data.feedback_classification.classifications)
        } else {
          setClassificationData([])
        }
      } catch (error) {
        if (cancelled || controller.signal.aborted) return
        console.error("Failed to load PEII data", error)
        resetFetchedData()
        setFetchError("Please try again. Your selected filters are preserved.")
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void fetchData()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [selectedSurveyId, filters, refreshKey])

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

    const isAllBatches = filters.batch === "All Batches"
    const batchIndicator = isAllBatches ? "Average of all previous changes" : `Batch ${filters.batch}`

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
        indicator: peiiScore !== null ? batchIndicator : undefined,
        icon: Target,
        color: "text-emerald-600",
        bgColor: "bg-emerald-50",
        borderColor: "border-emerald-100",
      },
      {
        label: "Primary Driver",
        value: highestGainDomain,
        subValue: `+${highestGain.toFixed(2)} Gain`,
        indicator: highestGainDomain !== "N/A" ? batchIndicator : undefined,
        icon: TrendingUp,
        color: "text-indigo-600",
        bgColor: "bg-indigo-50",
        borderColor: "border-indigo-100",
      },
      {
        label: "Needs Attention",
        value: lowestGainDomain,
        subValue: `${lowestGain > 0 ? '+' : ''}${lowestGain.toFixed(2)} Gain`,
        indicator: lowestGainDomain !== "N/A" ? batchIndicator : undefined,
        icon: AlertTriangle,
      },
    ]
  }, [demographics, chartData, peiiScore, peiiIndex, filters.batch])

  return (
    <div className="space-y-6 animate-in fade-in duration-500 w-full pb-12">
      {/* Page Header */}
      <div className="flex flex-col gap-6 pb-6 border-b border-slate-200">
        <div className="space-y-2">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">Dashboard</h2>
          <p className="text-base text-slate-500 max-w-xl">
            Real-time analytics and deep dive into the institutional factors driving the Pasig Education Impact Index.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center gap-2 sm:gap-4 lg:gap-6">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium text-slate-500 hidden lg:inline-block">Survey</span>
            <Popover open={surveyOpen} onOpenChange={setSurveyOpen}>
              <PopoverTrigger
                render={
                  <Button
                    disabled={isSurveyLoading || isExporting}
                    variant="outline"
                    className="h-8 text-[12px] font-medium border border-slate-200 rounded-lg text-slate-600 bg-white hover:bg-slate-50 hover:border-slate-300 shadow-sm px-3 flex items-center gap-1.5 focus-visible:ring-slate-400/20 focus-visible:border-slate-400 select-none cursor-pointer transition-all"
                  >
                    <span className="max-w-[150px] sm:max-w-[200px] truncate">
                      {selectedSurveyId ? surveys.find(s => s.id === selectedSurveyId)?.title || "Select a survey" : (isSurveyLoading ? "Loading surveys…" : "Select a survey")}
                    </span>
                    <ChevronDown className="w-3.5 h-3.5 opacity-60 flex-shrink-0" />
                  </Button>
                }
              />
              <PopoverContent
                align="start"
                className="w-72 p-1.5 flex flex-col gap-0.5 bg-white border border-slate-200 rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.08)] animate-in fade-in-0 zoom-in-95 duration-100 max-h-[300px]"
              >
                {surveys.map((survey) => {
                  const isSelected = survey.id === selectedSurveyId
                  return (
                    <button
                      key={survey.id}
                      onClick={() => {
                        setSelectedSurveyId(survey.id)
                        setFilters({ department: "All Departments", degree: "All Degrees", batch: "All Batches" })
                        setAvailableBatches([])
                        setAvailableDepartments([])
                        setAvailableDegrees([])
                        isInitialDataLoaded.current = false
                        setFetchError(null)
                        setIsLoading(true)
                        setSurveyOpen(false)
                      }}
                      className={`
                        flex items-center justify-between w-full px-2.5 py-2 text-[12px] rounded-lg text-left transition-colors cursor-pointer outline-none
                        ${isSelected
                          ? "bg-slate-100 text-slate-900 font-medium"
                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-medium"
                        }
                      `}
                    >
                      <span className="truncate pr-2" title={`${survey.title} (${survey.surveyId})`}>{survey.title} <span className="text-[10px] opacity-60 font-normal">({survey.surveyId})</span></span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-slate-700 flex-shrink-0" />}
                    </button>
                  )
                })}
                {surveys.length === 0 && (
                  <div className="px-2.5 py-2 text-[12px] text-slate-500 text-center">
                    No surveys available
                  </div>
                )}
              </PopoverContent>
            </Popover>
          </div>

          {selectedSurveyId && (isLoading || fetchError || demographics?.total_responses || filters.department !== "All Departments" || filters.batch !== "All Batches") ? (
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 lg:gap-6">
              <div className="hidden sm:block w-px h-6 bg-slate-200" />
              <DashboardFilters
                key={selectedSurveyId}
                disabled={isExporting}
                onFilterChange={(nextFilters) => {
                  if (isExporting) return
                  setIsLoading(true)
                  setFilters(nextFilters)
                  setRefreshKey(k => k + 1)
                }}
                availableBatches={availableBatches}
                availableDepartments={availableDepartments}
                availableDegrees={availableDegrees}
              />
              <div className="hidden sm:block w-px h-6 bg-slate-200" />
              <Button
                variant="ghost"
                onClick={handleExportDashboard}
                disabled={isExporting || isLoading || !demographics || demographics.total_responses === 0}
                className="hidden md:flex h-8 text-[13px] font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-100 px-3 items-center gap-2 transition-colors disabled:opacity-50"
              >
                {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4 opacity-70" />}
                <span>{isExporting ? "Exporting..." : "Export"}</span>
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      {/* Main Content Area */}
      {surveyError ? (
        <div role="alert" className="mt-8 flex flex-col items-center gap-4 py-24 text-center">
          <h3 className="text-xl font-semibold text-foreground">Unable to load surveys</h3>
          <Button onClick={() => setSurveyRefreshKey(key => key + 1)}>Retry</Button>
        </div>
      ) : isSurveyLoading ? (
        <AnalyticsSkeleton />
      ) : surveys.length === 0 ? (
        <div className="mt-8 py-24 text-center text-muted-foreground">No active surveys are available.</div>
      ) : !selectedSurveyId ? (
        <div className="mt-8 py-24 text-center text-muted-foreground">Select an active survey to view its dashboard.</div>
      ) : isLoading ? (
        <AnalyticsSkeleton filters={filters} />
      ) : fetchError ? (
        <div role="alert" className="mt-8 flex flex-col items-center justify-center gap-4 rounded-2xl border border-slate-300 bg-slate-50/50 px-6 py-24 text-center">
          <AlertTriangle className="size-8 text-amber-600" aria-hidden="true" />
          <h3 className="text-xl font-semibold text-slate-900">Unable to load analytics</h3>
          <p className="max-w-md text-slate-500">{fetchError}</p>
          <Button onClick={() => {
            setIsLoading(true)
            setRefreshKey(key => key + 1)
          }}>Retry</Button>
        </div>
      ) : (!demographics || demographics.total_responses === 0) ? (
        <div className="mt-8 flex flex-col items-center justify-center py-32 text-center border border-dashed border-slate-300 rounded-2xl bg-slate-50/50">
          <div className="w-16 h-16 bg-white rounded-2xl shadow-sm border border-slate-100 flex items-center justify-center mb-6">
            <Database className="w-8 h-8 text-slate-300" />
          </div>
          <h3 className="text-xl font-semibold text-slate-900 mb-2">No Analytics Data Found</h3>
          <p className="text-slate-500 max-w-md mb-6">
            {(filters.department !== "All Departments" || filters.batch !== "All Batches")
              ? "There are no survey responses matching the selected filters. Try adjusting your batch or department criteria."
              : "No PEII dashboard data is available for this survey yet. It may have no responses or lack the questions used by PEII."}
          </p>
        </div>
      ) : (
        <>
          {/* Sticky In-Page Navigation Bar */}
          <div className="sticky top-[60px] z-20 -mx-5 lg:-mx-8 px-5 lg:px-8 py-3 bg-[#fafafa]/90 backdrop-blur-md border-b border-slate-200/80 mb-8 transition-all">
            <DashboardNav />
          </div>

          {/* Main Analytics Content */}
          <div id="analytics-dashboard" className="flex flex-col gap-12 pb-16">

            {/* SECTION 1: OVERVIEW */}
            <section id="section-overview" className="scroll-mt-32">
              <ExportableSection id="export-section-overview" name="Overview Section" filters={filters} hideButton={isExporting}>
              <div className="mb-8 border-b border-slate-900 pb-2">
                <h3 className="text-xl font-bold tracking-tight text-slate-900 uppercase">Overview</h3>
              </div>
              <div className="flex flex-col gap-12 lg:gap-16">
                {/* Key Metrics (Full width, 4 columns) */}
                <div className="w-full">
                  <ExportableSection id="chart-metrics-ledger" name="Key Metrics" filters={filters} hideButton={isExporting}>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
                      {analyticsMetrics.map((stat) => {
                        const isDomain = stat.label === "Primary Driver" || stat.label === "Needs Attention"
                        const dimColor = isDomain && stat.value !== "N/A" ? getDimensionColor(stat.value) : null

                        return (
                          <div key={stat.label} className="flex flex-col">
                            <div className="mb-2">
                              <span
                                className={`text-[10px] font-bold uppercase tracking-[0.2em] ${dimColor ? 'border-l-2 pl-2' : ''} text-slate-500`}
                                style={dimColor ? { borderColor: dimColor.hex } : undefined}
                              >
                                {stat.label}
                              </span>
                            </div>
                            <div className={`font-light tracking-tighter text-slate-900 mb-1 leading-[1.1] break-words ${stat.value.length > 15 ? 'text-2xl' : 'text-4xl'}`}>
                              {stat.value}
                            </div>
                            <div className="mt-1 flex flex-col gap-0.5">
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
                        )
                      })}
                    </div>
                  </ExportableSection>
                </div>

                {/* Demographics (Full width, 4 columns) */}
                <div className="w-full">
                  <ExportableSection id="chart-demographics" name="Demographics" filters={filters} hideButton={isExporting}>
                    <ClientDemographicsOverview demographics={demographics} isLoading={isLoading} />
                  </ExportableSection>
                </div>
              </div>
              </ExportableSection>
            </section>

            {/* SECTION 2: PERFORMANCE */}
            <section id="section-performance" className="scroll-mt-32">
              <ExportableSection id="export-section-performance" name="Performance Section" filters={filters} hideButton={isExporting}>
              <div className="mb-8 border-b border-slate-900 pb-2">
                <h3 className="text-xl font-bold tracking-tight text-slate-900 uppercase">Performance</h3>
              </div>
              <div className="flex flex-col gap-16">
                {filters.batch === "All Batches" && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-12 pb-12 border-b border-slate-200">
                    <ExportableSection id="chart-historical-trend" name="Historical Trend" filters={filters} hideButton={isExporting}>
                      <ClientPEIIHistoricalTrendChart data={historicalTrend} isLoading={isLoading} />
                    </ExportableSection>

                    <ExportableSection id="chart-dimension-trend" name="Dimension Trend" filters={filters} hideButton={isExporting}>
                      <ClientPEIIDimensionsTrendChart data={historicalTrend} isLoading={isLoading} />
                    </ExportableSection>
                  </div>
                )}

                <div className="pb-4">
                  <ExportableSection id="chart-domain-gain" name="Domain Gain" filters={filters} hideButton={isExporting}>
                    <ClientDomainGainChart data={chartData} isLoading={isLoading} />
                  </ExportableSection>
                </div>
              </div>
              </ExportableSection>
            </section>

            {/* SECTION 3: EMPLOYMENT */}
            <section id="section-employment" className="scroll-mt-32">
              <ExportableSection id="export-section-employment" name="Employment Section" filters={filters} hideButton={isExporting}>
              <div className="mb-8 border-b border-slate-900 pb-2">
                <h3 className="text-xl font-bold tracking-tight text-slate-900 uppercase">Employment</h3>
              </div>

              <div className="flex flex-col gap-16">
                {/* Row 1: The Wide Charts (Income Distribution & Job Search Channels) */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 pb-12 border-b border-slate-200">
                  <div className="min-w-0 h-full flex flex-col">
                    <ExportableSection id="chart-income-distribution" name="Income Distribution" filters={filters} hideButton={isExporting}>
                      <ClientIncomeDistribution distribution={outcomes?.monthly_income ?? null} isLoading={isLoading} />
                    </ExportableSection>
                  </div>
                  <div className="lg:border-l lg:border-slate-200 lg:pl-16 min-w-0 h-full flex flex-col">
                    <ExportableSection id="chart-job-channels" name="Job Search Channels" filters={filters} hideButton={isExporting}>
                      <ClientJobChannels distribution={outcomes?.job_search_channel ?? null} isLoading={isLoading} />
                    </ExportableSection>
                  </div>
                </div>

                {/* Row 2: The Doughnut Charts (Velocity, Stability, Outcomes, Alignment) */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 lg:gap-10 pb-4">
                  <div className="min-w-0 h-full flex flex-col">
                    <ExportableSection id="chart-hiring-velocity" name="Hiring Velocity" filters={filters} hideButton={isExporting}>
                      <ClientHiringVelocity distribution={outcomes?.time_to_first_job ?? null} isLoading={isLoading} />
                    </ExportableSection>
                  </div>
                  <div className="md:border-l md:border-slate-200 md:pl-10 min-w-0 h-full flex flex-col">
                    <ExportableSection id="chart-employment-stability" name="Employment Stability" filters={filters} hideButton={isExporting}>
                      <ClientEmploymentStability
                        statusDistribution={outcomes?.employment_status ?? null}
                        typeDistribution={outcomes?.employment_type ?? null}
                        isLoading={isLoading}
                      />
                    </ExportableSection>
                  </div>
                  <div className="lg:border-l lg:border-slate-200 lg:pl-10 min-w-0 h-full flex flex-col">
                    <ExportableSection id="chart-key-outcomes" name="Key Outcomes" filters={filters} hideButton={isExporting}>
                      <ClientKeyOutcomes distribution={outcomes?.employment_stability ?? null} isLoading={isLoading} />
                    </ExportableSection>
                  </div>
                  <div className="md:border-l md:border-slate-200 md:pl-10 min-w-0 h-full flex flex-col">
                    <ExportableSection id="chart-degree-alignment" name="Degree Alignment" filters={filters} hideButton={isExporting}>
                      <ClientDegreeAlignment distribution={outcomes?.degree_alignment ?? null} isLoading={isLoading} />
                    </ExportableSection>
                  </div>
                </div>
              </div>
              </ExportableSection>
            </section>

            {/* SECTION 4: FEEDBACK */}
            <section id="section-feedback" className="scroll-mt-32">
              <ExportableSection id="export-section-feedback" name="Feedback Section" filters={filters} hideButton={isExporting}>
              <div className="mb-8 border-b border-slate-900 pb-2">
                <h3 className="text-xl font-bold tracking-tight text-slate-900 uppercase">Feedback</h3>
              </div>
              <div className="flex flex-col gap-16">
                <div className="pb-16 border-b border-slate-200">
                  <ExportableSection id="chart-feedback-sentiment" name="Feedback Sentiment" filters={filters} hideButton={isExporting}>
                    <ClientFeedbackClassificationChart data={classificationData} />
                  </ExportableSection>
                </div>
                <div className="pb-4">
                  <ExportableSection id="chart-curriculum-feedback" name="Curriculum Feedback" filters={filters} hideButton={isExporting}>
                    <ClientCurriculumFeedback
                      surveyId={selectedSurveyId}
                      feedbacks={qualitativeFeedback}
                      qualitativeFeedbackTotal={qualitativeFeedbackTotal}
                      qualitativeFeedbackTruncated={qualitativeFeedbackTruncated}
                      qualitativeFeedbackPlaceholderCount={qualitativeFeedbackPlaceholderCount}
                      isLoading={isLoading}
                      onRefresh={() => { if (!isExporting) setRefreshKey(k => k + 1) }}
                    />
                  </ExportableSection>
                </div>
              </div>
              </ExportableSection>
            </section>
          </div>
        </>
      )}

      </div>
  )
}
