import { responseRate, type RateRow, type ResponseCoverage } from "@/lib/alumni-counts"
import { cn } from "@/lib/utils"

export function formatRespondents(responses: number, alumni: number | null) {
  return alumni === null
    ? `${responses.toLocaleString()} respondents`
    : `${responses.toLocaleString()} / ${alumni.toLocaleString()} respondents`
}

export function formatRate(rate: number | null) {
  return rate === null ? "—" : `${rate.toFixed(1)}%`
}

function rowNote(row: RateRow) {
  if (row.alumni === null) return "no alumni total"
  if (row.responses === 0) return "no responses yet"
  return null
}

export type ResponseRateView = "batch" | "college"

const VIEWS: Array<{ value: ResponseRateView; label: string }> = [
  { value: "batch", label: "By batch" },
  { value: "college", label: "By college" },
]

const SCALE_STEPS = [1, 2, 5, 10, 20, 25, 50]

/** Picks a shared axis of about five steps, plus one step of room when the longest bar would crowd its label. */
export function rateScale(maxRate: number): { max: number; ticks: number[] } {
  const step = SCALE_STEPS.find((candidate) => Math.ceil(maxRate / candidate) <= 5) ?? 25
  let max = Math.max(step, Math.ceil(maxRate / step) * step)
  if (maxRate / max > 0.85) max += step
  return { max, ticks: Array.from({ length: Math.round(max / step) + 1 }, (_, index) => index * step) }
}

/** College rows repeat the panel title, so drop the shared "College of" prefix. */
function chartLabel(row: RateRow, view: ResponseRateView) {
  return view === "college" ? row.label.replace(/^College of /, "") : row.label.replace(/^Batch /, "")
}

function RateBars({ title, rows, view }: { title: string; rows: RateRow[]; view: ResponseRateView }) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-400">No responses or alumni totals for these filters.</p>
  }
  const rates = rows.map((row) => responseRate(row.responses, row.alumni))
  const scale = rateScale(Math.max(0, ...rates.map((rate) => rate ?? 0)))
  // One grid for every row keeps the label, plot, and respondent columns aligned with the axis.
  const columns = cn(
    "grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1.5 sm:items-center",
    view === "batch" ? "sm:grid-cols-[3.5rem_minmax(0,1fr)_8.5rem]" : "sm:grid-cols-[11rem_minmax(0,1fr)_8.5rem]",
  )
  const gridlines = scale.ticks.slice(1, -1).map((tick) => (
    <span key={tick} aria-hidden="true" className="absolute inset-y-0 w-px bg-slate-100" style={{ left: `${(tick / scale.max) * 100}%` }} />
  ))

  return (
    <figure className="flex flex-col gap-2">
      <ul aria-label={title} className="flex flex-col gap-3 sm:gap-2">
        {rows.map((row, index) => {
          const rate = rates[index] ?? null
          const note = rowNote(row)
          const summary = `${row.label}: ${formatRespondents(row.responses, row.alumni)}, response rate ${formatRate(rate)}`
          return (
            <li key={row.key} aria-label={summary} title={summary} className={cn(columns, "rounded-md py-0.5 hover:bg-slate-50")}>
              <span className="truncate text-sm font-medium text-slate-800">{chartLabel(row, view)}</span>
              <span className="text-right text-xs text-slate-500 tabular-nums sm:order-last">
                {row.alumni === null ? `${row.responses.toLocaleString()} resp.` : `${row.responses.toLocaleString()} / ${row.alumni.toLocaleString()}`}
              </span>
              <div className="relative col-span-2 flex h-6 items-center sm:col-span-1">
                {gridlines}
                <span aria-hidden="true" className="absolute inset-y-0 left-0 w-px bg-slate-300" />
                {rate !== null && rate > 0 && (
                  <span
                    aria-hidden="true"
                    className="relative h-5 rounded-r-[4px] bg-indigo-500"
                    style={{ width: `${(rate / scale.max) * 100}%` }}
                  />
                )}
                <span className={cn("relative pl-2 text-xs tabular-nums whitespace-nowrap", rate === null ? "text-slate-400" : "font-semibold text-slate-900")}>
                  {rate === null ? note : formatRate(rate)}
                  {rate !== null && note && <span className="font-normal text-slate-400"> · {note}</span>}
                </span>
              </div>
            </li>
          )
        })}
      </ul>
      <div aria-hidden="true" className={columns}>
        <span className="hidden sm:block" />
        <span className="hidden sm:block sm:order-last" />
        <div className="relative col-span-2 h-4 sm:col-span-1">
          {scale.ticks.map((tick) => (
            <span
              key={tick}
              className={cn(
                "absolute top-0 text-[11px] text-slate-400 tabular-nums",
                tick === 0 ? "translate-x-0" : tick === scale.max ? "-translate-x-full" : "-translate-x-1/2",
              )}
              style={{ left: `${(tick / scale.max) * 100}%` }}
            >
              {tick}%
            </span>
          ))}
        </div>
      </div>
      <figcaption className="sr-only">
        {title}. Bars show respondents divided by registrar alumni on a 0 to {scale.max}% scale.
      </figcaption>
    </figure>
  )
}

/** Response rate (respondents ÷ registrar alumni) per batch or per college, under the active filters. */
export function ResponseRateBreakdown({
  coverage,
  view,
  onViewChange,
}: {
  coverage: ResponseCoverage
  view: ResponseRateView
  onViewChange: (view: ResponseRateView) => void
}) {
  const notes: string[] = []
  for (const { batch, alumni } of coverage.cohortsWithoutResponses) {
    notes.push(`Batch ${batch} has no responses yet, so its ${alumni.toLocaleString()} alumni are not counted in the overall and college rates.`)
  }
  if (coverage.respondentsWithoutAlumni > 0) {
    notes.push(
      `${coverage.respondentsWithoutAlumni.toLocaleString()} respondents are from batches with no alumni total, so they are not counted in the overall and college rates.`,
    )
  }
  const title = view === "batch" ? "Response rate by batch" : "Response rate by college"

  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
            <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">{title}</h4>
          <p className="text-xs text-slate-500">Respondents ÷ registrar alumni. The right column shows respondents / alumni.</p>
        </div>
        <div role="group" aria-label="Group response rates" className="flex items-center gap-1 rounded-lg border border-slate-200/60 bg-slate-100/80 p-1">
          {VIEWS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={view === option.value}
              onClick={() => onViewChange(option.value)}
              className={cn(
                "rounded-md border px-3 py-1 text-[12px] font-medium transition-all",
                view === option.value
                  ? "border-slate-200/50 bg-white text-slate-900 shadow-sm"
                  : "border-transparent text-slate-500 hover:bg-slate-200/50 hover:text-slate-700",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <RateBars title={title} rows={view === "batch" ? coverage.cohorts : coverage.colleges} view={view} />
      {notes.length > 0 && (
        <ul className="flex flex-col gap-1 border-t border-slate-100 pt-3 text-xs text-slate-500">
          {notes.map((note) => <li key={note}>{note}</li>)}
        </ul>
      )}
    </div>
  )
}
