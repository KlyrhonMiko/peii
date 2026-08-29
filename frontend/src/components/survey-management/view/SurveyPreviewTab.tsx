import type { SurveySection } from "@/lib/surveys"
import { Button } from "@/components/ui/button"
import { ChevronDown } from "lucide-react"

interface SurveyPreviewTabProps {
  sections: SurveySection[] | undefined
}

export function SurveyPreviewTab({ sections }: SurveyPreviewTabProps) {
  if (!sections || sections.length === 0) {
    return (
      <div className="py-16 flex flex-col items-center justify-center rounded-2xl border border-slate-200/60 border-dashed bg-transparent">
        <p className="text-sm text-slate-400 font-medium">No sections added yet.</p>
      </div>
    )
  }

  return (
    <div className="space-y-12 pb-12">
      {sections.map((sec, secIdx) => (
        <div key={sec.id || secIdx} className="relative">
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-slate-900 tracking-tight flex items-baseline gap-2">
              <span className="text-indigo-600/50 text-sm font-bold">{secIdx + 1}.</span>
              {sec.title || "Untitled Section"}
            </h3>
            {sec.description && (
              <p className="text-[14px] text-slate-500 mt-2 max-w-2xl leading-relaxed">
                {sec.description}
              </p>
            )}
          </div>
          <div className="space-y-10 pl-6 border-l-2 border-slate-100/60">
            {!sec.questions || sec.questions.length === 0 ? (
              <p className="text-sm text-slate-400 italic">No questions in this section.</p>
            ) : (
              sec.questions.map((q, qIdx) => (
                <div key={q.id || qIdx} className="text-sm text-slate-600 group">
                  <div className="mb-4">
                    <span className="font-medium text-slate-900 block text-[15px] leading-snug">
                      {secIdx + 1}.{qIdx + 1} {q.text || "Untitled Question"}
                    </span>
                  </div>

                  {q.type === "scale" && (
                    <div className="space-y-3">
                      {!!(q.config?.min_label || q.config?.max_label) && (
                        <div className="flex items-center gap-4 text-[13px] text-slate-500 font-medium">
                          {!!q.config?.min_label && <span className="text-slate-400">{String(q.config.min_label)}</span>}
                          <div className="h-px bg-slate-200 flex-1 opacity-50" />
                          {!!q.config?.max_label && <span className="text-slate-400">{String(q.config.max_label)}</span>}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2">
                        {Array.from(
                          {
                            length:
                              ((q.config?.max as number) ?? (q.options?.length ?? 4)) -
                              ((q.config?.min as number) ?? 1) +
                              1,
                          },
                          (_, i) => ((q.config?.min as number) ?? 1) + i
                        ).map((rating) => (
                          <div
                            key={rating}
                            className="size-11 rounded-full border border-slate-200/80 bg-white flex items-center justify-center text-slate-600 text-sm font-medium shadow-sm transition-all hover:border-indigo-200 hover:text-indigo-600 cursor-default"
                          >
                            {rating}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {q.type === "text" && (
                    <div className="min-h-[100px] w-full max-w-2xl rounded-xl border border-slate-200/60 bg-white/50 p-4 text-slate-400 text-[14px] shadow-sm flex items-start font-medium">
                      User provides a text response here...
                    </div>
                  )}

                  {q.config?.presentation === "dropdown" ? (
                    <Button
                      type="button"
                      variant="outline"
                      disabled
                      className="mt-4 h-9 w-full max-w-xs justify-between text-sm font-normal text-slate-500"
                    >
                      Select a degree program…
                      <ChevronDown className="size-4 text-slate-400" />
                    </Button>
                  ) : ["single_choice", "multiple_choice", "ranking"].includes(q.type) && (
                    <div className="space-y-3 max-w-2xl">
                      {(q.options ?? []).map((opt, optIdx) => (
                        <div key={optIdx} className="flex items-start gap-3 text-[14px]">
                          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-slate-100/80 text-[10px] font-bold text-slate-500 mt-0.5">
                            {String.fromCharCode(65 + optIdx)}
                          </span>
                          <span className="text-slate-700 leading-snug">{opt || `Option ${optIdx + 1}`}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {q.type === "matrix" && (
                    <div className="mt-4 max-w-3xl overflow-x-auto rounded-xl border border-slate-200/60 bg-white shadow-sm">
                      <table className="w-full text-left text-[13px] border-collapse min-w-[500px]">
                        <thead>
                          <tr className="border-b border-slate-100 bg-slate-50/50">
                            <th className="p-3 font-medium text-slate-500 min-w-[150px]"></th>
                            {((q.config?.columns as string[]) ?? []).map((col, colIdx) => (
                              <th key={colIdx} className="p-3 font-medium text-slate-500 text-center">
                                {col || `Col ${colIdx + 1}`}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="[&>tr:nth-child(even)]:bg-slate-50/50">
                          {(q.options ?? []).map((opt, optIdx) => (
                            <tr
                              key={optIdx}
                              className="hover:bg-slate-50/80 transition-colors border-b border-slate-100/50 last:border-0"
                            >
                              <td className="p-3 font-medium text-slate-700">{opt || `Row ${optIdx + 1}`}</td>
                              {((q.config?.columns as string[]) ?? []).map((_, colIdx) => (
                                <td key={colIdx} className="p-3 text-center">
                                  <div className="inline-flex size-4 rounded-full border border-slate-300 bg-slate-50 shadow-sm" />
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
