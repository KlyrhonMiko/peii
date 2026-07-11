"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import {
  ClipboardList,
  Circle,
  ListChecks,
  Type,
  Hash,
  Star,
  ArrowUpDown,
  Table,
  Calendar,
  Upload,
  ToggleLeft,
  ArrowLeft,
  ArrowRight,
} from "lucide-react"
import type { Survey, SurveyQuestion } from "@/lib/surveys"

const TYPE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  single_choice: Circle,
  multiple_choice: ListChecks,
  text: Type,
  number: Hash,
  scale: Star,
  ranking: ArrowUpDown,
  matrix: Table,
  datetime: Calendar,
  file: Upload,
  boolean: ToggleLeft,
}

const TYPE_LABEL: Record<string, string> = {
  single_choice: "Single Choice",
  multiple_choice: "Multiple Choice",
  text: "Text",
  number: "Number",
  scale: "Scale",
  ranking: "Ranking",
  matrix: "Matrix",
  datetime: "Date/Time",
  file: "File Upload",
  boolean: "Yes/No",
}

interface SurveyPreviewProps {
  survey: Survey
  open: boolean
  onClose: () => void
}

function renderQuestion(q: SurveyQuestion, idx: number) {
  return (
    <div key={q.id || idx} className="rounded-xl bg-white px-6 py-5 shadow-sm ring-1 ring-black/[0.04]">
      <div className="mb-1 flex items-center gap-2">
        {(() => {
          const Icon = TYPE_ICON[q.type] ?? Type
          return <Icon className="size-4 text-indigo-500" />
        })()}
        <span className="text-[11px] font-medium uppercase tracking-wider text-indigo-500">
          {TYPE_LABEL[q.type] ?? q.type}
        </span>
      </div>
      <p className="mb-3 text-sm font-medium text-slate-800">
        {q.text || "Untitled Question"}
      </p>

      {q.type === "single_choice" && (
        <div className="space-y-2">
          {(q.options ?? []).map((opt, optIdx) => (
            <div key={optIdx} className="flex cursor-default items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm text-slate-500">
              <div className="flex size-4 items-center justify-center rounded-full border-2 border-slate-300">
                <div className="size-2 rounded-full bg-transparent" />
              </div>
              {opt || `Option ${optIdx + 1}`}
            </div>
          ))}
        </div>
      )}

      {q.type === "multiple_choice" && (
        <div className="space-y-2">
          {(q.options ?? []).map((opt, optIdx) => (
            <div key={optIdx} className="flex cursor-default items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm text-slate-500">
              <div className="flex size-4 items-center justify-center rounded border-2 border-slate-300">
                <div className="size-2 rounded-sm bg-transparent" />
              </div>
              {opt || `Option ${optIdx + 1}`}
            </div>
          ))}
        </div>
      )}

      {q.type === "text" && (
        <div className="h-20 rounded-lg border border-slate-200 bg-slate-50/50 p-3 text-sm text-slate-400">
          Type your response here...
        </div>
      )}

      {q.type === "number" && (
        <div className="flex h-9 w-32 items-center rounded-lg border border-slate-200 bg-slate-50/50 px-3 text-sm text-slate-400">
          0
        </div>
      )}

      {q.type === "scale" && (() => {
        const min = (q.config?.min as number) ?? 1
        const max = (q.config?.max as number) ?? (q.options?.length ?? 4)
        const minLabel = q.config?.min_label as string | undefined
        const maxLabel = q.config?.max_label as string | undefined
        const range = Array.from({ length: max - min + 1 }, (_, i) => min + i)
        return (
          <div className="flex items-end justify-between w-full max-w-[500px] gap-2.5 bg-slate-50/50 p-4 rounded-xl mx-auto">
            {minLabel && (
              <span className="text-xs text-slate-400 font-medium max-w-[120px] text-right mb-1 leading-tight">
                {minLabel}
              </span>
            )}
            <div className="flex items-start justify-center gap-2 sm:gap-4 flex-1">
              {range.map((num) => (
                <div key={num} className="flex flex-col items-center gap-1.5 flex-1 max-w-[70px]">
                  <span className="text-[10px] font-semibold text-slate-400">{num}</span>
                  <div className="flex size-6 shrink-0 items-center justify-center rounded-full border-2 border-slate-300 bg-white">
                    <div className="size-2 rounded-full bg-transparent" />
                  </div>
                  {q.options && q.options[num - min] && (
                    <span className="text-[10px] text-slate-400 font-medium text-center mt-1 leading-tight select-none">
                      {q.options[num - min]}
                    </span>
                  )}
                </div>
              ))}
            </div>
            {maxLabel && (
              <span className="text-xs text-slate-400 font-medium max-w-[120px] text-left mb-1 leading-tight">
                {maxLabel}
              </span>
            )}
          </div>
        )
      })()}

      {q.type === "ranking" && (
        <div className="space-y-1.5">
          {(q.options ?? []).map((opt, optIdx) => (
            <div key={optIdx} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm text-slate-500">
              <span className="flex size-5 items-center justify-center rounded bg-slate-200 text-[10px] font-bold text-slate-500">
                {optIdx + 1}
              </span>
              {opt || `Option ${optIdx + 1}`}
            </div>
          ))}
        </div>
      )}

      {q.type === "matrix" && (() => {
        const columns = (q.config?.columns as string[]) ?? ["Poor", "Fair", "Good", "Excellent"]
        const rows = q.options ?? []
        return (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse min-w-[400px]">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="py-2 pr-4 text-left text-xs font-medium text-slate-400 uppercase tracking-wider w-2/5" />
                  {columns.map((col) => (
                    <th key={col} className="px-3 py-2 text-center text-xs font-semibold text-slate-400 w-1/5 min-w-[70px]">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIdx) => (
                  <tr key={rowIdx} className="border-b border-slate-100 last:border-0">
                    <td className="py-2.5 pr-4 text-sm text-slate-650">{row || `Row ${rowIdx + 1}`}</td>
                    {columns.map((col) => (
                      <td key={col} className="px-3 py-2.5 text-center">
                        <div className="mx-auto inline-flex size-4 items-center justify-center rounded-full border-2 border-slate-300 bg-white">
                          <div className="size-2 rounded-full bg-transparent" />
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      })()}

      {q.type === "datetime" && (
        <div className="flex h-9 w-48 items-center rounded-lg border border-slate-200 bg-slate-50/50 px-3 text-sm text-slate-400">
          Select date...
        </div>
      )}

      {q.type === "file" && (
        <div className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-slate-200 bg-slate-50/50 px-4 py-6 text-center">
          <Upload className="size-6 text-slate-300" />
          <p className="text-xs text-slate-400">Click to upload or drag and drop</p>
          <p className="text-[11px] text-slate-300">PDF, images, or documents</p>
        </div>
      )}

      {q.type === "boolean" && (
        <div className="flex gap-3">
          {["Yes", "No"].map((opt) => (
            <div key={opt} className="flex cursor-default items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/50 px-4 py-2 text-sm text-slate-500">
              <div className="flex size-4 items-center justify-center rounded-full border-2 border-slate-300 bg-white">
                <div className="size-2 rounded-full bg-transparent" />
              </div>
              {opt}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function SurveyPreview({ survey, open, onClose }: SurveyPreviewProps) {
  const sections = survey.sections ?? []
  const [sectionIdx, setSectionIdx] = useState(0)
  const section = sections[sectionIdx]
  const isFirst = sectionIdx === 0
  const isLast = sectionIdx === sections.length - 1

  const goNext = () => {
    if (!isLast) setSectionIdx((p) => p + 1)
  }
  const goPrev = () => {
    if (!isFirst) setSectionIdx((p) => p - 1)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0"
        showCloseButton={false}
      >
        <div className="h-[120px] shrink-0 bg-gradient-to-br from-indigo-600 via-indigo-500 to-violet-500" />

        <div className="flex-1 overflow-y-auto px-6 -mt-[90px] pb-8">
          <div className="relative mb-4 overflow-hidden rounded-xl border-t-[6px] border-t-indigo-500 bg-white shadow-sm ring-1 ring-black/[0.04]">
            <div className="px-6 pb-5 pt-6">
              <div className="mb-3 flex items-center gap-2">
                <div className="flex size-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                  <ClipboardList className="size-[16px]" />
                </div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-600">
                  Survey Preview
                </span>
              </div>
              <h2 className="text-xl font-semibold tracking-tight text-slate-900">
                {survey.title}
              </h2>
              {survey.description && (
                <p className="mt-1.5 text-[14px] leading-relaxed text-slate-500">
                  {survey.description}
                </p>
              )}
            </div>
          </div>

          {/* Progress bar */}
          {sections.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
                <span>
                  Section {sectionIdx + 1} of {sections.length}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-indigo-500 transition-all duration-300"
                  style={{ width: `${((sectionIdx + 1) / sections.length) * 100}%` }}
                />
              </div>
            </div>
          )}

          {sections.length === 0 ? (
            <div className="rounded-xl bg-white px-6 py-8 text-center shadow-sm ring-1 ring-black/[0.04]">
              <p className="text-sm text-slate-400">No sections added yet.</p>
            </div>
          ) : section ? (
            <div>
              <div className="mb-3 rounded-xl border-l-4 border-l-violet-500 bg-white px-6 py-4 shadow-sm ring-1 ring-black/[0.04]">
                <h3 className="text-base font-semibold text-slate-900">
                  {section.title || `Section ${sectionIdx + 1}`}
                </h3>
                {section.description && (
                  <p className="mt-1 text-[13px] leading-relaxed text-slate-500">
                    {section.description}
                  </p>
                )}
              </div>

              <div className="space-y-3">
                {section.questions.length === 0 ? (
                  <div className="rounded-xl bg-white px-6 py-6 text-center shadow-sm ring-1 ring-black/[0.04]">
                    <p className="text-sm text-slate-400">No questions in this section.</p>
                  </div>
                ) : (
                  section.questions.map((q, qIdx) => renderQuestion(q, qIdx))
                )}
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center justify-between border-t border-slate-100 bg-white px-6 py-3">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <div className="flex gap-2">
            {!isFirst && (
              <Button variant="outline" onClick={goPrev} className="gap-1.5">
                <ArrowLeft className="size-4" data-icon="inline-start" />
                Previous
              </Button>
            )}
            {!isLast && sections.length > 0 && (
              <Button onClick={goNext} className="gap-1.5 bg-indigo-600 hover:bg-indigo-700">
                Next
                <ArrowRight className="size-4" data-icon="inline-end" />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
