import { Button } from "@/components/ui/button"
import { Download, Loader2, Users } from "lucide-react"
import { formatDate } from "@/lib/utils"
import { getScaleOptions } from "@/lib/surveys"
import { buildRawAggregate, buildAggregatePresentation } from "@/lib/survey-aggregates"
import type { Survey } from "@/lib/surveys"
import type { useSurveyManagement } from "../useSurveyManagement"
import { getSurveyResponseResourceId } from "../utils"

interface SurveyResponsesTabProps {
  survey: Survey
  store: ReturnType<typeof useSurveyManagement>
}

export function SurveyResponsesTab({ survey, store }: SurveyResponsesTabProps) {
  const { state, actions } = store
  const {
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

  const { handleEraseResponses, handleExportResponses, setSelectedResponseIds } = actions

  const { readAggregates: canReadAggregates, readRaw: canReadRaw, erase: canErase, export: canExport } = capabilities

  if (!canReadAggregates && !canReadRaw) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white px-5 py-8 text-center text-sm text-slate-500">
        You do not have permission to view survey responses.
      </div>
    )
  }

  if (responsesLoading) {
    return (
      <div className="space-y-12 animate-pulse" role="status">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-slate-200/60">
          <div className="space-y-3">
            <div className="h-6 w-40 bg-slate-100 rounded-md" />
            <div className="h-4 w-96 bg-slate-50 rounded-md" />
          </div>
          <div className="h-9 w-24 bg-slate-100 rounded-md" />
        </div>
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
    )
  }

  if (responsesError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
        {responsesError}
      </div>
    )
  }

  if (survey.responses === 0) {
    return (
      <div className="py-24 flex flex-col items-center justify-center">
        <div className="size-16 flex items-center justify-center mb-4">
          <Users className="size-8 text-slate-300" strokeWidth={1.5} />
        </div>
        <p className="text-base font-medium text-slate-900">Waiting for responses</p>
        <p className="text-[14px] text-slate-500 mt-2 max-w-sm text-center leading-relaxed">
          Once users start submitting their feedback, you&apos;ll see charts and detailed response breakdowns here.
        </p>
      </div>
    )
  }

  const renderBar = (label: string, count: number, _index: number) => {
    const totalAnswers = 0 // will be computed inline
    void totalAnswers
    return (
      <div key={label} className="group py-3 border-b border-slate-100 last:border-0 flex justify-between items-baseline text-[14px]">
        <div className="flex-1 truncate pr-4 text-slate-700">{label}</div>
        <div className="flex items-baseline gap-4">
          <span className="text-slate-400">({count})</span>
          <span className="font-semibold text-slate-900 w-8 text-right">—%</span>
        </div>
      </div>
    )
  }
  void renderBar

  return (
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
            <Button
              variant="destructive"
              size="sm"
              onClick={() => void handleEraseResponses(survey, "all")}
              disabled={responseAction !== null}
            >
              Erase all
            </Button>
          )}
          {canExport && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleExportResponses(getSurveyResponseResourceId(survey))}
              disabled={responseAction !== null}
            >
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
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => void handleEraseResponses(survey, "selected")}
                  disabled={responseAction !== null}
                  className="h-7 text-xs px-2"
                >
                  Erase ({selectedResponseIds.length})
                </Button>
              )}
            </div>
          </div>
          <div className="max-h-48 space-y-1 overflow-y-auto pr-2">
            {surveyResponses.map((response) => (
              <label
                key={response.id}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                {canErase && (
                  <input
                    type="checkbox"
                    aria-label={`Select response ${response.id}`}
                    checked={selectedResponseIds.includes(response.id)}
                    onChange={(event) =>
                      setSelectedResponseIds(
                        event.target.checked
                          ? [...selectedResponseIds, response.id]
                          : selectedResponseIds.filter((id) => id !== response.id)
                      )
                    }
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
            <h5 className="text-xl font-semibold text-slate-900 border-b border-slate-200 pb-4">
              {sec.title || `Section ${secIdx + 1}`}
            </h5>
            {sec.questions?.map((q, qIdx) => {
              const qTexts = responseTexts[q.id] ?? []
              const qCounts = responseCounts[q.id] ?? {}
              const aggregate = canReadAggregates
                ? responseAggregates.find((item) => item.question_id === q.id)
                : canReadRaw
                ? buildRawAggregate(q, surveyResponses)
                : undefined
              const aggregatePresentation = aggregate ? buildAggregatePresentation(aggregate, q) : null
              const totalAnswers =
                aggregatePresentation?.total ??
                responseTotals[q.id] ??
                Object.values(qCounts).reduce((a, b) => a + b, 0)

              const renderQuestionBar = (label: string, count: number) => {
                const percent = totalAnswers > 0 ? Math.round((count / totalAnswers) * 100) : 0
                return (
                  <div
                    key={label}
                    className="group py-3 border-b border-slate-100 last:border-0 flex justify-between items-baseline text-[14px]"
                  >
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
                  <p className="mb-6 text-[15px] font-medium text-slate-900">
                    {qIdx + 1}. {q.text}
                  </p>
                  {q.type === "text" ? (
                    canReadRaw ? (
                      <div className="space-y-3">
                        {qTexts.length > 0 ? (
                          qTexts.map((text, textIndex) => (
                            <div
                              key={textIndex}
                              className="pl-4 border-l-2 border-slate-200 py-1 text-[14px] text-slate-700"
                            >
                              {text}
                            </div>
                          ))
                        ) : (
                          <div className="py-2 text-[14px] text-slate-400">No text responses yet.</div>
                        )}
                      </div>
                    ) : (
                      <div className="py-2 text-sm italic text-slate-400">
                        Text responses are not included in aggregate-only access.
                      </div>
                    )
                  ) : aggregatePresentation ? (
                    aggregatePresentation.kind === "empty" ? (
                      <div className="py-2 text-[14px] text-slate-500">No aggregate values are available.</div>
                    ) : aggregatePresentation.kind === "bars" ? (
                      <div className="space-y-4">
                        {aggregatePresentation.items.map((item) => renderQuestionBar(item.label, item.count))}
                      </div>
                    ) : aggregatePresentation.kind === "ranking" ? (
                      <div className="space-y-5">
                        {aggregatePresentation.rows.map((row) => (
                          <div key={row.rank} className="space-y-3">
                            <p className="text-sm font-semibold text-slate-700">Rank {row.rank}</p>
                            <div className="space-y-3 pl-3">
                              {row.cells.map((item) => renderQuestionBar(item.label, item.count))}
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
                              {row.cells.map((item) => renderQuestionBar(item.label, item.count))}
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
                    <div className="space-y-4">
                      {getScaleOptions(q).map((option) =>
                        renderQuestionBar(
                          `${option.value}${option.label ? ` ${option.label}` : ""}`,
                          qCounts[String(option.value)] ?? 0
                        )
                      )}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {(q.type === "boolean"
                        ? ["No", "Yes"]
                        : q.options?.length
                        ? q.options
                        : ["Option 1", "Option 2", "Option 3"]
                      ).map((option) =>
                        renderQuestionBar(
                          option,
                          qCounts[q.type === "boolean" ? String(option === "Yes") : option] ?? 0
                        )
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
