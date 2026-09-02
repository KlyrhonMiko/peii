"use client"

import { useState, useMemo, useRef, useCallback } from "react"
import { ThumbsDown, ThumbsUp, Minus, Flag } from "lucide-react"
import { type QualitativeFeedback, markFalsePositive } from "@/lib/surveys"

export interface ClientCurriculumFeedbackProps {
  surveyId: string | null
  feedbacks: QualitativeFeedback[]
  isLoading?: boolean
  onRefresh?: () => void
}

function SentimentBadge({ score }: { score: number }) {
  if (score > 0.3) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-700">
        <ThumbsUp className="w-3 h-3" /> Positive
      </span>
    )
  }
  if (score < -0.3) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-rose-100 text-rose-700">
        <ThumbsDown className="w-3 h-3" /> Critical
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-700">
      <Minus className="w-3 h-3" /> Neutral
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
          return { ...f, sentiment_score: Math.abs(f.sentiment_score) || 0.5, is_false_positive: true }
        }
        return f
      })
      .sort((a, b) => a.sentiment_score - b.sentiment_score)
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
      <div className="mb-6 flex flex-col gap-4">
        <div>
          <h3 className="font-semibold text-slate-900 flex items-center gap-2">
            Curriculum & Improvement Feedback
            {!isLoading && filteredFeedbacks.length > 0 && (
              <span className="ml-1.5 px-2 py-0.5 rounded-full bg-slate-100 text-[11px] font-medium text-slate-600">
                {filteredFeedbacks.length}
              </span>
            )}
          </h3>
          <p className="text-sm text-slate-500 mt-1">
            Ranked by critical sentiment (Needs Attention)
          </p>
        </div>

        {!isLoading && dimensions.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-2 px-2 no-scrollbar">
            <button
              onClick={() => setSelectedDimension(null)}
              className={`whitespace-nowrap px-3 py-1.5 rounded-full text-[11px] font-medium transition-colors ${
                selectedDimension === null 
                  ? "bg-slate-900 text-white shadow-sm" 
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              All Categories
            </button>
            {dimensions.map(dim => {
              const isSelected = selectedDimension === dim
              // Shorten names for pills to save space
              let shortName = dim.split(" and ")[0]
              if (shortName.includes("Government")) shortName = "Govt Trust"
              
              return (
                <button
                  key={dim}
                  onClick={() => setSelectedDimension(dim)}
                  className={`whitespace-nowrap px-3 py-1.5 rounded-full text-[11px] font-medium transition-colors ${
                    isSelected 
                      ? "bg-slate-900 text-white shadow-sm" 
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                  title={dim}
                >
                  {shortName}
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="flex-1 min-h-[300px] max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
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
            {filteredFeedbacks.map((f, i) => (
              <div key={i} className="py-6 border-b border-slate-200 last:border-0">
                <div className="flex justify-between items-start mb-3 gap-4">
                  <div className="text-[10px] font-bold tracking-[0.2em] text-slate-500 uppercase flex items-center gap-3">
                    {f.dimension ? f.dimension.split(" and ")[0] : "General"}

                    {/* Negative: offer false positive */}
                    {f.sentiment_score < -0.3 && (
                      <button
                        onClick={() => handleMarkFalsePositive(f.response_id, f.question_id)}
                        className="flex items-center gap-1.5 text-[10px] font-medium tracking-normal normal-case text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all duration-200 ease-out active:scale-95 px-2 py-1 rounded-md -my-1"
                        title="Mark as incorrectly negative"
                      >
                        <Flag className="w-3 h-3" />
                        False positive
                      </button>
                    )}

                    {/* Positive: offer false positive (mark as wrongly positive) */}
                    {f.sentiment_score > 0.3 && (
                      <button
                        onClick={() => handleMarkFalsePositive(f.response_id, f.question_id, -0.5)}
                        className="flex items-center gap-1.5 text-[10px] font-medium tracking-normal normal-case text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all duration-200 ease-out active:scale-95 px-2 py-1 rounded-md -my-1"
                        title="Mark as incorrectly positive"
                      >
                        <Flag className="w-3 h-3" />
                        False positive
                      </button>
                    )}

                    {/* Neutral: let user manually classify */}
                    {f.sentiment_score >= -0.3 && f.sentiment_score <= 0.3 && (
                      <span className="flex items-center gap-1 -my-1">
                        <button
                          onClick={() => handleMarkFalsePositive(f.response_id, f.question_id, 0.5)}
                          className="flex items-center gap-1 text-[10px] font-medium tracking-normal normal-case text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-all duration-200 ease-out active:scale-95 px-2 py-1 rounded-md"
                          title="Mark as positive"
                        >
                          <ThumbsUp className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => handleMarkFalsePositive(f.response_id, f.question_id, -0.5)}
                          className="flex items-center gap-1 text-[10px] font-medium tracking-normal normal-case text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all duration-200 ease-out active:scale-95 px-2 py-1 rounded-md"
                          title="Mark as negative"
                        >
                          <ThumbsDown className="w-3 h-3" />
                        </button>
                      </span>
                    )}
                  </div>
                  <SentimentBadge score={f.sentiment_score} />
                </div>
                <p className="text-xl font-light tracking-tight text-slate-900 leading-snug">
                  "{f.response_text}"
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
