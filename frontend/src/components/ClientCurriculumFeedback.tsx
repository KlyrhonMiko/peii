"use client"

import { useState, useMemo, useRef, useCallback } from "react"
import { ThumbsDown, ThumbsUp, Minus, ChevronDown } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { type QualitativeFeedback, markFalsePositive } from "@/lib/surveys"
import { getDimensionColor } from "@/lib/dimension-colors"

export interface ClientCurriculumFeedbackProps {
  surveyId: string | null
  feedbacks: QualitativeFeedback[]
  qualitativeFeedbackTotal: number
  qualitativeFeedbackTruncated: boolean
  qualitativeFeedbackPlaceholderCount?: number
  isLoading?: boolean
  onRefresh?: () => void
}

function SentimentBadge({ score, isPlaceholder }: { score: number; isPlaceholder?: boolean }) {
  if (isPlaceholder) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200/60">
        <Minus className="w-3.5 h-3.5" /> Placeholder
      </span>
    )
  }
  if (score > 0.3) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
        <ThumbsUp className="w-3.5 h-3.5" /> Positive
      </span>
    )
  }
  if (score < -0.3) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-600">
        <ThumbsDown className="w-3.5 h-3.5" /> Needs Attention
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400">
      <Minus className="w-3.5 h-3.5" /> Neutral
    </span>
  )
}

