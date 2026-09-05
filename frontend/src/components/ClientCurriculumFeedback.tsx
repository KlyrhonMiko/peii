"use client"

import { useState, useMemo, useRef, useCallback } from "react"
import { ThumbsDown, ThumbsUp, Minus, Flag } from "lucide-react"
import { type QualitativeFeedback, markFalsePositive } from "@/lib/surveys"
import { getDimensionColor } from "@/lib/dimension-colors"

export interface ClientCurriculumFeedbackProps {
  surveyId: string | null
  feedbacks: QualitativeFeedback[]
  isLoading?: boolean
  onRefresh?: () => void
}

function SentimentBadge({ score }: { score: number }) {
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

export function ClientCurriculumFeedback({ surveyId, feedbacks, isLoading, onRefresh }: ClientCurriculumFeedbackProps) {
  const [markedIds, setMarkedIds] = useState<Set<string>>(new Set())
  // Track local polarity overrides: key = 'responseId-questionId', value = override polarity number
  const [polarityOverrides, setPolarityOverrides] = useState<Record<string, number>>({})
  const [selectedDimension, setSelectedDimension] = useState<string | null>(null)
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
    if (!feedbacks) return []
    const dims = new Set<string>()
    feedbacks.forEach(f => {
      if (f.dimension) dims.add(f.dimension)
    })
    return Array.from(dims).sort()
  }, [feedbacks])

  const filteredFeedbacks = useMemo(() => {
    if (!feedbacks) return []
    return feedbacks
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
      .sort((a, b) => (a.sentiment_score ?? 0) - (b.sentiment_score ?? 0))
  }, [feedbacks, markedIds, polarityOverrides, selectedDimension])

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
          <h3 className="font-semibold text-slate-900 flex items-center gap-2">
            Curriculum & Improvement Feedback
            {!isLoading && filteredFeedbacks.length > 0 && (
              <span className="text-xs font-normal text-slate-400">
                ({filteredFeedbacks.length})
              </span>
            )}
          </h3>
          <p className="text-sm text-slate-500 mt-1">
            Ranked by critical sentiment (Needs Attention)
          </p>
        </div>

        {!isLoading && dimensions.length > 0 && (
          <div className="flex items-center gap-6 border-b border-slate-200 pb-0 overflow-x-auto no-scrollbar">
            <button
              onClick={() => setSelectedDimension(null)}
              className={`pb-3 text-xs font-medium border-b-2 transition-all whitespace-nowrap ${
                selectedDimension === null 
                  ? "border-slate-900 text-slate-900 font-semibold" 
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              All Feedback
            </button>
            {dimensions.map(dim => {
              const isSelected = selectedDimension === dim
              const dimColor = getDimensionColor(dim)
              const shortName = (dim.split(" and ")[0] ?? dim).replace(/Government.*/, "Govt Trust")
              
              return (
                <button
                  key={dim}
                  onClick={() => setSelectedDimension(dim)}
                  className={`pb-3 text-xs font-medium border-b-2 transition-all whitespace-nowrap flex items-center gap-2 ${
                    isSelected 
                      ? "text-slate-900 font-semibold" 
                      : "border-transparent text-slate-500 hover:text-slate-800"
                  }`}
                  style={{
                    borderBottomColor: isSelected ? dimColor.hex : "transparent"
                  }}
                  title={dim}
                >
                  <span 
                    className="w-2 h-1 rounded-[1px] shrink-0" 
                    style={{ backgroundColor: dimColor.hex }} 
                  />
                  {shortName}
                </button>
              )
            })}
          </div>
        )}
      </div>

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
            {filteredFeedbacks.map((f, i) => {
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

                      {/* Negative: offer false positive */}
                      {score < -0.3 && (
                        <>
                          <span className="h-2.5 w-px bg-slate-200" />
                          <button
                            onClick={() => handleMarkFalsePositive(f.response_id, f.question_id)}
                            className="flex items-center gap-1 text-[10px] font-medium tracking-wide uppercase text-slate-400 hover:text-slate-700 transition-colors"
                            title="Mark as incorrectly negative"
                          >
                            <Flag className="w-2.5 h-2.5" />
                            False positive
                          </button>
                        </>
                      )}

                      {/* Positive: offer false positive (mark as wrongly positive) */}
                      {score > 0.3 && (
                        <>
                          <span className="h-2.5 w-px bg-slate-200" />
                          <button
                            onClick={() => handleMarkFalsePositive(f.response_id, f.question_id, -0.5)}
                            className="flex items-center gap-1 text-[10px] font-medium tracking-wide uppercase text-slate-400 hover:text-rose-600 transition-colors"
                            title="Mark as incorrectly positive"
                          >
                            <Flag className="w-2.5 h-2.5" />
                            False positive
                          </button>
                        </>
                      )}

                      {/* Neutral: let user manually classify */}
                      {score >= -0.3 && score <= 0.3 && (
                        <>
                          <span className="h-2.5 w-px bg-slate-200" />
                          <span className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleMarkFalsePositive(f.response_id, f.question_id, 0.5)}
                              className="flex items-center gap-1 text-[10px] font-medium text-slate-400 hover:text-emerald-600 transition-colors"
                              title="Mark as positive"
                            >
                              <ThumbsUp className="w-2.5 h-2.5" />
                            </button>
                            <button
                              onClick={() => handleMarkFalsePositive(f.response_id, f.question_id, -0.5)}
                              className="flex items-center gap-1 text-[10px] font-medium text-slate-400 hover:text-rose-600 transition-colors"
                              title="Mark as negative"
                            >
                              <ThumbsDown className="w-2.5 h-2.5" />
                            </button>
                          </span>
                        </>
                      )}
                    </div>
                    <SentimentBadge score={score} />
                  </div>
                  <p className="text-xl font-light tracking-tight text-slate-900 leading-snug">
                    &ldquo;{f.response_text}&rdquo;
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
