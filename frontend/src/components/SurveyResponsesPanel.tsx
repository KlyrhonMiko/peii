import { Button } from "@/components/ui/button"
import { Download, FileSearch, Loader2, Users } from "lucide-react"
import { formatDate } from "@/lib/utils"
import { buildAggregatePresentation } from "@/lib/survey-aggregates"
import type {
  ApiPagination,
  Survey,
  SurveyQuestion,
  SurveyResponse,
  SurveyResponseIdentity,
  SurveyResponseAggregate,
} from "@/lib/surveys"
import type { SurveyCapabilities } from "./survey-management/types"

export interface SurveyResponsesPanelProps {
  survey: Survey
  capabilities: Pick<SurveyCapabilities, "readAggregates" | "readRaw" | "readIdentity" | "export" | "erase">
  aggregates: SurveyResponseAggregate[]
  responses: SurveyResponse[]
  identities: SurveyResponseIdentity[]
  responsePagination: ApiPagination | null
  aggregateLoading: boolean
  rawLoading: boolean
  aggregateError: string | null
  rawError: string | null
  rawLoaded: boolean
  identityLoading: boolean
  identityError: string | null
  identityLoaded: boolean
  selectedResponseIds: string[]
  responseAction: "export" | "erase" | null
  onLoadRaw: (offset?: number) => void
  onLoadIdentity: (offset?: number) => void
  onPageChange: (offset: number) => void
  onExport: () => void
  onErase: (scope: "selected" | "all") => void
  onToggleSelection: (responseId: string, selected: boolean) => void
}

const AGGREGATE_QUESTION_TYPES = new Set([
  "single_choice",
  "boolean",
  "multiple_choice",
  "scale",
  "ranking",
  "matrix",
])

function isAggregateSupported(question: SurveyQuestion): boolean {
  return AGGREGATE_QUESTION_TYPES.has(question.type)
}

function questionsForSurvey(survey: Survey): SurveyQuestion[] {
  return survey.sections?.flatMap((section) => section.questions) ?? survey.questions ?? []
}

function formatAnswer(answer: unknown): string {
  if (answer === null || answer === undefined || answer === "") return "No answer"
  if (Array.isArray(answer)) return answer.map(formatAnswer).join(", ")
  if (typeof answer === "object") {
    return Object.entries(answer)
      .map(([key, value]) => `${key}: ${formatAnswer(value)}`)
      .join("; ")
  }
  return String(answer)
}

function IdentityDetails({ identity }: { identity: SurveyResponseIdentity }) {
  const hasIdentity = identity.identityAvailable !== false &&
    (identity.displayName !== null || identity.email !== null || identity.provider !== null)

  return (
    <div className="grid gap-1 rounded-md border border-primary/10 bg-primary/5 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <dt className="font-medium text-muted-foreground">Respondent identity</dt>
      <dd className="break-words text-foreground">
        {hasIdentity ? (
          <span>
            <span>{identity.displayName ?? "Verified respondent"}</span>
            {identity.email && <><span aria-hidden="true"> · </span><span>{identity.email}</span></>}
          </span>
        ) : (
          <span className="text-muted-foreground">Identity is not available for this response.</span>
        )}
      </dd>
    </div>
  )
}

function ResponseBar({ label, count, total }: { label: string; count: number; total: number }) {
  const percentage = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-slate-100 py-3 text-[14px] last:border-0">
      <div className="min-w-0 flex-1 truncate text-slate-700">{label}</div>
      <div className="flex shrink-0 items-baseline gap-4">
        <span className="text-slate-400">({count})</span>
        <span className="w-8 text-right font-semibold text-slate-900">{percentage}%</span>
      </div>
    </div>
  )
}

