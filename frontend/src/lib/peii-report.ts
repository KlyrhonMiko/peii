import { responseRate, type RateRow, type ResponseCoverage } from "@/lib/alumni-counts"
import { departmentDegrees } from "@/lib/degree-programs"
import type { AggregateCell, PEIIAnalyticsResponse, PEIIDomainScore, SurveyResponseAggregate } from "@/lib/surveys"

/**
 * Builds the Chapter 3 report tables from live analytics. The dashboard "Data and method"
 * panels and the printable report both render these specs, so a figure and its table can
 * never disagree. Every note is generated from the data; none is copied from the paper.
 */

export interface ReportColumn {
  label: string
  align?: "left" | "right"
}

export interface ReportRow {
  cells: string[]
  kind?: "subtotal" | "total"
}

export interface ReportTable {
  id: ReportTableId
  title: string
  columns: ReportColumn[]
  rows: ReportRow[]
  /** What the table shows and where the data comes from, generated from the data. */
  note: string
  /** How the system computes the values, in plain words. */
  method?: string
  /** Set when a built-in consistency check fails, so readers do not trust a silent mismatch. */
  warning?: string
}

export type ReportTableId =
  | "profile"
  | "programs"
  | "batches"
  | "rate-batch"
  | "rate-college"
  | "feedback-entries"
  | "peii-batch"
  | "wlc"
  | "gain-batch"
  | "domain-improvement"
  | "income"
  | "channels"
  | "employment"
  | "sentiment"
  | "gain-sentiment"
  | "metrics"
  | "time-to-job"
  | "employment-type"
  | "stability"
  | "alignment"
  | "method-weights"
  | "method-tiers"
  | "method-index"
  | "method-targets"

export interface ReportFilters {
  batch: string
  department: string
  degree: string
}

export interface ReportInput {
  analytics: PEIIAnalyticsResponse
  coverage: ResponseCoverage | null
  filters: ReportFilters
}

/** Dashboard charts that the printable report reproduces as figures. */
export type ReportFigureId =
  | "rate-batch"
  | "rate-college"
  | "historical-trend"
  | "dimension-trend"
  | "domain-gain"
  | "income"
  | "channels"
  | "hiring-velocity"
  | "employment-quality"
  | "employment-stability"
  | "degree-alignment"
  | "feedback-sentiment"

/** A figure and the tables that hold its data, or tables on their own. */
export interface ReportBlock {
  figure?: { id: ReportFigureId; title: string }
  tables: ReportTable[]
}

export interface ReportSection {
  id: "profile" | "coverage" | "peii" | "employment" | "sentiment"
  title: string
  blocks: ReportBlock[]
}

/**
 * Institutional weights from the PLP Research Department (Chapter 2, Eq. 4). The backend
 * owns the live copy in `DOMAIN_WEIGHTS`; the WLC table re-adds the weighted gains and
 * warns when the total drifts from the API score.
 */
export const DIMENSION_WEIGHTS: Record<string, number> = {
  "Employability and Economic Mobility": 0.3,
  "Family Upliftment and Financial Stability": 0.25,
  "Personal Development and Life Quality": 0.2,
  "Civic Engagement and Community Contribution": 0.15,
  "Governance Trust and LGU Support Valuation": 0.1,
}

/** The cohort the Base-100 index divides by; the backend fixes it to Batch 2023. */
export const BASE_COHORT = "2023"

/** Chapter 2, Table 1: PEII Score Interpretation Framework. */
export const PEII_TIERS = [
  { range: "Below 0.00", label: "Negative Impact", description: "Indicates a decline in condition after graduation" },
  { range: "0.00 to below 0.50", label: "No to Very Low Improvement", description: "Minimal or no observable change" },
  { range: "0.50 to 1.00", label: "Slight Improvement", description: "Small but positive change in condition" },
  { range: "Above 1.00 to 2.00", label: "Moderate Improvement", description: "Clear and meaningful improvement" },
  { range: "Above 2.00 to 3.00", label: "High Improvement", description: "Strong and substantial improvement" },
  { range: "Above 3.00", label: "Exceptional Improvement (Rare)", description: "Near-maximum or extreme transformation" },
] as const

export function peiiTier(score: number): string {
  const rounded = Math.round(score * 100) / 100
  if (rounded < 0) return PEII_TIERS[0].label
  if (rounded < 0.5) return PEII_TIERS[1].label
  if (rounded <= 1) return PEII_TIERS[2].label
  if (rounded <= 2) return PEII_TIERS[3].label
  if (rounded <= 3) return PEII_TIERS[4].label
  return PEII_TIERS[5].label
}

/** Chapter 2, Table 2: Base-100 Index Interpretation Framework. */
export function indexInterpretation(index: number): string {
  const rounded = Math.round(index * 10) / 10
  if (rounded > 100) return "Higher average improvement than the base cohort"
  if (rounded < 100) return "Lower average improvement than the base cohort"
  return "Same level of impact as the base cohort"
}

/** Scope and Limitation: 70% below 100 graduates, 60% for 100 to 300, 50% above 300. */
export function responseTarget(graduates: number): number {
  if (graduates < 100) return 70
  if (graduates <= 300) return 60
  return 50
}

