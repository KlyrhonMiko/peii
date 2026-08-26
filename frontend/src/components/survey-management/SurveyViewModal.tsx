import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import {
  FileText,
  X,
  Users,
  Loader2,
  Download,
} from "lucide-react"
import { cn, formatDate } from "@/lib/utils"

import type { useSurveyManagement } from "./useSurveyManagement"
import { formatSurveyResponseCount, getSurveyResponseResourceId } from "./utils"
import { getScaleOptions } from "@/lib/surveys"
import { buildRawAggregate, buildAggregatePresentation } from "@/lib/survey-aggregates"

export interface SurveyViewModalProps {
  store: ReturnType<typeof useSurveyManagement>
}

export function SurveyViewModal({ store }: SurveyViewModalProps) {
  const { state, actions } = store
  const {
    modalState,
    surveys,
    viewTab,
    surveyResponses,
    responseAggregates,
    responsesLoading,
    responsesError,
    responseAction,
    selectedResponseIds,
    responseCounts,
    responseTotals,
    responseTexts,
    capabilities,
  } = state

  const {
    handleCloseModal,
    handleViewResponses,
    setViewTab,
    handleEraseResponses,
    handleExportResponses,
    setSelectedResponseIds,
  } = actions

  const {
    readAggregates: canReadAggregates,
    readRaw: canReadRaw,
    erase: canErase,
    export: canExport
  } = capabilities

  const survey = modalState?.type === "view" ? surveys.find((s) => s.id === modalState.id) : undefined

  return (
    <Dialog
      open={modalState !== null && modalState.type === "view"}
      onOpenChange={(open) => !open && handleCloseModal()}
    >
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-4xl max-w-4xl w-[95vw] h-[90vh] p-0 overflow-hidden flex flex-col gap-0 border-0 rounded-2xl shadow-[0_16px_40px_-12px_rgba(0,0,0,0.1)] bg-white"
      >
        {survey && (
          <>
            <div className="flex items-center justify-between px-10 py-6 border-b border-slate-100 bg-white shrink-0">
              <div className="flex items-center gap-4">
                <div className="flex size-12 items-center justify-center rounded-xl bg-slate-50 border border-slate-100">
                  <FileText className="size-5 text-slate-700" />
                </div>
                <div className="flex-1 min-w-0">
                  <DialogTitle className="text-xl font-medium text-slate-900 tracking-tight">
                    {survey.title}
                  </DialogTitle>
                  <DialogDescription className="text-sm text-slate-500 mt-1">
                    Created {formatDate(survey.dateCreated)}
                  </DialogDescription>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={handleCloseModal} className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full">
                <X className="size-5" />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto px-10 py-8 space-y-10 bg-slate-50/30">
              <div className="max-w-3xl mx-auto space-y-10 pb-12">
                {/* Analytics Overview */}
                <div className="flex items-center gap-16 pb-10">
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2 text-slate-500 mb-2">
                      <Users className="size-4" />
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Responses</span>
                    </div>
                    <div className="text-4xl font-semibold tracking-tight text-slate-900">
                      {formatSurveyResponseCount(survey.responses, canReadAggregates)}
                    </div>
                  </div>
                  <div className="w-px h-12 bg-slate-200/60" />
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2 text-slate-500 mb-2">
                      <FileText className="size-4" />
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Status</span>
                    </div>
                    <div className={cn(
                      "text-4xl font-semibold tracking-tight",
                      survey.status === "Active" ? "text-slate-900" : "text-slate-400"
                    )}>
                      {survey.status}
                    </div>
                  </div>
                </div>

                {/* Tabs */}
                <div className="flex items-center gap-6 border-b border-slate-200 w-full">
                  <button
                    onClick={() => setViewTab("questions")}
                    className={cn(
                      "pb-3 text-sm font-medium transition-colors border-b-2 relative top-[1px]",
                      viewTab === "questions" ? "text-slate-900 border-slate-900" : "text-slate-500 border-transparent hover:text-slate-700"
                    )}
                  >
                    Questions
                  </button>
                  <button
                    onClick={() => handleViewResponses(survey)}
                    className={cn(
                      "pb-3 text-sm font-medium transition-colors border-b-2 relative top-[1px] flex items-center gap-2",
                      viewTab === "responses" ? "text-slate-900 border-slate-900" : "text-slate-500 border-transparent hover:text-slate-700"
                    )}
                  >
                    Responses
                    {(survey.responses === null || survey.responses > 0) && (
                      <span className={cn(
                        "py-0.5 px-2 rounded-full text-[10px] font-bold leading-none",
                        viewTab === "responses" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"
                      )}>
                        {formatSurveyResponseCount(survey.responses, canReadAggregates)}
                      </span>
                    )}
                  </button>
                </div>

                {/* Content */}
                {viewTab === "questions" ? (
                  <div className="space-y-12 pb-12">
                    {(!survey.sections || survey.sections.length === 0) ? (
                      <div className="py-16 flex flex-col items-center justify-center rounded-2xl border border-slate-200/60 border-dashed bg-transparent">
                        <p className="text-sm text-slate-400 font-medium">No sections added yet.</p>
                      </div>
                    ) : (
                      survey.sections.map((sec, secIdx) => (
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
                            {(!sec.questions || sec.questions.length === 0) ? (
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
                                          { length: ((q.config?.max as number) ?? (q.options?.length ?? 4)) - ((q.config?.min as number) ?? 1) + 1 },
                                          (_, i) => ((q.config?.min as number) ?? 1) + i
                                        ).map(rating => (
                                          <div key={rating} className="size-11 rounded-full border border-slate-200/80 bg-white flex items-center justify-center text-slate-600 text-sm font-medium shadow-sm transition-all hover:border-indigo-200 hover:text-indigo-600 cursor-default">
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
                                  {["single_choice", "multiple_choice", "ranking"].includes(q.type) && (
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
                                              <th key={colIdx} className="p-3 font-medium text-slate-500 text-center">{col || `Col ${colIdx + 1}`}</th>
                                            ))}
                                          </tr>
                                        </thead>
                                        <tbody className="[&>tr:nth-child(even)]:bg-slate-50/50">
                                          {(q.options ?? []).map((opt, optIdx) => (
                                            <tr key={optIdx} className="hover:bg-slate-50/80 transition-colors border-b border-slate-100/50 last:border-0">
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
                      ))
                    )}
                  </div>
                ) : (
                  <div className="space-y-6">
                    {!canReadAggregates && !canReadRaw ? (
                      <div className="rounded-xl border border-slate-200 bg-white px-5 py-8 text-center text-sm text-slate-500">
                        You do not have permission to view survey responses.
                      </div>
                    ) : responsesLoading ? (
                      <div className="space-y-12 animate-pulse" role="status">
                        {/* Response Data Header Skeleton */}
                        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-slate-200/60">
                          <div className="space-y-3">
                            <div className="h-6 w-40 bg-slate-100 rounded-md" />
                            <div className="h-4 w-96 bg-slate-50 rounded-md" />
                          </div>
                          <div className="h-9 w-24 bg-slate-100 rounded-md" />
                        </div>

                        {/* Raw Records Skeleton */}
                        <div className="py-2">
                          <div className="mb-4 flex items-center justify-between gap-2">
                            <div className="h-5 w-32 bg-slate-100 rounded-md" />
                            <div className="h-4 w-40 bg-slate-50 rounded-md" />
                          </div>
                          <div className="space-y-3">
                            {[1, 2, 3].map((i) => (
                              <div key={i} className="flex items-center gap-3 py-1.5 px-2">
                                <div className="size-4 bg-slate-100 rounded" />
                                <div className="h-4 w-28 bg-slate-100 rounded-md" />
                                <div className="h-4 w-64 bg-slate-50 rounded-md" />
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Sections Skeleton */}
                        <div className="space-y-12">
                          {[1, 2].map((i) => (
                            <div key={i} className="space-y-5">
                              <div className="border-b border-slate-200 pb-4">
                                <div className="h-7 w-48 bg-slate-100 rounded-md" />
                              </div>
                              <div className="space-y-8 pt-4">
                                {[1, 2].map((q) => (
                                  <div key={q} className="space-y-4">
                                    <div className="h-5 w-72 bg-slate-100 rounded-md" />
                                    <div className="h-3 w-full bg-slate-50 rounded-md" />
                                    <div className="h-3 w-5/6 bg-slate-50 rounded-md" />
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : responsesError ? (
                      <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                        {responsesError}
                      </div>
                    ) : survey.responses === 0 ? (
                      <div className="py-24 flex flex-col items-center justify-center">
                        <div className="size-16 flex items-center justify-center mb-4">
                          <Users className="size-8 text-slate-300" strokeWidth={1.5} />
                        </div>
                        <p className="text-base font-medium text-slate-900">Waiting for responses</p>
                        <p className="text-[14px] text-slate-500 mt-2 max-w-sm text-center leading-relaxed">Once users start submitting their feedback, you&apos;ll see charts and detailed response breakdowns here.</p>
                      </div>
                    ) : (
                      <div className="space-y-12">
                        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-slate-200/60">
                          <div>
                            <h3 className="text-lg font-semibold text-slate-900 tracking-tight">Response Data</h3>
                            <p className="text-[14px] text-slate-500 mt-1 max-w-xl">
                              {canReadRaw
                                ? "Raw response access is enabled. You can view individual records and export full data."
                                : "Showing privacy-preserving aggregates only. Raw individual responses are hidden."}
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            {canErase && survey.isDeleted && survey.responses !== null && survey.responses > 0 && (
                              <Button variant="destructive" size="sm" onClick={() => void handleEraseResponses(survey, "all")} disabled={responseAction !== null}>
                                Erase all
                              </Button>
                            )}
                            {canExport && (
                              <Button variant="outline" size="sm" onClick={() => void handleExportResponses(getSurveyResponseResourceId(survey))} disabled={responseAction !== null}>
                                {responseAction === "export" ? <Loader2 className="animate-spin" /> : <Download />}
                                Export
                              </Button>
                            )}
                          </div>
                        </div>

                        {canReadRaw && surveyResponses.length > 0 && (
                          <div className="py-2">
                            <div className="mb-4 flex items-center justify-between gap-2">
                              <h5 className="text-sm font-semibold text-slate-900 tracking-tight">Raw records</h5>
                              <div className="flex items-center gap-4">
                                {canErase && <span className="text-[13px] text-slate-500">Select records to erase</span>}
                                {canErase && selectedResponseIds.length > 0 && (
                                  <Button variant="destructive" size="sm" onClick={() => void handleEraseResponses(survey, "selected")} disabled={responseAction !== null} className="h-7 text-xs px-2">
                                    Erase ({selectedResponseIds.length})
                                  </Button>
                                )}
                              </div>
                            </div>
                            <div className="max-h-48 space-y-1 overflow-y-auto pr-2">
                              {surveyResponses.map((response) => (
                                <label key={response.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-50 cursor-pointer">
                                  {canErase && (
                                    <input
                                      type="checkbox"
                                      aria-label={`Select response ${response.id}`}
                                      checked={selectedResponseIds.includes(response.id)}
                                      onChange={(event) => setSelectedResponseIds(event.target.checked
                                        ? [...selectedResponseIds, response.id]
                                        : selectedResponseIds.filter((id) => id !== response.id))}
                                    />
                                  )}
                                  <span>{formatDate(response.createdAt)}</span>
                                  <span className="truncate text-slate-400">{response.id}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="space-y-12">
                          {survey.sections?.map((sec, secIdx) => (
                            <div key={secIdx} className="space-y-5">
                              <h5 className="text-xl font-semibold text-slate-900 border-b border-slate-200 pb-4">{sec.title || `Section ${secIdx + 1}`}</h5>
                              {sec.questions?.map((q, qIdx) => {
                                const qTexts = responseTexts[q.id] ?? []
                                const qCounts = responseCounts[q.id] ?? {}
                                const aggregate = canReadAggregates
                                  ? responseAggregates.find((item) => item.question_id === q.id)
                                  : canReadRaw
                                    ? buildRawAggregate(q, surveyResponses)
                                    : undefined
                                const aggregatePresentation = aggregate
                                  ? buildAggregatePresentation(aggregate, q)
                                  : null
                                const totalAnswers = aggregatePresentation?.total
                                  ?? responseTotals[q.id]
                                  ?? Object.values(qCounts).reduce((a, b) => a + b, 0)
                                const renderBar = (label: string, count: number, index: number) => {
                                  const percent = totalAnswers > 0 ? Math.round((count / totalAnswers) * 100) : 0
                                  return (
                                    <div key={label} className="group py-3 border-b border-slate-100 last:border-0 flex justify-between items-baseline text-[14px]">
                                      <div className="flex-1 truncate pr-4 text-slate-700">{label}</div>
                                      <div className="flex items-baseline gap-4">
                                        <span className="text-slate-400">({count})</span>
                                        <span className="font-semibold text-slate-900 w-8 text-right">{percent}%</span>
                                      </div>
                                    </div>
                                  )
                                }

                                return (
                                  <div key={q.id || qIdx} className="relative py-4">
                                    <p className="mb-6 text-[15px] font-medium text-slate-900">{qIdx + 1}. {q.text}</p>
                                    {q.type === "text" ? (
                                      canReadRaw ? (
                                        <div className="space-y-3">
                                          {qTexts.length > 0 ? qTexts.map((text, textIndex) => <div key={textIndex} className="pl-4 border-l-2 border-slate-200 py-1 text-[14px] text-slate-700">{text}</div>) : <div className="py-2 text-[14px] text-slate-400">No text responses yet.</div>}
                                        </div>
                                      ) : <div className="py-2 text-sm italic text-slate-400">Text responses are not included in aggregate-only access.</div>
                                    ) : aggregatePresentation ? (
                                      aggregatePresentation.kind === "empty" ? (
                                        <div className="py-2 text-[14px] text-slate-500">
                                          No aggregate values are available.
                                        </div>
                                      ) : aggregatePresentation.kind === "bars" ? (
                                        <div className="space-y-4">
                                          {aggregatePresentation.items.map((item, index) => renderBar(item.label, item.count, index))}
                                        </div>
                                      ) : aggregatePresentation.kind === "ranking" ? (
                                        <div className="space-y-5">
                                          {aggregatePresentation.rows.map((row) => (
                                            <div key={row.rank} className="space-y-3">
                                              <p className="text-sm font-semibold text-slate-700">Rank {row.rank}</p>
                                              <div className="space-y-3 pl-3">
                                                {row.cells.map((item, index) => renderBar(item.label, item.count, index))}
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      ) : (
                                        <div className="space-y-5">
                                          {aggregatePresentation.rows.map((row) => (
                                            <div key={row.row} className="space-y-3">
                                              <p className="text-sm font-semibold text-slate-700">{row.row}</p>
                                              <div className="space-y-3 pl-3">
                                                {row.cells.map((item, index) => renderBar(item.label, item.count, index))}
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      )
                                    ) : canReadAggregates ? (
                                      <div className="py-2 text-[14px] text-slate-500">
                                        Aggregate results are unavailable because the privacy threshold was not met.
                                      </div>
                                    ) : q.type === "scale" ? (
                                      <div className="space-y-4">{getScaleOptions(q).map((option, optionIndex) => renderBar(`${option.value}${option.label ? ` ${option.label}` : ""}`, qCounts[String(option.value)] ?? 0, optionIndex))}</div>
                                    ) : (
                                      <div className="space-y-4">{(q.type === "boolean" ? ["No", "Yes"] : q.options?.length ? q.options : ["Option 1", "Option 2", "Option 3"]).map((option, optionIndex) => renderBar(option, qCounts[q.type === "boolean" ? String(optionIndex === 1) : option] ?? 0, optionIndex))}</div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
