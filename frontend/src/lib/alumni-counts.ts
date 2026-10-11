import { api } from "@/lib/api"
import { departmentDegrees } from "@/lib/degree-programs"

export interface AlumniCount {
  id: string
  batch_year: string
  degree_program: string
  total: number
  updated_at: string
}

export interface AlumniCountEntry {
  batch_year: string
  degree_program: string
  total: number
}

export interface AlumniTotalFilters {
  batch: string
  department: string
  degree: string
}

export async function listAlumniCounts(): Promise<AlumniCount[]> {
  const response = await api.get<AlumniCount[]>("/alumni-counts")
  return response.data ?? []
}

/** Replaces the full set of stored totals. Rows missing from `counts` are removed. */
export async function replaceAlumniCounts(counts: AlumniCountEntry[]): Promise<AlumniCount[]> {
  const response = await api.put<AlumniCount[]>("/alumni-counts", { counts })
  return response.data ?? []
}

/** Graduate totals for the dashboard filters, overall and per cohort and college. */
export interface AlumniTotals {
  /** Null when no stored count covers the filters. */
  alumni_total: number | null
  by_batch: Record<string, number>
  by_batch_college: Record<string, Record<string, number>>
}

export async function fetchAlumniTotals(filters: AlumniTotalFilters, signal?: AbortSignal): Promise<AlumniTotals | null> {
  const query = new URLSearchParams()
  if (filters.batch !== "All Batches") query.set("batch", filters.batch)
  if (filters.department !== "All Departments") query.set("department", filters.department)
  if (filters.degree !== "All Degrees") query.set("degree", filters.degree)
  const queryString = query.toString() ? `?${query.toString()}` : ""
  const response = await api.get<AlumniTotals>(
    `/alumni-counts/total${queryString}`,
    signal ? { signal } : {},
  )
  return response.data ?? null
}

/** Response rate as a percentage, or null when the alumni total is unknown or zero. */
export function responseRate(responses: number, alumniTotal: number | null): number | null {
  if (alumniTotal === null || alumniTotal <= 0) return null
  return (responses / alumniTotal) * 100
}

export interface RateRow {
  key: string
  label: string
  responses: number
  /** Null when no registrar total exists for this row. */
  alumni: number | null
}

export interface ResponseCoverage {
  /** Respondents in cohorts that have both responses and an alumni total. */
  respondents: number
  /** Alumni in those same cohorts; null when no cohort qualifies. */
  alumni: number | null
  cohorts: RateRow[]
  colleges: RateRow[]
  /** Cohorts with an alumni total but no responses; left out of the rates. */
  cohortsWithoutResponses: Array<{ batch: string; alumni: number }>
  /** Respondents whose cohort has no alumni total; left out of the rates. */
  respondentsWithoutAlumni: number
}

const COLLEGE_ORDER = [...Object.keys(departmentDegrees), "Other programs"]

function collegeRank(college: string) {
  const index = COLLEGE_ORDER.indexOf(college)
  return index === -1 ? COLLEGE_ORDER.length : index
}

function sumValues(values: Record<string, number> | undefined) {
  return Object.values(values ?? {}).reduce((total, value) => total + value, 0)
}

/**
 * Pairs respondents with registrar alumni so both sides cover the same cohorts. A cohort counts
 * toward the rates only when it has at least one response and an alumni total: a batch that has
 * not been surveyed yet would otherwise pull every rate down.
 */
export function responseCoverage(
  responsesByBatch: Record<string, number>,
  responsesByBatchCollege: Record<string, Record<string, number>>,
  alumni: AlumniTotals | null,
): ResponseCoverage {
  const alumniByBatch = alumni?.by_batch ?? {}
  const batches = Array.from(new Set([...Object.keys(responsesByBatch), ...Object.keys(alumniByBatch)])).sort()
  const covered = batches.filter((batch) => (responsesByBatch[batch] ?? 0) > 0 && alumniByBatch[batch] !== undefined)

  const cohorts = batches.map((batch) => ({
    key: batch,
    label: `Batch ${batch}`,
    responses: responsesByBatch[batch] ?? 0,
    alumni: alumniByBatch[batch] ?? null,
  }))

  const collegeBatches = covered.length > 0 ? covered : Object.keys(responsesByBatchCollege)
  const colleges = new Map<string, RateRow>()
  for (const batch of collegeBatches) {
    for (const [college, count] of Object.entries(responsesByBatchCollege[batch] ?? {})) {
      const row = colleges.get(college) ?? { key: college, label: college, responses: 0, alumni: null }
      row.responses += count
      colleges.set(college, row)
    }
    if (covered.length === 0) continue
    for (const [college, total] of Object.entries(alumni?.by_batch_college[batch] ?? {})) {
      const row = colleges.get(college) ?? { key: college, label: college, responses: 0, alumni: null }
      row.alumni = (row.alumni ?? 0) + total
      colleges.set(college, row)
    }
  }

  return {
    respondents: covered.reduce((total, batch) => total + (responsesByBatch[batch] ?? 0), 0),
    alumni: covered.length > 0 ? covered.reduce((total, batch) => total + (alumniByBatch[batch] ?? 0), 0) : null,
    cohorts,
    colleges: Array.from(colleges.values()).sort(
      (a, b) => collegeRank(a.key) - collegeRank(b.key) || a.key.localeCompare(b.key),
    ),
    cohortsWithoutResponses: batches
      .filter((batch) => (responsesByBatch[batch] ?? 0) === 0 && alumniByBatch[batch] !== undefined)
      .map((batch) => ({ batch, alumni: alumniByBatch[batch] ?? 0 })),
    respondentsWithoutAlumni: sumValues(responsesByBatch) - covered.reduce((total, batch) => total + (responsesByBatch[batch] ?? 0), 0),
  }
}