export function respondentsNeeded(graduates: number): number {
  return Math.ceil((graduates * responseTarget(graduates)) / 100)
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const int = (value: number) => value.toLocaleString("en-US")
const pct0 = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—")
const pct1 = (value: number | null) => (value === null ? "—" : `${value.toFixed(1)}%`)
const share = (part: number, whole: number) => `${pct0(part, whole)} (${int(part)})`
const mean2 = (value: number) => value.toFixed(2)
const signed2 = (value: number) => `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(2)}`
const plural = (count: number, one: string, many = `${one}s`) => `${int(count)} ${count === 1 ? one : many}`

export function formatGain(value: number) {
  return signed2(value)
}

/** Short description of the active filters, for captions and report headers. */
export function describeScope(filters: ReportFilters) {
  const parts = [filters.batch === "All Batches" ? "all batches" : `Batch ${filters.batch}`]
  if (filters.department !== "All Departments") parts.push(filters.department)
  if (filters.degree !== "All Degrees") parts.push(filters.degree)
  return parts.join(", ")
}

const gain = (domain: PEIIDomainScore) => domain.post_grad - domain.pre_grad

function sum(values: Iterable<number>) {
  let total = 0
  for (const value of values) total += value
  return total
}

function topEntry(distribution: Record<string, number> | null | undefined) {
  const entries = Object.entries(distribution ?? {}).filter(([, count]) => count > 0)
  entries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  return entries[0] ?? null
}

function collegeOf(program: string) {
  for (const [college, programs] of Object.entries(departmentDegrees)) {
    if (programs.includes(program.trim())) return college
  }
  return "Other programs"
}

function cellCount(aggregate: SurveyResponseAggregate | null | undefined, match: (value: string) => boolean) {
  return sum((aggregate?.cells ?? []).filter((cell) => match(String(cell.value).trim())).map((cell) => cell.count))
}

// ---------------------------------------------------------------------------
// Respondent profile
// ---------------------------------------------------------------------------

function profileTable({ analytics, filters }: ReportInput): ReportTable | null {
  const demographics = analytics.demographics
  if (!demographics || demographics.total_responses === 0) return null
  const total = demographics.total_responses
  const rows: ReportRow[] = [{ cells: ["Total responses", int(total)] }]

  const genders = Object.entries(demographics.gender_distribution).sort((a, b) => b[1] - a[1])
  for (const [gender, count] of genders) rows.push({ cells: [`${gender} respondents`, share(count, total)] })

  const firstGen = demographics.first_gen_distribution?.["Yes"]
  if (firstGen !== undefined) rows.push({ cells: ["First-generation college graduates", share(firstGen, total)] })

  const location = topEntry(demographics.location_distribution)
  if (location) rows.push({ cells: ["Top location", `${location[0]} (${plural(location[1], "respondent")})`] })
  const barangay = topEntry(demographics.barangay_distribution)
  if (barangay) rows.push({ cells: ["Top barangay", `Brgy. ${barangay[0]} (${plural(barangay[1], "respondent")})`] })
  const program = topEntry(demographics.department_distribution)
  if (program) rows.push({ cells: ["Top program", `${program[0]} (${plural(program[1], "respondent")})`] })

  return {
    id: "profile",
    title: "Demographic and Sample Profile of Respondents",
    columns: [{ label: "Category" }, { label: "Value", align: "right" }],
    rows,
    note: `Percentages are computed against the ${plural(total, "respondent")} in ${describeScope(filters)}.`,
    method: "Each value counts the respondents who gave that answer in the survey profile section. The top location, barangay, and program are the answers with the most respondents.",
  }
}

function programsTable({ analytics }: ReportInput): ReportTable | null {
  const demographics = analytics.demographics
  if (!demographics || demographics.total_responses === 0) return null
  const byProgram = demographics.department_distribution
  const byCollege = new Map<string, Array<[string, number]>>()
  for (const [program, count] of Object.entries(byProgram)) {
    if (count <= 0) continue
    const college = collegeOf(program)
    byCollege.set(college, [...(byCollege.get(college) ?? []), [program, count]])
  }
  const collegeOrder = [...Object.keys(departmentDegrees), "Other programs"]
  const rows: ReportRow[] = []
  for (const college of collegeOrder) {
    const programs = byCollege.get(college)
    if (!programs) continue
    programs.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    programs.forEach(([program, count], index) => rows.push({ cells: [index === 0 ? college : "", program, int(count)] }))
    if (programs.length > 1) rows.push({ cells: ["", "Subtotal", int(sum(programs.map(([, count]) => count)))], kind: "subtotal" })
  }
  const programTotal = sum(Object.values(byProgram))
  rows.push({ cells: ["Total", "", int(programTotal)], kind: "total" })

  const unrecorded = demographics.total_responses - programTotal
  return {
    id: "programs",
    title: "Respondents per College and Program",
    columns: [{ label: "College" }, { label: "Program" }, { label: "N", align: "right" }],
    rows,
    note:
      unrecorded === 0
        ? `Program counts sum to ${int(programTotal)}, matching the total responses.`
        : `Program counts sum to ${int(programTotal)}; ${plural(unrecorded, "respondent")} gave no program answer.`,
    method: "Programs are grouped under the college that offers them, using the same program list as the dashboard filters.",
  }
}

function batchesTable({ analytics }: ReportInput): ReportTable | null {
  const byBatch = analytics.demographics?.batch_distribution
  if (!byBatch || Object.keys(byBatch).length === 0) return null
  const batches = Object.keys(byBatch).sort()
  const total = sum(Object.values(byBatch))
  const responses = analytics.demographics?.total_responses ?? 0
  return {
    id: "batches",
    title: "Respondents per Batch",
    columns: [{ label: "Batch" }, { label: "N", align: "right" }],
    rows: [...batches.map((batch) => ({ cells: [batch, int(byBatch[batch] ?? 0)] })), { cells: ["Total", int(total)], kind: "total" }],
    note:
      total === responses
        ? `Batch totals sum to ${int(total)}, matching the total responses.`
        : `Batch totals sum to ${int(total)}; ${plural(responses - total, "respondent")} gave no batch answer.`,
  }
}

// ---------------------------------------------------------------------------
// Coverage
// ---------------------------------------------------------------------------

const TARGET_RULE =
  "The target is 70% for batches with fewer than 100 graduates, 60% for 100 to 300, and 50% for more than 300 (Scope and Limitation of the Study)."

function coveredCohorts(coverage: ResponseCoverage) {
  return coverage.cohorts.filter((row): row is RateRow & { alumni: number } => row.alumni !== null && row.responses > 0)
}

function rateByBatchTable({ coverage }: ReportInput): ReportTable | null {
  if (!coverage) return null
  const cohorts = coveredCohorts(coverage)
  if (cohorts.length === 0) return null
  const rows: ReportRow[] = cohorts.map((row) => [
    row.key,
    int(row.alumni),
    int(row.responses),
    pct1(responseRate(row.responses, row.alumni)),
    `${responseTarget(row.alumni)}%`,
    int(respondentsNeeded(row.alumni)),
  ]).map((cells) => ({ cells }))
  const graduates = sum(cohorts.map((row) => row.alumni))
  const respondents = sum(cohorts.map((row) => row.responses))
  if (cohorts.length > 1) {
    rows.push({
      cells: ["Total", int(graduates), int(respondents), pct1(responseRate(respondents, graduates)), "", int(sum(cohorts.map((row) => respondentsNeeded(row.alumni))))],
      kind: "total",
    })
  }

  const met = cohorts.filter((row) => row.responses >= respondentsNeeded(row.alumni)).length
  const notes = [
    met === cohorts.length
      ? `All ${plural(cohorts.length, "batch", "batches")} met their target.`
      : met === 0
        ? `No batch met its target.`
        : `${int(met)} of ${plural(cohorts.length, "batch", "batches")} met their target.`,
    TARGET_RULE,
  ]
  for (const { batch, alumni } of coverage.cohortsWithoutResponses) {
    notes.push(`Batch ${batch} (${int(alumni)} graduates) has no responses yet and is not included.`)
  }
  if (coverage.respondentsWithoutAlumni > 0) {
    notes.push(`${plural(coverage.respondentsWithoutAlumni, "respondent")} belong to batches with no stored graduate count and are not included.`)
  }
  return {
    id: "rate-batch",
    title: "Response Rate by Batch",
    columns: [
      { label: "Batch" },
      { label: "Graduates", align: "right" },
      { label: "Respondents", align: "right" },
      { label: "Response rate", align: "right" },
      { label: "Target", align: "right" },
      { label: "Needed at target", align: "right" },
    ],
    rows,
    note: notes.join(" "),
    method: "Response rate = respondents ÷ graduates × 100. Graduate counts are the registrar totals stored under Alumni population. \"Needed at target\" is graduates × target, rounded up.",
  }
}

function rateByCollegeTable({ coverage }: ReportInput): ReportTable | null {
  if (!coverage || coverage.alumni === null || coverage.colleges.length === 0) return null
  const graduates = sum(coverage.colleges.map((row) => row.alumni ?? 0))
  const respondents = sum(coverage.colleges.map((row) => row.responses))
  const rows: ReportRow[] = coverage.colleges.map((row) => ({
    cells: [
      row.label,
      row.alumni === null ? "—" : int(row.alumni),
      row.alumni === null ? "—" : pct1(graduates > 0 ? (row.alumni / graduates) * 100 : null),
      int(row.responses),
      pct1(respondents > 0 ? (row.responses / respondents) * 100 : null),
      pct1(responseRate(row.responses, row.alumni)),
    ],
  }))
  rows.push({ cells: ["Total", int(graduates), "100.0%", int(respondents), "100.0%", pct1(responseRate(respondents, graduates))], kind: "total" })

  const rated = coverage.colleges
    .map((row) => ({ row, rate: responseRate(row.responses, row.alumni) }))
    .filter((item): item is { row: RateRow; rate: number } => item.rate !== null)
  rated.sort((a, b) => a.rate - b.rate)
  const low = rated[0]
  const high = rated[rated.length - 1]
  const range = low && high && rated.length > 1
    ? `Response rates range from ${pct1(low.rate)} (${low.row.label}) to ${pct1(high.rate)} (${high.row.label}).`
    : ""
  return {
    id: "rate-college",
    title: "Graduates, Respondents, and Response Rate by College",
    columns: [
      { label: "College" },
      { label: "Graduates", align: "right" },
      { label: "% of graduates", align: "right" },
      { label: "Respondents", align: "right" },
      { label: "% of respondents", align: "right" },
      { label: "Response rate", align: "right" },
    ],
    rows,
    note: [range, "Only batches that have both responses and a stored graduate count are included."].filter(Boolean).join(" "),
    method: "Response rate = college respondents ÷ college graduates × 100. \"% of graduates\" and \"% of respondents\" show each college's share of the totals.",
  }
}

function feedbackEntriesTable({ analytics }: ReportInput): ReportTable | null {
  const classifications = analytics.feedback_classification?.classifications ?? []
  const placeholders = analytics.qualitative_feedback_placeholder_count ?? 0
  const submitted = analytics.qualitative_feedback_total
  if (classifications.length === 0 && submitted === 0) return null
  const entries = classifications
    .map((row) => ({ dimension: row.dimension, count: row.positive + row.neutral + row.negative }))
    .sort((a, b) => b.count - a.count || a.dimension.localeCompare(b.dimension))
  const classified = sum(entries.map((row) => row.count))
  const rows: ReportRow[] = entries.map((row) => ({ cells: [row.dimension, int(row.count)] }))
  rows.push({ cells: ["Placeholder or noise entries (excluded)", int(placeholders)] })
  rows.push({ cells: ["Total submitted entries", int(submitted)], kind: "total" })

  const balanced = classified + placeholders === submitted
  return {
    id: "feedback-entries",
    title: "Open-Ended Feedback Entries by Category",
    columns: [{ label: "Category" }, { label: "Entries", align: "right" }],
    rows,
    note: `Of ${plural(submitted, "submitted entry", "submitted entries")}, ${int(placeholders)} (${pct1(submitted > 0 ? (placeholders / submitted) * 100 : null)}) were placeholders or noise (for example "N/A", "none") and were removed before classification, leaving ${int(classified)} for sentiment analysis.`,
    method: "Each answer to an open-ended question is assigned to one PEII dimension by rule-based keyword and question mapping. Answers that match no dimension go to General Feedback.",
    ...(balanced ? {} : { warning: `Classified entries (${int(classified)}) plus placeholders (${int(placeholders)}) do not add up to the ${int(submitted)} submitted entries.` }),
  }
}

// ---------------------------------------------------------------------------
// Composite PEII
// ---------------------------------------------------------------------------

function peiiByBatchTable({ analytics }: ReportInput): ReportTable | null {
  const trend = analytics.historical_trend
  if (trend.length === 0) return null
  const base = analytics.baseline_result?.peii_score ?? trend.find((row) => row.batch_year === BASE_COHORT)?.peii_score ?? null
  const indexOf = (score: number) => (base !== null && base > 0 ? (score / base) * 100 : null)
  const rows: ReportRow[] = trend.map((row) => {
    const index = indexOf(row.peii_score)
    return { cells: [row.batch_year, signed2(row.peii_score), index === null ? "—" : index.toFixed(1), peiiTier(row.peii_score)] }
  })
  const overall = analytics.cohort_result
  if (trend.length > 1 && overall.domains.length > 0) {
    const index = overall.peii_index ?? indexOf(overall.peii_score)
    rows.push({ cells: ["All batches combined", signed2(overall.peii_score), index === null ? "—" : index.toFixed(1), peiiTier(overall.peii_score)], kind: "total" })
  }
  const notes = [
    base !== null && base > 0
      ? `Batch ${BASE_COHORT} is the base cohort (index 100).`
      : `Batch ${BASE_COHORT} has no score under these filters, so the index cannot be computed.`,
    "The index shows differences in average improvement, not causal effects.",
  ]
  return {
    id: "peii-batch",
    title: "Composite PEII Score and Base-100 Index by Batch",
    columns: [{ label: "Batch" }, { label: "PEII score", align: "right" }, { label: "Index", align: "right" }, { label: "Interpretation" }],
    rows,
    note: notes.join(" "),
    method: `PEII score = Σ (weight × gain) over the five dimensions (Eq. 3–4). Index = batch PEII ÷ Batch ${BASE_COHORT} PEII × 100 (Eq. 5). Interpretation follows the PEII Score Interpretation Framework.`,
  }
}

function wlcTable({ analytics, filters }: ReportInput): ReportTable | null {
  const domains = analytics.cohort_result.domains
  if (domains.length === 0) return null
  const rows: ReportRow[] = []
  let total = 0
  let unweighted = false
  for (const domain of domains) {
    const weight = DIMENSION_WEIGHTS[domain.dimension]
    if (weight === undefined) {
      unweighted = true
      continue
    }
    const contribution = weight * gain(domain)
    total += contribution
    rows.push({ cells: [domain.dimension, weight.toFixed(2), signed2(gain(domain)), signed2(contribution)] })
  }
  rows.push({ cells: ["PEII score", "1.00", "", signed2(total)], kind: "total" })
  const drift = Math.abs(total - analytics.cohort_result.peii_score)
  const warning = unweighted
    ? "A dimension returned by the API has no known weight, so this breakdown may be incomplete."
    : drift > 0.005
      ? `The weighted total (${signed2(total)}) differs from the system PEII score (${signed2(analytics.cohort_result.peii_score)}). The weights in the backend may have changed.`
      : undefined
  return {
    id: "wlc",
    title: "Weighted Linear Combination of Dimension Gains",
    columns: [{ label: "Dimension" }, { label: "Weight", align: "right" }, { label: "Gain", align: "right" }, { label: "Weight × gain", align: "right" }],
    rows,
    note: `The weighted gains add up to the composite PEII score of ${signed2(analytics.cohort_result.peii_score)} for ${describeScope(filters)} (${peiiTier(analytics.cohort_result.peii_score)}). Weights are set by the PLP Research Department.`,
    method: "Each gain is multiplied by its dimension weight, and the five products are added (Eq. 4: PEII = 0.30 G_E + 0.25 G_F + 0.20 G_P + 0.15 G_C + 0.10 G_G).",
    ...(warning ? { warning } : {}),
  }
}

function gainByBatchTable({ analytics }: ReportInput): ReportTable | null {
  const trend = analytics.historical_trend.filter((row) => (row.domains?.length ?? 0) > 0)
  if (trend.length === 0) return null
  const dimensions = analytics.cohort_result.domains.length > 0
    ? analytics.cohort_result.domains.map((domain) => domain.dimension)
    : (trend[0]?.domains ?? []).map((domain) => domain.dimension)
  const rows: ReportRow[] = dimensions.map((dimension) => ({
    cells: [
      dimension,
      ...trend.map((row) => {
        const domain = row.domains?.find((item) => item.dimension === dimension)
        return domain ? signed2(gain(domain)) : "—"
      }),
    ],
  }))
  return {
    id: "gain-batch",
    title: "Net Gain per Dimension by Batch",
    columns: [{ label: "Dimension" }, ...trend.map((row) => ({ label: row.batch_year, align: "right" as const }))],
    rows,
    note: "Values are gain scores (post-graduation mean minus pre-graduation mean) on a 1 to 5 scale. Batches with a PEII score of zero or below are not listed.",
    method: "For each batch, the pre- and post-graduation means of a dimension are computed separately, then subtracted (Eq. 2).",
  }
}

function domainImprovementTable({ analytics, filters }: ReportInput): ReportTable | null {
  const domains = analytics.cohort_result.domains
  if (domains.length === 0) return null
  const sorted = [...domains].sort((a, b) => gain(b) - gain(a))
  const highest = sorted[0]
  const lowest = sorted[sorted.length - 1]
  return {
    id: "domain-improvement",
    title: "Domain Improvement Scores",
    columns: [{ label: "Dimension" }, { label: "Pre", align: "right" }, { label: "Post", align: "right" }, { label: "Gain", align: "right" }],
    rows: sorted.map((domain) => ({ cells: [domain.dimension, mean2(domain.pre_grad), mean2(domain.post_grad), signed2(gain(domain))] })),
    note:
      highest && lowest && highest !== lowest
        ? `For ${describeScope(filters)}, ${highest.dimension} recorded the highest gain (${signed2(gain(highest))}) and ${lowest.dimension} the lowest (${signed2(gain(lowest))}).`
        : `Scores for ${describeScope(filters)}.`,
    method: "Pre and Post are the means of every 1 to 5 rating that respondents gave to the items of the dimension in that survey wave (Eq. 1). Gain = Post − Pre (Eq. 2).",
  }
}

// ---------------------------------------------------------------------------
// Employment outcomes
// ---------------------------------------------------------------------------

function distributionTable(
  id: "income" | "channels" | "time-to-job" | "employment-type" | "stability" | "alignment",
  title: string,
  label: string,
  aggregate: SurveyResponseAggregate | null | undefined,
  options: { order?: string[]; sortByCount?: boolean; labels?: Record<string, string>; headline?: (aggregate: SurveyResponseAggregate) => string; method?: string } = {},
): ReportTable | null {
  if (!aggregate || aggregate.total === 0) return null
  const cells = aggregate.cells.filter((cell) => cell.count > 0)
  const key = (value: AggregateCell["value"]) => String(value).replace(/\s+/g, " ").trim()
  if (options.order) {
    const order = options.order
    const rank = (value: string) => (order.includes(value) ? order.indexOf(value) : order.length)
    cells.sort((a, b) => rank(key(a.value)) - rank(key(b.value)))
  } else if (options.sortByCount) {
    cells.sort((a, b) => b.count - a.count)
  }
  const rows: ReportRow[] = cells.map((cell) => ({ cells: [options.labels?.[key(cell.value)] ?? key(cell.value), share(cell.count, aggregate.total)] }))
  rows.push({ cells: ["Total", share(aggregate.total, aggregate.total)], kind: "total" })
  const answered = `Percentages are computed against the ${plural(aggregate.total, "respondent")} who answered "${aggregate.question_text.trim()}"`
  return {
    id,
    title,
    columns: [{ label }, { label: "Share", align: "right" }],
    rows,
    note: options.headline ? `${options.headline(aggregate)} ${answered}` : answered,
    method: options.method ?? "Share = respondents who chose the option ÷ respondents who answered the question × 100.",
  }
}

const LIKERT_ORDER = ["Strongly Agree", "Agree", "Neutral", "Disagree", "Strongly Disagree"]
const INCOME_ORDER = ["Below ₱15,000", "₱15,001 – ₱25,000", "₱25,001 – ₱40,000", "₱40,001 – ₱60,000", "Above ₱60,000"]
const TIME_TO_JOB_LABELS: Record<string, string> = {
  "< 3 months": "Less than 3 months",
  "3-6 months": "3 to 6 months",
  "6-12 months": "6 to 12 months",
  "> 1 year": "More than 1 year",
  "Still unemployed": "Still seeking",
}

function largestCell(aggregate: SurveyResponseAggregate) {
  return [...aggregate.cells].sort((a, b) => b.count - a.count)[0]
}

function favorableHeadline(statement: string) {
  return (aggregate: SurveyResponseAggregate) => {
    const favorable = cellCount(aggregate, (value) => FAVORABLE.has(value))
    return `${share(favorable, aggregate.total)} agree or strongly agree that ${statement}; this is the "Favorable" figure in the ring.`
  }
}

const FAVORABLE_METHOD = "Favorable = (Strongly Agree + Agree) ÷ respondents who answered × 100. Each share is rounded on its own, so the two rounded shares may not add up exactly to the favorable figure."

function outcomeTables({ analytics }: ReportInput) {
  const outcomes = analytics.outcome_distributions
  return {
    income: distributionTable("income", "Monthly Income Distribution", "Income", outcomes.monthly_income, {
      order: INCOME_ORDER,
      headline: (aggregate) => {
        const modal = largestCell(aggregate)
        const above = cellCount(aggregate, (value) => INCOME_ORDER.indexOf(value) >= 2)
        return `The modal range is ${modal ? String(modal.value).trim() : "—"}. ${share(above, aggregate.total)} earn more than ₱25,000 a month.`
      },
      method: "Share = respondents in the income range ÷ respondents who answered × 100. \"Earning above ₱25K\" adds the three ranges above ₱25,000. The modal range is the range with the most respondents.",
    }),
    channels: distributionTable("channels", "First Job Acquisition Channels", "Channel", outcomes.job_search_channel, {
      sortByCount: true,
      headline: (aggregate) => {
        const top = largestCell(aggregate)
        return top ? `${String(top.value).replace(/\s+/g, " ").trim()} is the most common channel (${share(top.count, aggregate.total)}).` : ""
      },
      method: "Share = respondents who got their first job through the channel ÷ respondents who answered × 100. Bars are sorted from the most to the least common channel.",
    }),
    "time-to-job": distributionTable("time-to-job", "Time to First Job", "Time to first job", outcomes.time_to_first_job, {
      order: Object.keys(TIME_TO_JOB_LABELS),
      labels: TIME_TO_JOB_LABELS,
      headline: (aggregate) => {
        const within = cellCount(aggregate, (value) => value === "< 3 months" || value === "3-6 months")
        return `${share(within, aggregate.total)} found their first job within 6 months; this is the "Hired < 6 mo" figure in the ring.`
      },
      method: "Hired within 6 months = (less than 3 months + 3 to 6 months) ÷ respondents who answered × 100, computed from the counts before rounding.",
    }),
    "employment-type": distributionTable("employment-type", "Employment Type", "Employment type", outcomes.employment_type, {
      sortByCount: true,
      headline: (aggregate) => {
        const permanent = cellCount(aggregate, (value) => value.includes("Permanent"))
        return `${share(permanent, aggregate.total)} hold permanent employment; this is the "Permanent" figure in the ring.`
      },
    }),
    stability: distributionTable("stability", "Report Stable Employment", "Response", outcomes.employment_stability, {
      order: LIKERT_ORDER,
      headline: favorableHeadline("they have a stable source of income or employment"),
      method: FAVORABLE_METHOD,
    }),
    alignment: distributionTable("alignment", "Report Job Alignment with Degree", "Response", outcomes.degree_alignment, {
      order: LIKERT_ORDER,
      headline: favorableHeadline("their job is aligned with their degree"),
      method: FAVORABLE_METHOD,
    }),
  }
}

function metricsTable({ analytics, coverage, filters }: ReportInput): ReportTable | null {
  const demographics = analytics.demographics
  if (!demographics || demographics.total_responses === 0) return null
  const cohort = analytics.cohort_result
  const rows: ReportRow[] = [
    { cells: ["Total responses", int(demographics.total_responses), "Survey responses submitted within the selected filters."] },
  ]
  const rate = coverage ? responseRate(coverage.respondents, coverage.alumni) : null
  if (coverage && coverage.alumni !== null && rate !== null) {
    rows.push({
      cells: ["Response rate", `${pct1(rate)} (${int(coverage.respondents)} / ${int(coverage.alumni)})`, "Respondents ÷ registrar graduates × 100, for batches that have both."],
    })
  }
  if (cohort.domains.length > 0) {
    rows.push({ cells: ["PEII improvement score", `${signed2(cohort.peii_score)} (${peiiTier(cohort.peii_score)})`, "Sum of weight × gain over the five dimensions (Weighted Linear Combination)."] })
    if (cohort.peii_index !== null) {
      rows.push({ cells: ["Index vs baseline", cohort.peii_index.toFixed(1), `PEII score ÷ Batch ${BASE_COHORT} PEII score × 100.`] })
    }
    const sorted = [...cohort.domains].sort((a, b) => gain(b) - gain(a))
    const top = sorted[0]
    const bottom = sorted[sorted.length - 1]
    if (top) rows.push({ cells: ["Primary driver", `${top.dimension} (${signed2(gain(top))})`, "The dimension with the highest gain (post-graduation mean − pre-graduation mean)."] })
    if (bottom) rows.push({ cells: ["Needs attention", `${bottom.dimension} (${signed2(gain(bottom))})`, "The dimension with the lowest gain."] })
  }
  return {
    id: "metrics",
    title: "Key Metrics",
    columns: [{ label: "Metric" }, { label: "Value" }, { label: "How it is computed" }],
    rows,
    note: `Values are for ${describeScope(filters)}. The weighted breakdown of the PEII score is in the Domain Improvement data.`,
  }
}

const FAVORABLE = new Set(["Strongly Agree", "Agree"])

function employmentTable({ analytics }: ReportInput): ReportTable | null {
  const outcomes = analytics.outcome_distributions
  const rows: ReportRow[] = []
  const totals: number[] = []

  const time = outcomes.time_to_first_job
  if (time && time.total > 0) {
    totals.push(time.total)
    const within6 = cellCount(time, (value) => value === "< 3 months" || value === "3-6 months")
    rows.push({ cells: ["Hired within 6 months", share(within6, time.total)] })
    const labels: Record<string, string> = {
      "< 3 months": "Time to first job: less than 3 months",
      "3-6 months": "Time to first job: 3 to 6 months",
      "6-12 months": "Time to first job: 6 to 12 months",
      "> 1 year": "Time to first job: more than 1 year",
      "Still unemployed": "Still seeking",
    }
    for (const cell of time.cells) {
      const key = String(cell.value).trim()
      if (cell.count > 0) rows.push({ cells: [labels[key] ?? key, share(cell.count, time.total)] })
    }
  }
  const type = outcomes.employment_type
  if (type && type.total > 0) {
    totals.push(type.total)
    for (const cell of [...type.cells].sort((a, b) => b.count - a.count)) {
      if (cell.count > 0) rows.push({ cells: [`Employment type: ${String(cell.value).trim()}`, share(cell.count, type.total)] })
    }
  }
  for (const [aggregate, label] of [
    [outcomes.employment_stability, "Report stable employment (favorable)"],
    [outcomes.degree_alignment, "Report job alignment with degree (favorable)"],
  ] as const) {
    if (!aggregate || aggregate.total === 0) continue
    totals.push(aggregate.total)
    rows.push({ cells: [label, share(cellCount(aggregate, (value) => FAVORABLE.has(value)), aggregate.total)] })
  }
  if (rows.length === 0) return null
  const uniform = totals.every((total) => total === totals[0])
  return {
    id: "employment",
    title: "Employment Quality and Stability Indicators",
    columns: [{ label: "Indicator" }, { label: "Result", align: "right" }],
    rows,
    note: uniform && totals[0] !== undefined
      ? `All figures are based on ${plural(totals[0], "respondent")}.`
      : "Each figure uses the respondents who answered that question.",
    method: "\"Hired within 6 months\" adds the \"< 3 months\" and \"3-6 months\" answers. \"Favorable\" adds Strongly Agree and Agree.",
  }
}

// ---------------------------------------------------------------------------
// Sentiment
// ---------------------------------------------------------------------------

function sentimentTable({ analytics }: ReportInput): ReportTable | null {
  const classifications = analytics.feedback_classification?.classifications ?? []
  if (classifications.length === 0) return null
  const rows = classifications.map((row) => {
    const total = row.positive + row.neutral + row.negative
    return { cells: [row.dimension, pct0(row.positive, total), pct0(row.neutral, total), pct0(row.negative, total), int(total)] }
  })
  const largest = [...classifications].sort((a, b) => b.positive + b.neutral + b.negative - (a.positive + a.neutral + a.negative))[0]
  return {
    id: "sentiment",
    title: "Sentiment Distribution by Dimension",
    columns: [
      { label: "Dimension" },
      { label: "Positive", align: "right" },
      { label: "Neutral", align: "right" },
      { label: "Negative", align: "right" },
      { label: "Comments", align: "right" },
    ],
    rows,
    note: largest
      ? `${largest.dimension} received the most comments (${int(largest.positive + largest.neutral + largest.negative)}). Neutral entries are mostly objective suggestions and requests rather than praise or complaints.`
      : "",
    method: "Each mapped entry is classified as positive, neutral, or negative by the dost-asti/RoBERTa-tl-sentiment-analysis model. Researcher corrections in the feedback panel override the model label. Percentages are per dimension.",
  }
}

function gainSentimentTable({ analytics }: ReportInput): ReportTable | null {
  const domains = analytics.cohort_result.domains
  const classifications = analytics.feedback_classification?.classifications ?? []
  if (domains.length === 0 || classifications.length === 0) return null
  const rows = [...domains]
    .sort((a, b) => gain(b) - gain(a))
    .map((domain) => {
      const row = classifications.find((item) => item.dimension === domain.dimension)
      const total = row ? row.positive + row.neutral + row.negative : 0
      return {
        cells: [
          domain.dimension,
          signed2(gain(domain)),
          row ? pct0(row.positive, total) : "—",
          row ? pct0(row.neutral, total) : "—",
          row ? pct0(row.negative, total) : "—",
        ],
      }
    })
  return {
    id: "gain-sentiment",
    title: "Dimension Gain Scores and Sentiment Distribution",
    columns: [
      { label: "Dimension" },
      { label: "Gain", align: "right" },
      { label: "Positive", align: "right" },
      { label: "Neutral", align: "right" },
      { label: "Negative", align: "right" },
    ],
    rows,
    note: "Gain values come from the domain improvement scores; sentiment values come from the sentiment distribution. They are shown together without comparative claims. A dash means no feedback was mapped to that dimension.",
  }
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

const present = (tables: Array<ReportTable | null>) => tables.filter((table): table is ReportTable => table !== null)

export type ResultTableId = Exclude<ReportTableId, `method-${string}`>

/** Fills fields a partial or older API response may omit, as the dashboard page does. */
function withDefaults(analytics: PEIIAnalyticsResponse): PEIIAnalyticsResponse {
  const partial = analytics as Partial<PEIIAnalyticsResponse>
  return {
    ...analytics,
    historical_trend: partial.historical_trend ?? [],
    outcome_distributions: partial.outcome_distributions ?? { employment_stability: null, degree_alignment: null },
    cohort_result: {
      batch_year: partial.cohort_result?.batch_year ?? "",
      peii_score: partial.cohort_result?.peii_score ?? 0,
      peii_index: partial.cohort_result?.peii_index ?? null,
      domains: partial.cohort_result?.domains ?? [],
    },
    baseline_result: partial.baseline_result ?? null,
    demographics: partial.demographics ?? null,
    feedback_classification: partial.feedback_classification ?? null,
    qualitative_feedback_total: partial.qualitative_feedback_total ?? 0,
  }
}

export function buildReportTables(raw: ReportInput): Record<ResultTableId, ReportTable | null> {
  const input = { ...raw, analytics: withDefaults(raw.analytics) }
  return {
    profile: profileTable(input),
    programs: programsTable(input),
    batches: batchesTable(input),
    "rate-batch": rateByBatchTable(input),
    "rate-college": rateByCollegeTable(input),
    "feedback-entries": feedbackEntriesTable(input),
    "peii-batch": peiiByBatchTable(input),
    wlc: wlcTable(input),
    "gain-batch": gainByBatchTable(input),
    "domain-improvement": domainImprovementTable(input),
    ...outcomeTables(input),
    metrics: metricsTable(input),
    employment: employmentTable(input),
    sentiment: sentimentTable(input),
    "gain-sentiment": gainSentimentTable(input),
  }
}

/** Report sections in Chapter 3 order; empty sections are dropped. */
export function buildReportSections(input: ReportInput): ReportSection[] {
  const t = buildReportTables(input)
  // Trend lines need at least two batches; with one batch only the table is shown.
  const trend = (input.analytics.historical_trend ?? []).length > 1
  const block = (tables: Array<ReportTable | null>, figure?: ReportBlock["figure"]): ReportBlock | null => {
    const kept = present(tables)
    if (kept.length === 0) return null
    return figure ? { figure, tables: kept } : { tables: kept }
  }
  const blocks = (items: Array<ReportBlock | null>) => items.filter((item): item is ReportBlock => item !== null)
  const sections: ReportSection[] = [
    { id: "profile", title: "Respondent Profile", blocks: blocks([block([t.metrics]), block([t.profile, t.programs, t.batches])]) },
    {
      id: "coverage",
      title: "Graduate Outcome Monitoring and Data Collection Coverage",
      blocks: blocks([
        block([t["rate-batch"]], { id: "rate-batch", title: "Response Rate by Batch" }),
        block([t["rate-college"]], { id: "rate-college", title: "Response Rate by College" }),
        block([t["feedback-entries"]]),
      ]),
    },
    {
      id: "peii",
      title: "Composite PEII Scores",
      blocks: blocks([
        block([t["peii-batch"]], trend ? { id: "historical-trend", title: "Historical PEII Trend" } : undefined),
        block([t["gain-batch"]], trend ? { id: "dimension-trend", title: "Net Gain Score per Dimension by Batch" } : undefined),
        block([t["domain-improvement"], t.wlc], { id: "domain-gain", title: "Domain Improvement" }),
      ]),
    },
    {
      id: "employment",
      title: "Employment Outcomes",
      blocks: blocks([
        block([t.income], { id: "income", title: "Monthly Income Distribution of Respondents" }),
        block([t.channels], { id: "channels", title: "First Job Acquisition Channels" }),
        block([t["time-to-job"]], { id: "hiring-velocity", title: "Hiring Velocity and Absorption Speed" }),
        block([t["employment-type"]], { id: "employment-quality", title: "Employment Quality and Security" }),
        block([t.stability], { id: "employment-stability", title: "Employment Stability" }),
        block([t.alignment], { id: "degree-alignment", title: "Degree Alignment" }),
        block([t.employment]),
      ]),
    },
    {
      id: "sentiment",
      title: "Sentiment Distribution Across PEII Dimensions",
      blocks: blocks([
        block([t.sentiment], { id: "feedback-sentiment", title: "Feedback Sentiment Distribution" }),
        block([t["gain-sentiment"]]),
      ]),
    },
  ]
  return sections.filter((section) => section.blocks.length > 0)
}

// ---------------------------------------------------------------------------
// Method appendix (fixed by Chapter 2, not by the data)
// ---------------------------------------------------------------------------

export function methodTables(): ReportTable[] {
  return [
    {
      id: "method-weights",
      title: "Institutional Dimension Weights",
      columns: [{ label: "Dimension" }, { label: "Weight", align: "right" }],
      rows: [
        ...Object.entries(DIMENSION_WEIGHTS).map(([dimension, weight]) => ({ cells: [dimension, weight.toFixed(2)] })),
        { cells: ["Total", "1.00"], kind: "total" as const },
      ],
      note: "Weights were set by the PLP Research Department.",
    },
    {
      id: "method-tiers",
      title: "PEII Score Interpretation Framework",
      columns: [{ label: "PEII score" }, { label: "Interpretation" }, { label: "Description" }],
      rows: PEII_TIERS.map((tier) => ({ cells: [tier.range, tier.label, tier.description] })),
      note: "PEII scores reflect weighted composite change in graduate outcomes.",
    },
    {
      id: "method-index",
      title: "Base-100 Index Interpretation Framework",
      columns: [{ label: "Index score" }, { label: "Interpretation" }],
      rows: [
        { cells: ["100", "Same level of impact as the base cohort"] },
        { cells: ["> 100", "Higher average improvement than the base cohort"] },
        { cells: ["< 100", "Lower average improvement than the base cohort"] },
      ],
      note: `Batch ${BASE_COHORT} is the base cohort.`,
    },
    {
      id: "method-targets",
      title: "Response Rate Targets",
      columns: [{ label: "Batch size (graduates)" }, { label: "Target", align: "right" }],
      rows: [
        { cells: ["Fewer than 100", "70%"] },
        { cells: ["100 to 300", "60%"] },
        { cells: ["More than 300", "50%"] },
      ],
      note: "Targets come from the Scope and Limitation of the Study. Respondents needed = graduates × target, rounded up.",
    },
  ]
}
