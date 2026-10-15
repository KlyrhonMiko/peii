"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { ArrowLeft, FileDown, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { MethodAppendix } from "@/components/MethodAppendix"
import { ReportFigure } from "@/components/ReportFigure"
import { ReportTable } from "@/components/ReportTable"
import { Button } from "@/components/ui/button"
import { fetchAlumniTotals, responseCoverage, type AlumniTotals } from "@/lib/alumni-counts"
import {
  buildReportSections,
  describeScope,
  methodTables,
  type ReportFilters,
} from "@/lib/peii-report"
import { localDateStamp } from "@/lib/dates"
import { saveReportPdf } from "@/lib/report-pdf"
import { fetchPEII, fetchSurvey, type PEIIAnalyticsResponse } from "@/lib/surveys"

interface LoadedReport {
  title: string
  analytics: PEIIAnalyticsResponse
  alumni: AlumniTotals | null
  generatedAt: Date
}

const generatedFormat = new Intl.DateTimeFormat("en-PH", { dateStyle: "long", timeStyle: "short" })

/**
 * Print-first results report. The on-screen sheet is the printed page: the browser's
 * Save as PDF keeps real, selectable text and the same table layout.
 */
export function PrintableReport({
  surveyId,
  surveyCode,
  filters,
}: {
  /** Survey UUID used by the analytics endpoints. */
  surveyId: string
  /** Business survey code used by the survey detail endpoint, for the title. */
  surveyCode: string
  filters: ReportFilters
}) {
  const [report, setReport] = useState<LoadedReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      fetchSurvey(surveyCode),
      fetchPEII(surveyId, filters, controller.signal),
      // Registrar totals are optional; the coverage tables drop out without them.
      fetchAlumniTotals(filters, controller.signal).catch(() => null),
    ])
      .then(([survey, analytics, alumni]) => {
        // The code only supplies the title, so it must name the same survey as the data.
        if (survey.id !== surveyId) throw new Error("Survey code does not match the survey")
        setReport({ title: survey.title, analytics, alumni, generatedAt: new Date() })
        setError(null)
      })
      .catch(() => {
        if (!controller.signal.aborted) setError("The report data could not be loaded. Check your connection and try again.")
      })
    return () => controller.abort()
  }, [surveyId, surveyCode, filters, attempt])

  // Save as PDF names the file after the page title, so the title carries the date of saving.
  useEffect(() => {
    const title = () => { document.title = `PEII Printable Report - ${localDateStamp()}` }
    title()
    window.addEventListener("beforeprint", title)
    return () => window.removeEventListener("beforeprint", title)
  }, [])

  const { coverage, sections, appendixStart } = useMemo(() => {
    if (!report) return { coverage: null, sections: [], appendixStart: 1 }
    const demographics = report.analytics.demographics
    const coverage = demographics
      ? responseCoverage(demographics.batch_distribution ?? {}, demographics.batch_college_distribution ?? {}, report.alumni)
      : null
    // Figures and tables are numbered separately in reading order; tables continue into the appendix.
    let figureCount = 0
    let tableCount = 0
    const sections = buildReportSections({ analytics: report.analytics, coverage, filters }).map((section) => ({
      ...section,
      blocks: section.blocks.map((block) => ({
        figure: block.figure ? { ...block.figure, number: (figureCount += 1) } : null,
        tables: block.tables.map((table) => ({ table, number: (tableCount += 1) })),
      })),
    }))
    return { coverage, sections, appendixStart: tableCount + 1 }
  }, [report, filters])

  const dashboardHref = "/researcher/dashboard"
  const contentRef = useRef<HTMLDivElement>(null)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!report || !contentRef.current || saving) return
    setSaving(true)
    const fileName = `PEII Printable Report - ${localDateStamp()}.pdf`
    const footer = `PEII Printable Report · ${report.title} · ${describeScope(filters)}`
    try {
      await toast.promise(saveReportPdf(contentRef.current, fileName, footer), {
        loading: "Preparing the PDF…",
        success: `Saved ${fileName}`,
        error: "The PDF could not be created. Try again.",
      }).unwrap()
    } catch (saveError) {
      console.error("Failed to save the report PDF", saveError)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-6 print:gap-0">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={dashboardHref} />}>
          <ArrowLeft data-icon="inline-start" />
          Back to dashboard
        </Button>
        <div className="flex items-center gap-3">
          <Button size="sm" onClick={() => void handleSave()} disabled={!report || saving}>
            {saving ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <FileDown data-icon="inline-start" />}
            {saving ? "Preparing PDF…" : "Save as PDF"}
          </Button>
        </div>
      </div>

      <article className="mx-auto w-full max-w-[210mm] bg-white px-6 py-10 text-slate-900 shadow-sm ring-1 ring-slate-200 sm:px-[16mm] sm:py-[18mm] print:max-w-none print:p-0 print:shadow-none print:ring-0">
        {error ? (
          <div role="alert" className="flex flex-col items-center gap-4 py-24 text-center">
            <p className="text-sm text-slate-600">{error}</p>
            <Button variant="outline" size="sm" onClick={() => { setError(null); setAttempt((value) => value + 1) }}>
              Try again
            </Button>
          </div>
        ) : !report ? (
          <div className="flex items-center justify-center gap-2 py-24 text-sm text-slate-500">
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            Loading report data…
          </div>
        ) : (
          // Elements marked data-pdf-block are captured one by one into the PDF pages.
          <div ref={contentRef} className="flex flex-col gap-10">
            <header data-pdf-block="" className="flex flex-col gap-4 border-b border-slate-900 pb-6">
              <div className="flex flex-col gap-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Pasig Education Impact Index</p>
                <h1 className="text-2xl font-bold tracking-tight">Results Report</h1>
                <p className="text-base text-slate-700">{report.title}</p>
              </div>
              <dl className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-slate-500">Scope</dt>
                  <dd className="font-medium first-letter:uppercase">{describeScope(filters)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Respondents</dt>
                  <dd className="font-medium tabular-nums">{(report.analytics.demographics?.total_responses ?? 0).toLocaleString("en-US")}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Generated</dt>
                  <dd className="font-medium">{generatedFormat.format(report.generatedAt)}</dd>
                </div>
              </dl>
              <p className="text-xs leading-relaxed text-slate-600">
                All tables are computed from the survey responses stored in the PEII System at the time shown above, so
                they change when new responses arrive or the filters change. Each table states how its values are
                computed. Verbatim feedback is not printed, to protect respondent privacy. Model validation and system
                evaluation results are not included, because they come from human-labelled data and evaluator ratings
                outside the system.
              </p>
            </header>

            {sections.length === 0 ? (
              <p className="py-12 text-center text-sm text-slate-500">There are no responses for these filters.</p>
            ) : (
              sections.map((section) => (
                <section key={section.id} aria-labelledby={`report-section-${section.id}`} className="flex flex-col gap-8">
                  <h2 id={`report-section-${section.id}`} data-pdf-block="heading" className="break-after-avoid text-base font-bold">
                    {section.title}
                  </h2>
                  {section.blocks.map((block) => (
                    <div key={block.figure?.id ?? block.tables[0]?.table.id} className="flex flex-col gap-8">
                      {block.figure && (
                        <figure data-pdf-block="" className="flex break-inside-avoid flex-col gap-3">
                          <figcaption className="flex flex-col gap-0.5">
                            <span className="text-sm font-bold text-slate-900">Figure {block.figure.number}</span>
                            <span className="text-sm italic text-slate-700">{block.figure.title}</span>
                          </figcaption>
                          <div className="rounded-lg bg-[#fafafa] p-6 ring-1 ring-slate-100 print:p-4">
                            <ReportFigure id={block.figure.id} analytics={report.analytics} coverage={coverage} />
                          </div>
                          <p className="text-xs text-slate-600">
                            <span className="italic">Note.</span>{" "}
                            {block.tables.length === 1
                              ? `The data behind this figure is in Table ${block.tables[0]?.number}.`
                              : `The data behind this figure is in Tables ${block.tables.map((item) => item.number).join(" and ")}.`}
                          </p>
                        </figure>
                      )}
                      {block.tables.map(({ table, number }) => (
                        <ReportTable key={table.id} table={table} number={number} variant="print" />
                      ))}
                    </div>
                  ))}
                </section>
              ))
            )}

            <section aria-labelledby="report-section-method" className="flex flex-col gap-8 border-t border-slate-200 pt-8 print:break-before-page print:border-0 print:pt-0">
              <div data-pdf-block="heading" data-pdf-break-before="" className="flex flex-col gap-1">
                <h2 id="report-section-method" className="text-base font-bold">Appendix: How the System Computes the Figures</h2>
                <p className="text-xs text-slate-600">From Chapter 2, Algorithm Discussion, of the PEII study.</p>
              </div>
              <MethodAppendix />
              {methodTables().map((table, index) => (
                <ReportTable key={table.id} table={table} number={appendixStart + index} variant="print" />
              ))}
            </section>
          </div>
        )}
      </article>
    </div>
  )
}