export function ClientCurriculumFeedback({
  surveyId,
  feedbacks,
  qualitativeFeedbackTotal,
  qualitativeFeedbackTruncated: _qualitativeFeedbackTruncated,
  qualitativeFeedbackPlaceholderCount,
  isLoading,
  onRefresh,
}: ClientCurriculumFeedbackProps) {
  const [markedIds, setMarkedIds] = useState<Set<string>>(new Set())
  // Track local polarity overrides: key = 'responseId-questionId', value = override polarity number
  const [polarityOverrides, setPolarityOverrides] = useState<Record<string, number>>({})
  const [selectedDimension, setSelectedDimension] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<string>("all")
  const [displayLimit, setDisplayLimit] = useState<number>(30)
  const [sentimentSort, setSentimentSort] = useState<"negative" | "positive" | "neutral">("negative")
  const [isPopoverOpen, setIsPopoverOpen] = useState(false)
  const [isSortPopoverOpen, setIsSortPopoverOpen] = useState(false)
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Separate substantive vs placeholder feedbacks
  const { substantiveFeedbacks, placeholderFeedbacks } = useMemo(() => {
    if (!feedbacks) return { substantiveFeedbacks: [], placeholderFeedbacks: [] }
    const substantive: QualitativeFeedback[] = []
    const placeholders: QualitativeFeedback[] = []
    feedbacks.forEach(f => {
      if (f.is_placeholder) {
        placeholders.push(f)
      } else {
        substantive.push(f)
      }
    })
    return { substantiveFeedbacks: substantive, placeholderFeedbacks: placeholders }
  }, [feedbacks])

  // Debounced refresh: waits 2s after the LAST flag click before hitting the backend
  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current)
    }
    refreshTimerRef.current = setTimeout(() => {
      onRefresh?.()
      refreshTimerRef.current = null
    }, 2000)
  }, [onRefresh])

  const dimensions = useMemo(() => {
    if (!substantiveFeedbacks.length) return []
    const dims = new Set<string>()
    substantiveFeedbacks.forEach(f => {
      if (f.dimension) dims.add(f.dimension)
    })
    return Array.from(dims).sort()
  }, [substantiveFeedbacks])

  const filteredFeedbacks = useMemo(() => {
    if (!feedbacks) return []
    
    // If viewing placeholders tab
    if (activeTab === "placeholders") {
      return placeholderFeedbacks
    }

    // Otherwise view substantive feedbacks, optionally filtered by dimension
    const targetSet = substantiveFeedbacks.length > 0 ? substantiveFeedbacks : feedbacks
    return targetSet
      .filter(f => selectedDimension ? f.dimension === selectedDimension : true)
      .map(f => {
        const key = `${f.response_id}-${f.question_id}`
        // Local polarity override (e.g. neutral → positive/negative) takes precedence
        if (key in polarityOverrides) {
          return { ...f, sentiment_score: polarityOverrides[key], is_false_positive: true }
        }
        // Classic false-positive flip
        if (markedIds.has(key)) {
          return { ...f, sentiment_score: Math.abs(f.sentiment_score ?? 0) || 0.5, is_false_positive: true }
        }
        return f
      })
      .sort((a, b) => {
        const scoreA = a.sentiment_score ?? 0
        const scoreB = b.sentiment_score ?? 0
        if (sentimentSort === "negative") return scoreA - scoreB
        if (sentimentSort === "positive") return scoreB - scoreA
        if (sentimentSort === "neutral") return Math.abs(scoreA) - Math.abs(scoreB)
        return scoreA - scoreB
      })
  }, [feedbacks, substantiveFeedbacks, placeholderFeedbacks, activeTab, markedIds, polarityOverrides, selectedDimension, sentimentSort])

  const displayedFeedbackCount = Math.min(filteredFeedbacks.length, displayLimit)
  const retainedFeedbackCount = activeTab === "placeholders" ? placeholderFeedbacks.length : substantiveFeedbacks.length
  const placeholderCount = qualitativeFeedbackPlaceholderCount ?? placeholderFeedbacks.length

  const handleMarkFalsePositive = useCallback((responseId: string, questionId: string, polarityOverride?: number) => {
    const key = `${responseId}-${questionId}`
    // Optimistically update UI immediately
    if (polarityOverride !== undefined) {
      setPolarityOverrides(prev => ({ ...prev, [key]: polarityOverride }))
    } else {
      setMarkedIds(prev => {
        const next = new Set(prev)
        next.add(key)
        return next
      })
    }

    // Fire-and-forget the save — don't block the UI or trigger concurrent refreshes
    if (surveyId) {
      markFalsePositive(surveyId, responseId, questionId, polarityOverride)
        .then(() => scheduleRefresh())
        .catch(err => console.error("Failed to mark false positive", err))
    }
  }, [surveyId, scheduleRefresh])

  return (
    <div className="h-full flex flex-col">
      <div className="mb-8 flex flex-col gap-6">
        <div>
          <h3 className="text-2xl font-bold tracking-tight text-slate-900 flex items-baseline gap-3">
            Curriculum & Improvement Feedback
            {!isLoading && substantiveFeedbacks.length > 0 && (
              <span className="text-sm font-normal text-slate-400">
                {substantiveFeedbacks.length} entries
              </span>
            )}
          </h3>
          <p className="text-sm text-slate-500 mt-1 max-w-3xl">
            {qualitativeFeedbackTotal > 0
              ? `Showing ${displayedFeedbackCount} of the newest ${retainedFeedbackCount} feedback entries. Note: Placeholder and noise comments (e.g., "asdad", "N/A", "none") are not counted in sentiment metrics.`
              : "No actionable feedback available"}
          </p>
        </div>

        {!isLoading && (dimensions.length > 0 || placeholderFeedbacks.length > 0) && (
          <div className="flex flex-wrap items-center gap-8 border-b border-slate-200 pb-4">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-slate-500">Filter category:</span>
              <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
                <PopoverTrigger
                  render={<button type="button" className="flex items-center gap-2 text-sm font-medium border border-slate-200 rounded-md px-3 py-1.5 bg-white text-slate-900 hover:bg-slate-50 transition-colors shadow-sm max-w-[280px] sm:max-w-xs" />}
                >
                  <span className="truncate">
                    {activeTab === "all" ? "All Feedback" : activeTab === "placeholders" ? "Placeholders" : selectedDimension}
                  </span>
                  <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                </PopoverTrigger>
              <PopoverContent className="w-[300px] p-2" align="start">
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => {
                      setActiveTab("all")
                      setSelectedDimension(null)
                      setDisplayLimit(30)
                      setIsPopoverOpen(false)
                    }}
                    className={`flex items-center justify-between px-3 py-2 text-sm rounded-md transition-colors ${
                      activeTab === "all" ? "bg-slate-100 font-medium text-slate-900" : "hover:bg-slate-50 text-slate-700"
                    }`}
                  >
                    <span>All Feedback</span>
                    <span className="text-xs bg-slate-200/60 text-slate-600 px-1.5 py-0.5 rounded-full shrink-0">
                      {substantiveFeedbacks.length}
                    </span>
                  </button>

                  {dimensions.length > 0 && <div className="h-px bg-slate-100 my-1 mx-2" />}

                  {dimensions.map(dim => {
                    const isSelected = activeTab !== "placeholders" && selectedDimension === dim
                    const dimColor = getDimensionColor(dim)
                    const shortName = (dim.split(" and ")[0] ?? dim).replace(/Government.*/, "Govt Trust")
                    const countInDim = substantiveFeedbacks.filter(f => f.dimension === dim).length
                    
                    return (
                      <button
                        key={dim}
                        onClick={() => {
                          setActiveTab("dimension")
                          setSelectedDimension(dim)
                          setDisplayLimit(30)
                          setIsPopoverOpen(false)
                        }}
                        className={`flex items-center justify-between px-3 py-2 text-sm rounded-md transition-colors ${
                          isSelected ? "bg-slate-100 font-medium text-slate-900" : "hover:bg-slate-50 text-slate-700"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 truncate pr-3">
                          <span 
                            className="w-2 h-2 rounded-full shrink-0" 
                            style={{ backgroundColor: dimColor.hex }} 
                          />
                          <span className="truncate">{shortName}</span>
                        </div>
                        <span className="text-xs bg-slate-200/60 text-slate-600 px-1.5 py-0.5 rounded-full shrink-0">
                          {countInDim}
                        </span>
                      </button>
                    )
                  })}

                  {(placeholderCount > 0 || placeholderFeedbacks.length > 0) && (
                    <>
                      <div className="h-px bg-slate-100 my-1 mx-2" />
                      <button
                        onClick={() => {
                          setActiveTab("placeholders")
                          setSelectedDimension(null)
                          setDisplayLimit(30)
                          setIsPopoverOpen(false)
                        }}
                        className={`flex items-center justify-between px-3 py-2 text-sm rounded-md transition-colors ${
                          activeTab === "placeholders"
                            ? "bg-amber-100 font-medium text-amber-900"
                            : "hover:bg-amber-50 text-amber-700"
                        }`}
                        title="View non-substantive entries (e.g. 'None', 'N/A', '.') excluded from sentiment analysis"
                      >
                        <div className="flex items-center gap-2.5 truncate pr-3">
                          <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                          <span className="truncate">Placeholders</span>
                        </div>
                        <span className="text-xs bg-amber-200/50 text-amber-800 border border-amber-200/50 px-1.5 py-0.5 rounded-full shrink-0">
                          {placeholderCount}
                        </span>
                      </button>
                    </>
                  )}
                </div>
              </PopoverContent>
              </Popover>
            </div>

            {/* Sort Selector */}
            {activeTab !== "placeholders" && (
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-sm text-slate-500 font-medium">Sort by:</span>
                <Popover open={isSortPopoverOpen} onOpenChange={setIsSortPopoverOpen}>
                  <PopoverTrigger
                    render={<button type="button" className="flex items-center gap-2 text-sm font-medium border border-slate-200 rounded-md px-3 py-1.5 bg-white text-slate-900 hover:bg-slate-50 transition-colors shadow-sm w-40 justify-between" />}
                  >
                    <span className="truncate">
                      {sentimentSort === "negative" ? "Negative First" : sentimentSort === "positive" ? "Positive First" : "Neutral First"}
                    </span>
                    <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                  </PopoverTrigger>
                  <PopoverContent className="w-40 p-1.5" align="end">
                    <div className="flex flex-col gap-0.5">
                      <button
                        onClick={() => {
                          setSentimentSort("negative")
                          setDisplayLimit(30)
                          setIsSortPopoverOpen(false)
                        }}
                        className={`text-left px-2 py-1.5 text-sm rounded-md transition-colors ${
                          sentimentSort === "negative" ? "bg-slate-100 font-medium text-slate-900" : "hover:bg-slate-50 text-slate-700"
                        }`}
                      >
                        Negative First
                      </button>
                      <button
                        onClick={() => {
                          setSentimentSort("positive")
                          setDisplayLimit(30)
                          setIsSortPopoverOpen(false)
                        }}
                        className={`text-left px-2 py-1.5 text-sm rounded-md transition-colors ${
                          sentimentSort === "positive" ? "bg-slate-100 font-medium text-slate-900" : "hover:bg-slate-50 text-slate-700"
                        }`}
                      >
                        Positive First
                      </button>
                      <button
                        onClick={() => {
                          setSentimentSort("neutral")
                          setDisplayLimit(30)
                          setIsSortPopoverOpen(false)
                        }}
                        className={`text-left px-2 py-1.5 text-sm rounded-md transition-colors ${
                          sentimentSort === "neutral" ? "bg-slate-100 font-medium text-slate-900" : "hover:bg-slate-50 text-slate-700"
                        }`}
                      >
                        Neutral First
                      </button>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Placeholders Banner Callout when in Placeholders tab */}
      {activeTab === "placeholders" && (
        <div className="mb-6 p-4 rounded-lg bg-amber-50/70 border border-amber-200/70 text-xs text-amber-900 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold flex items-center gap-2 text-amber-950">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              Non-Substantive / Placeholder Responses ({placeholderFeedbacks.length} entries)
            </span>
            <span className="text-[11px] font-medium bg-amber-100/80 text-amber-800 px-2 py-0.5 rounded">
              Excluded from sentiment metrics
            </span>
          </div>
          <p className="text-amber-800 leading-relaxed">
            These entries represent blank, noise, or short placeholder answers (such as &ldquo;None&rdquo;, &ldquo;N/A&rdquo;, &ldquo;.&rdquo;) submitted by respondents. They have been isolated here to keep the sentiment ratio bars accurate and ensure qualitative feedback cards focus strictly on actionable student insights.
          </p>
          <div className="flex flex-wrap items-center gap-4 pt-2 font-mono text-[11px] text-amber-900 border-t border-amber-200/50">
            <span>&ldquo;None&rdquo;: <strong>{placeholderFeedbacks.filter(f => /^none$/i.test(f.response_text.trim())).length}</strong></span>
            <span>&ldquo;.&rdquo;: <strong>{placeholderFeedbacks.filter(f => f.response_text.trim() === '.').length}</strong></span>
            <span>&ldquo;N/A&rdquo;: <strong>{placeholderFeedbacks.filter(f => /^n\/?a$/i.test(f.response_text.trim())).length}</strong></span>
            <span>Other short/noise: <strong>{placeholderFeedbacks.filter(f => !/^none$|^\.$|^n\/?a$/i.test(f.response_text.trim())).length}</strong></span>
          </div>
        </div>
      )}

      <div className="flex-1 min-h-[300px] max-h-[440px] overflow-y-auto pr-2 custom-scrollbar">
        {isLoading ? (
          <div className="w-full h-full flex flex-col space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="animate-pulse bg-slate-50 p-4 rounded-lg border border-slate-100">
                <div className="h-3 bg-slate-200 rounded w-1/4 mb-2"></div>
                <div className="h-4 bg-slate-200 rounded w-full mb-1"></div>
                <div className="h-4 bg-slate-200 rounded w-5/6"></div>
              </div>
            ))}
          </div>
        ) : filteredFeedbacks.length === 0 ? (
          <div className="w-full h-full flex items-center justify-center text-slate-400 text-sm">
            No qualitative feedback available
          </div>
        ) : (
          <div className="space-y-0">
            {filteredFeedbacks.slice(0, displayedFeedbackCount).map((f, i) => {
              const score = f.sentiment_score ?? 0
              return (
                <div key={i} className="py-6 border-b border-slate-200 last:border-0">
                  <div className="flex justify-between items-center mb-3 gap-4">
                    <div className="flex items-center gap-3">
                      {f.dimension ? (
                        <div 
                          className="border-l-2 pl-2 flex items-center"
                          style={{ borderColor: getDimensionColor(f.dimension).hex }}
                        >
                          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-600">
                            {f.dimension.split(" and ")[0] ?? f.dimension}
                          </span>
                        </div>
                      ) : (
                        <span className="border-l-2 border-slate-300 pl-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                          General
                        </span>
                      )}

                      {/* Negative: offer overrides */}
                      {score < -0.3 && (
                        <>
                          <span className="h-2.5 w-px bg-slate-200" />
                          <button
                            onClick={() => handleMarkFalsePositive(f.response_id, f.question_id)}
                            className="flex items-center gap-1 text-[10px] font-medium tracking-wide uppercase text-slate-400 hover:text-emerald-600 transition-colors"
                            title="Mark as positive"
                          >
                            <ThumbsUp className="w-2.5 h-2.5" />
                            Mark as positive
                          </button>
                          <span className="h-2.5 w-px bg-slate-200" />
                          <button
                            onClick={() => handleMarkFalsePositive(f.response_id, f.question_id, 0)}
                            className="flex items-center gap-1 text-[10px] font-medium tracking-wide uppercase text-slate-400 hover:text-slate-600 transition-colors"
                            title="Mark as neutral"
                          >
                            <Minus className="w-2.5 h-2.5" />
                            Mark as neutral
                          </button>
                        </>
                      )}

                      {/* Positive: offer overrides */}
                      {score > 0.3 && (
                        <>
                          <span className="h-2.5 w-px bg-slate-200" />
                          <button
                            onClick={() => handleMarkFalsePositive(f.response_id, f.question_id, -0.5)}
                            className="flex items-center gap-1 text-[10px] font-medium tracking-wide uppercase text-slate-400 hover:text-rose-600 transition-colors"
                            title="Mark as negative"
                          >
                            <ThumbsDown className="w-2.5 h-2.5" />
                            Mark as negative
                          </button>
                          <span className="h-2.5 w-px bg-slate-200" />
                          <button
                            onClick={() => handleMarkFalsePositive(f.response_id, f.question_id, 0)}
                            className="flex items-center gap-1 text-[10px] font-medium tracking-wide uppercase text-slate-400 hover:text-slate-600 transition-colors"
                            title="Mark as neutral"
                          >
                            <Minus className="w-2.5 h-2.5" />
                            Mark as neutral
                          </button>
                        </>
                      )}

                      {/* Neutral: let user manually classify */}
                      {score >= -0.3 && score <= 0.3 && (
                        <>
                          <span className="h-2.5 w-px bg-slate-200" />
                          <button
                            onClick={() => handleMarkFalsePositive(f.response_id, f.question_id, 0.5)}
                            className="flex items-center gap-1 text-[10px] font-medium tracking-wide uppercase text-slate-400 hover:text-emerald-600 transition-colors"
                            title="Mark as positive"
                          >
                            <ThumbsUp className="w-2.5 h-2.5" />
                            Mark as positive
                          </button>
                          <span className="h-2.5 w-px bg-slate-200" />
                          <button
                            onClick={() => handleMarkFalsePositive(f.response_id, f.question_id, -0.5)}
                            className="flex items-center gap-1 text-[10px] font-medium tracking-wide uppercase text-slate-400 hover:text-rose-600 transition-colors"
                            title="Mark as negative"
                          >
                            <ThumbsDown className="w-2.5 h-2.5" />
                            Mark as negative
                          </button>
                        </>
                      )}
                    </div>
                    <SentimentBadge score={score} />
                  </div>
                  <div className="flex flex-col gap-3">
                    <p className="text-[13px] font-medium text-slate-500 bg-slate-50 rounded-md px-3 py-2 border border-slate-100">
                      <span className="font-semibold text-slate-400 mr-2">Q.</span>
                      {f.question_text}
                    </p>
                    <p className="text-xl font-light tracking-tight text-slate-900 leading-snug pl-1">
                      &ldquo;{f.response_text}&rdquo;
                    </p>
                  </div>
                </div>
              )
            })}
            
            {filteredFeedbacks.length > displayedFeedbackCount && (
              <div className="py-8 text-center border-t border-slate-200 flex flex-col items-center gap-3">
                <span className="text-xs font-medium text-slate-400 uppercase tracking-widest">
                  Showing {displayedFeedbackCount} of {filteredFeedbacks.length} retained feedback entries
                </span>
                <button
                  onClick={() => setDisplayLimit(prev => prev + 30)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors"
                >
                  Load More
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
