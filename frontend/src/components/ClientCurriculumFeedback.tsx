"use client"

import { useState, useMemo } from "react"
import { MessageSquare, ThumbsDown, ThumbsUp, Minus, Flag } from "lucide-react"
import { type QualitativeFeedback, markFalsePositive } from "@/lib/surveys"

export interface ClientCurriculumFeedbackProps {
  surveyId: string | null
  feedbacks: QualitativeFeedback[]
  isLoading?: boolean
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

export function ClientCurriculumFeedback({ surveyId, feedbacks, isLoading }: ClientCurriculumFeedbackProps) {
  const [markedIds, setMarkedIds] = useState<Set<string>>(new Set())
  const [selectedDimension, setSelectedDimension] = useState<string | null>(null)

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
    // We filter for the two main actionable text questions
    return feedbacks.filter(f => 
      !f.is_false_positive &&
      !markedIds.has(`${f.response_id}-${f.question_id}`) &&
      (selectedDimension ? f.dimension === selectedDimension : true)
    )
  }, [feedbacks, markedIds, selectedDimension])

  const handleMarkFalsePositive = async (responseId: string, questionId: string) => {
    setMarkedIds(prev => {
      const next = new Set(prev)
      next.add(`${responseId}-${questionId}`)
      return next
    })
    if (surveyId) {
      try {
        await markFalsePositive(surveyId, responseId, questionId)
      } catch (error) {
        console.error("Failed to mark false positive", error)
      }
    }
  }

  return (
    <div className="h-full flex flex-col">
      <div className="mb-6 flex flex-col gap-4">
        <div>
          <h3 className="font-semibold text-slate-900 flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-emerald-500" />
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
                    {f.sentiment_score < -0.3 && (
                      <button 
                        onClick={() => handleMarkFalsePositive(f.response_id, f.question_id)}
                        className="flex items-center gap-1.5 text-[10px] font-medium tracking-normal normal-case text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all duration-200 ease-out active:scale-95 px-2 py-1 rounded-md -my-1"
                        title="Mark as false positive to improve model"
                      >
                        <Flag className="w-3 h-3" />
                        False positive
                      </button>
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