function AggregateQuestion({
  question,
  aggregate,
}: {
  question: SurveyQuestion
  aggregate: SurveyResponseAggregate | undefined
}) {
  if (!isAggregateSupported(question)) {
    return <p className="py-2 text-sm italic text-slate-400">Aggregates are unavailable for this question type.</p>
  }

  if (!aggregate) {
    return <p className="py-2 text-[14px] text-slate-500">No aggregate values are available.</p>
  }

  const presentation = buildAggregatePresentation(aggregate, question)
  if (presentation.kind === "empty") {
    return <p className="py-2 text-[14px] text-slate-500">No aggregate values are available.</p>
  }

  if (presentation.kind === "bars") {
    return (
      <div className="space-y-1">
        {presentation.items.map((item) => (
          <ResponseBar key={item.key} label={item.label} count={item.count} total={presentation.total} />
        ))}
      </div>
    )
  }

  if (presentation.kind === "ranking") {
    return (
      <div className="space-y-5">
        {presentation.rows.map((row) => (
          <div key={row.rank} className="space-y-2">
            <p className="text-sm font-semibold text-slate-700">Rank {row.rank}</p>
            <div className="pl-3">
              {row.cells.map((item) => (
                <ResponseBar key={item.key} label={item.label} count={item.count} total={presentation.total} />
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {presentation.rows.map((row) => (
        <div key={row.row} className="space-y-2">
          <p className="text-sm font-semibold text-slate-700">{row.row}</p>
          <div className="pl-3">
            {row.cells.map((item) => (
              <ResponseBar key={item.key} label={item.label} count={item.count} total={presentation.total} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function AggregateSection({
  survey,
  aggregates,
  loading,
  error,
  canReadAggregates,
}: Pick<SurveyResponsesPanelProps, "survey" | "aggregates"> & {
  loading: boolean
  error: string | null
  canReadAggregates: boolean
}) {
  const questions = questionsForSurvey(survey)

  if (!canReadAggregates) {
    return (
      <div className="rounded-lg border border-slate-200/80 bg-slate-50/70 px-4 py-3 text-sm text-slate-500">
        Aggregate results are unavailable for this account. Load raw records to inspect individual responses when permitted.
      </div>
    )
  }

  if (loading) {
    return <div className="rounded-lg border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500" role="status">Loading aggregate results...</div>
  }

  if (error) {
    return <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</div>
  }

  if (questions.length === 0) {
    return <div className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">No questions are available for this survey.</div>
  }

  const aggregateByQuestion = new Map(aggregates.map((aggregate) => [aggregate.question_id, aggregate]))
  return (
    <div className="space-y-10">
      {survey.sections?.map((section, sectionIndex) => (
        <div key={section.id || sectionIndex} className="space-y-5">
          <h5 className="border-b border-slate-200 pb-4 text-xl font-semibold text-slate-900">
            {section.title || `Section ${sectionIndex + 1}`}
          </h5>
          {section.questions.map((question, questionIndex) => (
            <div key={question.id || questionIndex} className="relative py-4">
              <p className="mb-6 text-[15px] font-medium text-slate-900">{questionIndex + 1}. {question.text}</p>
              <AggregateQuestion question={question} aggregate={aggregateByQuestion.get(question.id)} />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function RawRecordsSection({
  survey,
  responses,
  responsePagination: pagination,
  loading,
  error,
  loaded,
  canReadRaw,
  canReadIdentity,
  canErase,
  identities,
  identityLoading,
  identityError,
  identityLoaded,
  selectedResponseIds,
  responseAction,
  onLoadRaw,
  onLoadIdentity,
  onPageChange,
  onErase,
  onToggleSelection,
}: Pick<SurveyResponsesPanelProps, "survey" | "responses" | "responsePagination" | "selectedResponseIds" | "responseAction" | "onLoadRaw" | "onLoadIdentity" | "onPageChange" | "onErase" | "onToggleSelection" | "identities" | "identityLoading" | "identityError" | "identityLoaded"> & {
  loading: boolean
  error: string | null
  loaded: boolean
  canReadRaw: boolean
  canReadIdentity: boolean
  canErase: boolean
}) {
  if (!canReadRaw) return null

  const questions = new Map(questionsForSurvey(survey).map((question) => [question.id, question.text]))
  const limit = pagination?.limit ?? 25
  const offset = pagination?.offset ?? 0
  const page = Math.floor(offset / Math.max(limit, 1)) + 1
  const totalPages = pagination ? Math.max(1, Math.ceil(pagination.total / Math.max(limit, 1))) : 1
  const identityByResponseId = new Map(identities.map((identity) => [identity.id, identity]))

  return (
    <section className="space-y-4 border-t border-slate-200/70 pt-8" aria-labelledby="raw-records-heading">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h4 id="raw-records-heading" className="text-sm font-semibold tracking-tight text-slate-900">Raw records</h4>
          <p className="mt-1 text-[13px] text-slate-500">Load one page at a time. Only the current page is retained here.</p>
        </div>
        <div className="flex items-center gap-2">
          {canErase && <span className="text-[13px] text-slate-500">Up to 100 records can be selected</span>}
          {canReadIdentity && loaded && (
            <Button variant="outline" size="sm" onClick={() => onLoadIdentity(offset)} disabled={identityLoading || loading}>
              {identityLoading ? <Loader2 className="animate-spin" /> : null}
              {identityLoaded ? "Refresh respondent identity" : "Load respondent identity"}
            </Button>
          )}
          {loaded && (
            <Button variant="outline" size="sm" onClick={() => onLoadRaw(offset)} disabled={loading}>
              Load raw records
            </Button>
          )}
          {loaded && selectedResponseIds.length > 0 && canErase && (
            <Button variant="destructive" size="sm" onClick={() => onErase("selected")} disabled={responseAction !== null}>
              {responseAction === "erase" ? <Loader2 className="animate-spin" /> : null}
              Erase ({selectedResponseIds.length})
            </Button>
          )}
        </div>
      </div>

      {!loaded && !loading && (
        <div className="rounded-lg border border-dashed border-slate-200 bg-white px-4 py-5 text-sm text-slate-500">
          Raw responses are not loaded. Select the button when you need to inspect individual records.
          <div className="mt-3">
            <Button size="sm" variant="outline" onClick={() => onLoadRaw(0)}>
              <FileSearch data-icon="inline-start" />
              Load raw records
            </Button>
          </div>
        </div>
      )}

      {loading && <div className="rounded-lg border border-slate-200 bg-white px-4 py-5 text-sm text-slate-500" role="status">Loading raw records...</div>}
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</div>}
      {identityError && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{identityError}</div>}

      {loaded && !loading && !error && (
        responses.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">No raw records are available on this page.</div>
        ) : (
          <>
            <div className="space-y-2">
              {responses.map((response) => {
                const identity = identityByResponseId.get(response.id)

                return (
                  <details key={response.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                    <summary className="flex cursor-pointer list-none items-center gap-3 text-slate-700 [&::-webkit-details-marker]:hidden">
                      {canErase && (
                        <input
                          type="checkbox"
                          aria-label={`Select response ${response.id}`}
                          checked={selectedResponseIds.includes(response.id)}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) => onToggleSelection(response.id, event.target.checked)}
                        />
                      )}
                      <span>{formatDate(response.createdAt)}</span>
                      <span className="truncate text-slate-400">{response.id}</span>
                      <span className="ml-auto text-xs text-slate-400">Inspect answers</span>
                    </summary>
                    <dl className="mt-3 space-y-2 border-t border-slate-100 pt-3 text-[13px]">
                      {identity && <IdentityDetails identity={identity} />}
                      {Object.entries(response.answers).length === 0 ? (
                        <div className="text-slate-500">No answers recorded.</div>
                      ) : Object.entries(response.answers).map(([questionId, answer]) => (
                        <div key={questionId} className="grid gap-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                          <dt className="font-medium text-slate-500">{questions.get(questionId) ?? questionId}</dt>
                          <dd className="break-words text-slate-700">{formatAnswer(answer)}</dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                )
              })}
            </div>
            {pagination && (
              <div className="flex items-center justify-between gap-3 text-sm text-slate-500">
                <span>Page {page} of {totalPages} · {pagination.total} total records</span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => onPageChange(Math.max(0, offset - limit))} disabled={!pagination.has_prev || loading}>
                    Previous page
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => onPageChange(offset + limit)} disabled={!pagination.has_next || loading}>
                    Next page
                  </Button>
                </div>
              </div>
            )}
          </>
        )
      )}
    </section>
  )
}

export function SurveyResponsesPanel({
  survey,
  capabilities,
  aggregates,
  responses,
  responsePagination,
  aggregateLoading,
  rawLoading,
  aggregateError,
  rawError,
  rawLoaded,
  identities,
  identityLoading,
  identityError,
  identityLoaded,
  selectedResponseIds,
  responseAction,
  onLoadRaw,
  onLoadIdentity,
  onPageChange,
  onExport,
  onErase,
  onToggleSelection,
}: SurveyResponsesPanelProps) {
  const { readAggregates, readRaw, readIdentity = false, export: canExport, erase: canErase } = capabilities
  const hasResponseCapability = readAggregates || readRaw || canExport || canErase

  if (!hasResponseCapability) {
    return <div className="rounded-xl border border-slate-200 bg-white px-5 py-8 text-center text-sm text-slate-500">You do not have permission to view survey responses.</div>
  }

  const canEraseAll = canErase && survey.isDeleted && survey.responses !== null && survey.responses > 0

  return (
    <div className="space-y-10">
      <div className="flex flex-col justify-between gap-4 border-b border-slate-200/60 pb-6 sm:flex-row sm:items-end">
        <div>
          <h3 className="text-lg font-semibold tracking-tight text-slate-900">Response data</h3>
          <p className="mt-1 max-w-xl text-[14px] text-slate-500">
            {readAggregates
              ? "Aggregate results are shown first. Raw records are loaded only when explicitly requested."
              : readRaw
                ? "Raw response access is available. Load individual records only when needed."
                : "Response actions are available according to your assigned permissions."}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {canEraseAll && (
            <Button variant="destructive" size="sm" onClick={() => onErase("all")} disabled={responseAction !== null}>
              {responseAction === "erase" ? <Loader2 className="animate-spin" /> : null}
              Erase all
            </Button>
          )}
          {canExport && (
            <Button variant="outline" size="sm" onClick={onExport} disabled={responseAction !== null}>
              {responseAction === "export" ? <Loader2 className="animate-spin" /> : <Download />}
              Export
            </Button>
          )}
        </div>
      </div>

      <section aria-labelledby="aggregate-results-heading" className="space-y-5">
        <div>
          <h4 id="aggregate-results-heading" className="text-sm font-semibold tracking-tight text-slate-900">Aggregate results</h4>
          {survey.responses === 0 && <p className="mt-1 text-[13px] text-slate-500">No responses have been submitted yet.</p>}
        </div>
        <AggregateSection
          survey={survey}
          aggregates={aggregates}
          loading={aggregateLoading}
          error={aggregateError}
          canReadAggregates={readAggregates}
        />
      </section>

      <RawRecordsSection
        survey={survey}
        responses={responses}
        responsePagination={responsePagination}
        loading={rawLoading}
        error={rawError}
        loaded={rawLoaded}
        canReadRaw={readRaw}
        canReadIdentity={readIdentity}
        canErase={canErase}
        identities={identities}
        identityLoading={identityLoading}
        identityError={identityError}
        identityLoaded={identityLoaded}
        selectedResponseIds={selectedResponseIds}
        responseAction={responseAction}
        onLoadRaw={onLoadRaw}
        onLoadIdentity={onLoadIdentity}
        onPageChange={onPageChange}
        onErase={onErase}
        onToggleSelection={onToggleSelection}
      />

      {readAggregates && !aggregateLoading && !aggregateError && survey.responses === 0 && (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <Users className="mb-3 size-8 text-slate-300" strokeWidth={1.5} />
          <p className="text-base font-medium text-slate-900">Waiting for responses</p>
          <p className="mt-2 max-w-sm text-[14px] leading-relaxed text-slate-500">Aggregate breakdowns will appear after users submit their feedback.</p>
        </div>
      )}
    </div>
  )
}
