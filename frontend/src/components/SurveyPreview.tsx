"use client"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import {
  ClipboardList,
  ListChecks,
  Upload,
  X,
} from "lucide-react"
import type { Survey, SurveyQuestion } from "@/lib/surveys"

interface SurveyPreviewProps {
  survey: Survey
  open: boolean
  onClose: () => void
}

function renderQuestion(q: SurveyQuestion, idx: number) {
  return (
    <div key={q.id || idx} className="py-4 first:pt-0 last:pb-0 flex items-start gap-4 group">
      <span className="mt-0.5 text-[12px] font-medium text-slate-400 group-hover:text-indigo-500 transition-colors w-6">
        {idx + 1}.
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-medium text-slate-800 leading-snug group-hover:text-slate-900 transition-colors">
          {q.text || "Untitled Question"}
          {(q.isRequired ?? true) && <span className="text-red-500 ml-1">*</span>}
        </p>

        {q.type === "single_choice" && (
          <div className="mt-3 flex flex-col gap-2">
            {(q.options ?? []).map((opt, optIdx) => (
              <div key={optIdx} className="flex cursor-default items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500 shadow-sm transition-colors group-hover:border-slate-300">
                <div className="flex size-4 items-center justify-center rounded-full border-2 border-slate-300">
                  <div className="size-2 rounded-full bg-transparent" />
                </div>
                {opt || `Option ${optIdx + 1}`}
              </div>
            ))}
          </div>
        )}

        {q.type === "multiple_choice" && (
          <div className="mt-3 flex flex-col gap-2">
            {(q.options ?? []).map((opt, optIdx) => (
              <div key={optIdx} className="flex cursor-default items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500 shadow-sm transition-colors group-hover:border-slate-300">
                <div className="flex size-4 items-center justify-center rounded border-2 border-slate-300">
                  <div className="size-2 rounded-sm bg-transparent" />
                </div>
                {opt || `Option ${optIdx + 1}`}
              </div>
            ))}
          </div>
        )}

        {q.type === "text" && (
          <div className="mt-3 h-20 w-full max-w-lg rounded-lg border border-slate-200 bg-slate-50/50 flex items-start p-3 text-slate-400 text-[12px] shadow-sm">
            Type your response here...
          </div>
        )}

        {q.type === "number" && (
          <div className="mt-3 flex h-9 w-32 items-center rounded-lg border border-slate-200 bg-slate-50/50 px-3 text-sm text-slate-400 shadow-sm">
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
            <div className="mt-3 flex items-end justify-between w-full max-w-[500px] gap-2.5 bg-slate-50/50 p-4 rounded-xl shadow-sm border border-slate-200/50">
              {minLabel && (
                <span className="text-xs text-slate-400 font-medium max-w-[120px] text-right mb-1 leading-tight">
                  {minLabel}
                </span>
              )}
              <div className="flex items-start justify-center gap-2 sm:gap-4 flex-1">
                {range.map((num) => (
                  <div key={num} className="flex flex-col items-center gap-1.5 flex-1 max-w-[70px]">
                    <span className="text-[10px] font-semibold text-slate-400">{num}</span>
                    <div className="flex size-6 shrink-0 items-center justify-center rounded-full border-2 border-slate-300 bg-white hover:border-indigo-400 transition-colors cursor-default">
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
          <div className="mt-3 space-y-1.5">
            {(q.options ?? []).map((opt, optIdx) => (
              <div key={optIdx} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500 shadow-sm transition-colors group-hover:border-slate-300">
                <span className="flex size-5 items-center justify-center rounded bg-slate-100 text-[10px] font-bold text-slate-500">
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
            <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-sm border-collapse min-w-[400px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/50">
                    <th className="py-2.5 px-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider w-2/5" />
                    {columns.map((col) => (
                      <th key={col} className="px-3 py-2.5 text-center text-xs font-semibold text-slate-600 w-1/5 min-w-[70px]">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, rowIdx) => (
                    <tr key={rowIdx} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors">
                      <td className="py-3 px-4 text-sm text-slate-700 font-medium">{row || `Row ${rowIdx + 1}`}</td>
                      {columns.map((col) => (
                        <td key={col} className="px-3 py-3 text-center">
                          <div className="mx-auto inline-flex size-4 items-center justify-center rounded-full border-2 border-slate-300 bg-white hover:border-indigo-400 transition-colors">
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
          <div className="mt-3 flex h-9 w-48 items-center rounded-lg border border-slate-200 bg-slate-50/50 px-3 text-sm text-slate-400 shadow-sm">
            Select date...
          </div>
        )}

        {q.type === "file" && (
          <div className="mt-3 flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-slate-200 bg-white px-4 py-6 text-center shadow-sm transition-colors hover:border-indigo-300 hover:bg-indigo-50/30">
            <Upload className="size-6 text-slate-300" />
            <p className="text-xs text-slate-400">Click to upload or drag and drop</p>
            <p className="text-[11px] text-slate-300">PDF, images, or documents</p>
          </div>
        )}

        {q.type === "boolean" && (
          <div className="mt-3 flex gap-3">
            {["Yes", "No"].map((opt) => (
              <div key={opt} className="flex cursor-default items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-500 shadow-sm transition-colors group-hover:border-slate-300">
                <div className="flex size-4 items-center justify-center rounded-full border-2 border-slate-300 bg-white">
                  <div className="size-2 rounded-full bg-transparent" />
                </div>
                {opt}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function SurveyPreview({ survey, open, onClose }: SurveyPreviewProps) {
  const sections = survey.sections ?? []

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-4xl max-w-[95vw] max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden border-slate-200/60 rounded-2xl shadow-2xl bg-slate-50/50" showCloseButton={false}>
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-6 border-b border-slate-200/80 bg-white shrink-0">
          <div className="flex items-center gap-4">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-indigo-50/80 ring-1 ring-indigo-100 shadow-sm">
              <ClipboardList className="size-6 text-indigo-600" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-semibold tracking-tight text-slate-900 flex items-center gap-2">
                {survey.title}
                <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-600 ring-1 ring-inset ring-indigo-500/10 uppercase tracking-wider">Preview</span>
              </h2>
              <p className="text-[13px] text-slate-500 mt-1 max-w-xl leading-relaxed truncate">
                {survey.description || "Preview how the survey will appear to respondents."}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 -mr-2"
          >
            <X className="size-4" />
          </Button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-8 space-y-8 bg-slate-50/30">
          <div className="grid gap-6">
            {sections.length === 0 ? (
              <div className="rounded-xl bg-white px-6 py-8 text-center shadow-sm border border-slate-200/60">
                <p className="text-sm text-slate-400">No sections added yet.</p>
              </div>
            ) : (
              sections.map((sec, secIdx) => (
                <div key={sec.id || secIdx} className="rounded-xl bg-white border border-slate-200/60 shadow-sm overflow-hidden transition-all hover:shadow-md hover:border-slate-300/80">
                  <div className="bg-slate-50/50 px-6 py-4 border-b border-slate-100 flex items-start gap-4">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white border border-slate-200 shadow-sm text-sm font-bold text-slate-700">
                      {secIdx + 1}
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-slate-900 tracking-tight">
                        {sec.title || `Section ${secIdx + 1}`}
                      </h3>
                      {sec.description && (
                        <p className="mt-1 text-[13px] leading-relaxed text-slate-500">
                          {sec.description}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  <div className="p-6 divide-y divide-slate-100">
                    {(!sec.questions || sec.questions.length === 0) ? (
                      <p className="text-sm text-slate-400 py-2">No questions in this section.</p>
                    ) : (
                      sec.questions.map((q, qIdx) => renderQuestion(q, qIdx))
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between border-t border-slate-200/80 bg-white px-8 py-5">
          <div className="flex items-center gap-3 text-[13px] text-slate-500 font-medium">
            <span className="flex items-center gap-1.5"><ClipboardList className="size-4 text-slate-400" /> {sections.length} Sections</span>
            <span className="text-slate-300">&bull;</span>
            <span className="flex items-center gap-1.5"><ListChecks className="size-4 text-slate-400" /> {sections.reduce((acc, s) => acc + (s.questions?.length || 0), 0)} Questions</span>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={onClose}
              className="h-10 px-5 text-[13px] font-medium"
            >
              Close Preview
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

