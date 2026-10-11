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
  by_batch_degree: Record<string, Record<string, number>>
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
  /** Recorded registrar subtotal; a partial subtotal is not a rate denominator. */
  alumni: number | null
  alumniComplete: boolean
}

export interface ResponseCoverage {
  /** All respondents in the selected cohorts, including those with unknown populations. */
  respondents: number
  /** Alumni in responding cohorts; null unless every selected program is known. */
  alumni: number | null
  cohorts: RateRow[]
  colleges: RateRow[]
  /** Cohorts with an alumni total but no responses; left out of the rates. */
  cohortsWithoutResponses: Array<{ batch: string; alumni: number }>
  /** Respondents in cohorts with incomplete population or degree coverage. */
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
 * Rates require explicit registrar totals for every selected catalogue program, including
 * programs without respondents. Blank totals and unassigned degrees keep rates unknown.
 * Batches without responses remain outside overall and college denominators.
 */
export function responseCoverage(
  responsesByBatch: Record<string, number>,
  responsesByBatchCollege: Record<string, Record<string, number>>,
  alumni: AlumniTotals | null,
  responsesByBatchDegree: Record<string, Record<string, number>> = {},
  filters: AlumniTotalFilters = { batch: "All Batches", department: "All Departments", degree: "All Degrees" },
): ResponseCoverage {
  const alumniByBatch = alumni?.by_batch ?? {}
  const alumniByDegree = alumni?.by_batch_degree ?? {}
  const departmentPrograms = filters.department === "All Departments"
    ? Object.values(departmentDegrees).flat()
    : departmentDegrees[filters.department] ?? []
  const requiredPrograms = filters.degree === "All Degrees"
    ? departmentPrograms
    : departmentPrograms.filter((degree) => degree === filters.degree)
  const requiredSet = new Set(requiredPrograms)
  const batches = Array.from(new Set([...Object.keys(responsesByBatch), ...Object.keys(alumniByBatch)])).sort()
  const respondingBatches = batches.filter((batch) => (responsesByBatch[batch] ?? 0) > 0)
  const degreesAccountedFor = (batch: string) => sumValues(responsesByBatchDegree[batch]) === (responsesByBatch[batch] ?? 0)
  const populationKeysKnown = (batch: string) => Object.keys(alumniByDegree[batch] ?? {}).every((degree) => requiredSet.has(degree))
  const batchComplete = (batch: string) => requiredPrograms.length > 0
    && requiredPrograms.every((degree) => alumniByDegree[batch]?.[degree] !== undefined)
    && populationKeysKnown(batch)
    && degreesAccountedFor(batch)
    && Object.keys(responsesByBatchDegree[batch] ?? {}).every((degree) => requiredSet.has(degree))

  const cohorts = batches.map((batch) => ({
    key: batch,
    label: `Batch ${batch}`,
    responses: responsesByBatch[batch] ?? 0,
    alumni: alumniByBatch[batch] ?? null,
    alumniComplete: batchComplete(batch),
  }))

  const colleges = new Map<string, RateRow>()
  for (const batch of respondingBatches) {
    for (const [college, count] of Object.entries(responsesByBatchCollege[batch] ?? {})) {
      const row = colleges.get(college) ?? { key: college, label: college, responses: 0, alumni: null, alumniComplete: false }
      row.responses += count
      colleges.set(college, row)
    }
    for (const [college, total] of Object.entries(alumni?.by_batch_college[batch] ?? {})) {
      const row = colleges.get(college) ?? { key: college, label: college, responses: 0, alumni: null, alumniComplete: false }
      row.alumni = (row.alumni ?? 0) + total
      colleges.set(college, row)
    }
  }
  for (const row of colleges.values()) {
    const programs = (departmentDegrees[row.key] ?? []).filter((degree) => requiredSet.has(degree))
    row.alumniComplete = programs.length > 0 && respondingBatches.every((batch) =>
      programs.every((degree) => alumniByDegree[batch]?.[degree] !== undefined)
      && populationKeysKnown(batch)
      && degreesAccountedFor(batch)
      && programs.reduce((total, degree) => total + (responsesByBatchDegree[batch]?.[degree] ?? 0), 0)
        === (responsesByBatchCollege[batch]?.[row.key] ?? 0),
    )
  }

  return {
    respondents: sumValues(responsesByBatch),
    alumni: respondingBatches.length > 0 && respondingBatches.every(batchComplete)
      ? respondingBatches.reduce((total, batch) => total + (alumniByBatch[batch] ?? 0), 0)
      : null,
    cohorts,
    colleges: Array.from(colleges.values()).sort(
      (a, b) => collegeRank(a.key) - collegeRank(b.key) || a.key.localeCompare(b.key),
    ),
    cohortsWithoutResponses: batches
      .filter((batch) => (responsesByBatch[batch] ?? 0) === 0 && alumniByBatch[batch] !== undefined)
      .map((batch) => ({ batch, alumni: alumniByBatch[batch] ?? 0 })),
    respondentsWithoutAlumni: respondingBatches
      .filter((batch) => !batchComplete(batch))
      .reduce((total, batch) => total + (responsesByBatch[batch] ?? 0), 0),
  }
}
