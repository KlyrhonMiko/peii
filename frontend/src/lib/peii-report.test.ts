import { describe, expect, it } from "vitest"

import { responseCoverage, type AlumniTotals } from "./alumni-counts"
import {
  buildReportSections,
  buildReportTables,
  peiiTier,
  respondentsNeeded,
  responseTarget,
  type ReportInput,
  type ReportTable,
} from "./peii-report"
import type { PEIIAnalyticsResponse, PEIIDomainScore, SurveyResponseAggregate } from "./surveys"

// Inputs captured from the live PEII Survey (Batches 2023-2025). Expected values come from
// Chapter 3 of the capstone paper, which reports the same data.
const DIMENSIONS = [
  "Employability and Economic Mobility",
  "Family Upliftment and Financial Stability",
  "Personal Development and Life Quality",
  "Civic Engagement and Community Contribution",
  "Governance Trust and LGU Support Valuation",
]
const domains = (pairs: Array<[number, number]>): PEIIDomainScore[] =>
  pairs.map(([pre_grad, post_grad], index) => ({ dimension: DIMENSIONS[index] ?? "", pre_grad, post_grad }))

const batch2023 = domains([[3.34211, 3.98947], [2.86316, 3.78421], [3.59474, 4.09474], [3.56842, 3.93684], [4.02632, 4.2]])
const batch2024 = domains([[3.10952, 3.97143], [2.75238, 3.87619], [3.46667, 3.92857], [3.24286, 3.61905], [4.2619, 4.45714]])
const batch2025 = domains([[3.45366, 4.12683], [3.05366, 3.99024], [3.6878, 4.10244], [3.44878, 3.87805], [4.2, 4.52683]])
const allBatches = domains([[3.29917, 4.02975], [2.88926, 3.88595], [3.58182, 4.03967], [3.41488, 3.80661], [4.16694, 4.4]])

function aggregate(question_text: string, cells: Array<[string, number]>): SurveyResponseAggregate {
  return {
    question_id: question_text,
    question_text,
    question_type: "single_choice",
    total: cells.reduce((total, [, count]) => total + count, 0),
    cells: cells.map(([value, count]) => ({ value, count, rank: null, row: null })),
  }
}

const analytics: PEIIAnalyticsResponse = {
  cohort_result: { batch_year: "All Batches", domains: allBatches, peii_score: 0.6419835, peii_index: 107.516 },
  baseline_result: { batch_year: "2023", domains: batch2023, peii_score: 0.5971053, peii_index: 100 },
  historical_trend: [
    { batch_year: "2023", peii_score: 0.5971053, domains: batch2023 },
    { batch_year: "2024", peii_score: 0.7078571, domains: batch2024 },
    { batch_year: "2025", peii_score: 0.6160976, domains: batch2025 },
  ],
  demographics: {
    total_responses: 121,
    gender_distribution: { Female: 82, Male: 39 },
    location_distribution: { "Pasig City": 103, "NCR (Outside Pasig)": 8, "Outside NCR": 6, "Overseas / Abroad": 4 },
    department_distribution: {
      "Bachelor of Elementary Education": 6,
      "Bachelor of Science in Accountancy": 6,
      "Bachelor of Science in Business Administration - Major in Marketing Management": 16,
      "Bachelor of Science in Computer Science": 2,
      "Bachelor of Science in Electronics Engineering": 8,
      "Bachelor of Science in Entrepreneurship": 6,
      "Bachelor of Science in Hospitality Management": 11,
      "Bachelor of Science in Information Technology": 16,
      "Bachelor of Science in Nursing": 4,
      "Bachelor of Secondary Education - Major in English": 32,
      "Bachelor of Secondary Education - Major in Filipino": 10,
      "Bachelor of Secondary Education - Major in Mathematics": 4,
    },
    batch_distribution: { "2023": 38, "2024": 42, "2025": 41 },
    batch_college_distribution: {
      "2023": { "College of Hospitality Management": 4, "College of Business Administration": 7, "College of Education": 17, "College of Engineering": 2, "College of Computer Studies": 7, "College of Nursing": 1 },
      "2024": { "College of Education": 18, "College of Hospitality Management": 2, "College of Engineering": 3, "College of Computer Studies": 5, "College of Business Administration": 12, "College of Nursing": 2 },
      "2025": { "College of Education": 17, "College of Engineering": 3, "College of Hospitality Management": 5, "College of Computer Studies": 6, "College of Business Administration": 9, "College of Nursing": 1 },
    },
    first_gen_distribution: { No: 60, Yes: 61 },
    barangay_distribution: { Pinagbuhatan: 20, Maybunga: 17, Manggahan: 12 },
  },
  feedback_classification: {
    classifications: [
      { dimension: "Employability and Economic Mobility", positive: 13, neutral: 83, negative: 21 },
      { dimension: "Family Upliftment and Financial Stability", positive: 6, neutral: 0, negative: 0 },
      { dimension: "Personal Development and Life Quality", positive: 9, neutral: 38, negative: 5 },
      { dimension: "Civic Engagement and Community Contribution", positive: 4, neutral: 3, negative: 1 },
      { dimension: "Governance Trust and LGU Support Valuation", positive: 65, neutral: 0, negative: 3 },
      { dimension: "General Feedback", positive: 1, neutral: 22, negative: 3 },
    ],
  },
  qualitative_feedback: [],
  qualitative_feedback_total: 363,
  qualitative_feedback_truncated: false,
  qualitative_feedback_placeholder_count: 86,
  outcome_distributions: {
    employment_stability: aggregate("I have/had a stable source of income or employment.", [["Strongly Disagree", 2], ["Disagree", 3], ["Neutral", 27], ["Agree", 56], ["Strongly Agree", 33]]),
    degree_alignment: aggregate("My job/business is/was aligned with my college degree or skills.", [["Strongly Disagree", 6], ["Disagree", 5], ["Neutral", 24], ["Agree", 36], ["Strongly Agree", 50]]),
    monthly_income: aggregate("What is your monthly income range?", [["Below ₱15,000", 13], ["₱15,001 – ₱25,000", 57], ["₱25,001 – ₱40,000", 36], ["₱40,001 – ₱60,000", 11], ["Above ₱60,000", 4]]),
    time_to_first_job: aggregate("How long did it take to find your first job after graduation?", [["< 3 months", 71], ["3-6 months", 27], ["6-12 months", 15], ["> 1 year", 6], ["Still unemployed", 2]]),
    job_search_channel: aggregate("How did you obtain your first job?", [["Internship", 15], ["Referral", 30], ["Walk-In", 19], ["Online application", 46], ["Business  / self-employment", 2], ["Job Fair", 9]]),
    employment_type: aggregate("What type of employment do you have?", [["Contractual", 29], ["Permanent", 87], ["Freelance", 2], ["Project-based", 3]]),
  },
}

const alumni: AlumniTotals = {
  alumni_total: 2691,
  by_batch: { "2023": 1120, "2024": 730, "2025": 841 },
  by_batch_college: {
    "2023": { "College of Engineering": 14, "College of Nursing": 74, "College of Education": 138, "College of Computer Studies": 289, "College of Hospitality Management": 225, "College of Business Administration": 380 },
    "2024": { "College of Engineering": 15, "College of Nursing": 54, "College of Education": 101, "College of Computer Studies": 156, "College of Hospitality Management": 129, "College of Business Administration": 275 },
    "2025": { "College of Engineering": 22, "College of Nursing": 80, "College of Education": 119, "College of Computer Studies": 161, "College of Hospitality Management": 146, "College of Business Administration": 313 },
  },
}

const demographics = analytics.demographics!
const input: ReportInput = {
  analytics,
  coverage: responseCoverage(demographics.batch_distribution ?? {}, demographics.batch_college_distribution ?? {}, alumni),
  filters: { batch: "All Batches", department: "All Departments", degree: "All Degrees" },
}
const tables = buildReportTables(input)

function table(id: keyof typeof tables): ReportTable {
  const found = tables[id]
  if (!found) throw new Error(`Missing table ${id}`)
  return found
}
const row = (id: keyof typeof tables, label: string) => table(id).rows.find((item) => item.cells[0] === label)?.cells

describe("paper Chapter 3 tables from live analytics", () => {
  it("reproduces the respondent profile (Tables 4-6)", () => {
    expect(row("profile", "Female respondents")).toEqual(["Female respondents", "68% (82)"])
    expect(row("profile", "First-generation college graduates")).toEqual(["First-generation college graduates", "50% (61)"])
    expect(row("profile", "Top barangay")).toEqual(["Top barangay", "Brgy. Pinagbuhatan (20 respondents)"])
    expect(row("profile", "Top program")?.[1]).toBe("Bachelor of Secondary Education - Major in English (32 respondents)")
    const education = table("programs").rows.findIndex((item) => item.cells[0] === "College of Education")
    expect(table("programs").rows.slice(education).find((item) => item.kind === "subtotal")?.cells[2]).toBe("52")
    expect(table("programs").rows.at(-1)?.cells).toEqual(["Total", "", "121"])
    expect(table("batches").rows.map((item) => item.cells)).toEqual([["2023", "38"], ["2024", "42"], ["2025", "41"], ["Total", "121"]])
  })

  it("reproduces response rates and targets (Tables 7-8)", () => {
    expect(table("rate-batch").rows.map((item) => item.cells)).toEqual([
      ["2023", "1,120", "38", "3.4%", "50%", "560"],
      ["2024", "730", "42", "5.8%", "50%", "365"],
      ["2025", "841", "41", "4.9%", "50%", "421"],
      ["Total", "2,691", "121", "4.5%", "", "1,346"],
    ])
    expect(table("rate-batch").note).toMatch(/^No batch met its target\./)
    expect(row("rate-college", "College of Education")).toEqual(["College of Education", "358", "13.3%", "52", "43.0%", "14.5%"])
    expect(row("rate-college", "College of Engineering")).toEqual(["College of Engineering", "51", "1.9%", "8", "6.6%", "15.7%"])
    expect(table("rate-college").note).toContain("from 1.9% (College of Nursing) to 15.7% (College of Engineering)")
  })

  it("reproduces feedback entry counts (Table 9) and balances them", () => {
    expect(table("feedback-entries").rows.map((item) => item.cells[1])).toEqual(["117", "68", "52", "26", "8", "6", "86", "363"])
    expect(table("feedback-entries").warning).toBeUndefined()
    expect(table("feedback-entries").note).toContain("leaving 277 for sentiment analysis")
  })

  it("reproduces the composite PEII and Base-100 index", () => {
    expect(table("peii-batch").rows.map((item) => item.cells)).toEqual([
      ["2023", "+0.60", "100.0", "Slight Improvement"],
      ["2024", "+0.71", "118.5", "Slight Improvement"],
      ["2025", "+0.62", "103.2", "Slight Improvement"],
      ["All batches combined", "+0.64", "107.5", "Slight Improvement"],
    ])
    expect(table("wlc").rows.at(-1)?.cells).toEqual(["PEII score", "1.00", "", "+0.64"])
    expect(table("wlc").warning).toBeUndefined()
  })

  it("reproduces gains per batch and overall (Tables 10-11)", () => {
    expect(row("gain-batch", "Family Upliftment and Financial Stability")).toEqual(["Family Upliftment and Financial Stability", "+0.92", "+1.12", "+0.94"])
    expect(row("gain-batch", "Governance Trust and LGU Support Valuation")).toEqual(["Governance Trust and LGU Support Valuation", "+0.17", "+0.20", "+0.33"])
    expect(table("domain-improvement").rows.map((item) => item.cells)).toEqual([
      ["Family Upliftment and Financial Stability", "2.89", "3.89", "+1.00"],
      ["Employability and Economic Mobility", "3.30", "4.03", "+0.73"],
      ["Personal Development and Life Quality", "3.58", "4.04", "+0.46"],
      ["Civic Engagement and Community Contribution", "3.41", "3.81", "+0.39"],
      ["Governance Trust and LGU Support Valuation", "4.17", "4.40", "+0.23"],
    ])
  })

  it("reproduces employment outcomes (Tables 12-14)", () => {
    expect(table("income").rows.map((item) => item.cells[1])).toEqual(["11% (13)", "47% (57)", "30% (36)", "9% (11)", "3% (4)", "100% (121)"])
    expect(table("income").note).toMatch(/^The modal range is ₱15,001 – ₱25,000\. 42% \(51\) earn more than ₱25,000 a month\./)
    expect(table("channels").rows[0]?.cells).toEqual(["Online application", "38% (46)"])
    expect(row("channels", "Online application")).toEqual(["Online application", "38% (46)"])
    expect(row("channels", "Business / self-employment")).toEqual(["Business / self-employment", "2% (2)"])
    expect(row("employment", "Hired within 6 months")).toEqual(["Hired within 6 months", "81% (98)"])
    expect(row("employment", "Employment type: Permanent")).toEqual(["Employment type: Permanent", "72% (87)"])
    expect(row("employment", "Report stable employment (favorable)")).toEqual(["Report stable employment (favorable)", "74% (89)"])
    expect(row("employment", "Report job alignment with degree (favorable)")).toEqual(["Report job alignment with degree (favorable)", "71% (86)"])
  })

  it("explains each donut's ring figure from its own question (Figures 13-16)", () => {
    expect(table("time-to-job").rows.map((item) => item.cells[0])).toEqual(["Less than 3 months", "3 to 6 months", "6 to 12 months", "More than 1 year", "Still seeking", "Total"])
    expect(table("time-to-job").note).toMatch(/^81% \(98\) found their first job within 6 months/)
    expect(table("employment-type").note).toMatch(/^72% \(87\) hold permanent employment/)
    expect(table("stability").rows.map((item) => item.cells)).toEqual([
      ["Strongly Agree", "27% (33)"], ["Agree", "46% (56)"], ["Neutral", "22% (27)"], ["Disagree", "2% (3)"], ["Strongly Disagree", "2% (2)"], ["Total", "100% (121)"],
    ])
    expect(table("stability").note).toMatch(/^74% \(89\) agree or strongly agree/)
    expect(table("alignment").note).toMatch(/^71% \(86\) agree or strongly agree/)
  })

  it("lists the key metrics with how each is computed", () => {
    expect(table("metrics").rows.map((item) => item.cells.slice(0, 2))).toEqual([
      ["Total responses", "121"],
      ["Response rate", "4.5% (121 / 2,691)"],
      ["PEII improvement score", "+0.64 (Slight Improvement)"],
      ["Index vs baseline", "107.5"],
      ["Primary driver", "Family Upliftment and Financial Stability (+1.00)"],
      ["Needs attention", "Governance Trust and LGU Support Valuation (+0.23)"],
    ])
  })

  it("reproduces sentiment by dimension (Tables 15 and 17)", () => {
    expect(row("sentiment", "Employability and Economic Mobility")).toEqual(["Employability and Economic Mobility", "11%", "71%", "18%", "117"])
    expect(row("sentiment", "Governance Trust and LGU Support Valuation")).toEqual(["Governance Trust and LGU Support Valuation", "96%", "0%", "4%", "68"])
    expect(row("gain-sentiment", "Family Upliftment and Financial Stability")).toEqual(["Family Upliftment and Financial Stability", "+1.00", "100%", "0%", "0%"])
  })

  it("orders sections like Chapter 3", () => {
    const sections = buildReportSections(input)
    expect(sections.map((section) => section.id)).toEqual(["profile", "coverage", "peii", "employment", "sentiment"])
    expect(sections.flatMap((section) => section.blocks.map((block) => block.figure?.id).filter(Boolean))).toEqual([
      "rate-batch", "rate-college", "historical-trend", "dimension-trend", "domain-gain", "income", "channels",
      "hiring-velocity", "employment-quality", "employment-stability", "degree-alignment", "feedback-sentiment",
    ])
  })
})

describe("report rules", () => {
  it("sets response targets by cohort size and rounds the needed count up", () => {
    expect([99, 100, 300, 301].map(responseTarget)).toEqual([70, 60, 60, 50])
    expect(respondentsNeeded(841)).toBe(421)
    expect(respondentsNeeded(51)).toBe(36)
  })

  it("classifies PEII scores with the interpretation framework", () => {
    expect(peiiTier(-0.01)).toBe("Negative Impact")
    expect(peiiTier(0.49)).toBe("No to Very Low Improvement")
    expect(peiiTier(0.5)).toBe("Slight Improvement")
    expect(peiiTier(1)).toBe("Slight Improvement")
    expect(peiiTier(1.01)).toBe("Moderate Improvement")
    expect(peiiTier(3.5)).toBe("Exceptional Improvement (Rare)")
  })

  it("warns when the weighted total drifts from the API score", () => {
    const drifted = buildReportTables({ ...input, analytics: { ...analytics, cohort_result: { ...analytics.cohort_result, peii_score: 0.7 } } })
    expect(drifted.wlc?.warning).toMatch(/differs from the system PEII score/)
  })

  it("leaves the index blank when the base cohort is filtered out", () => {
    const filtered = buildReportTables({
      ...input,
      filters: { ...input.filters, batch: "2024" },
      analytics: { ...analytics, baseline_result: null, historical_trend: [{ batch_year: "2024", peii_score: 0.7078571, domains: batch2024 }] },
    })
    expect(filtered["peii-batch"]?.rows.map((item) => item.cells)).toEqual([["2024", "+0.71", "—", "Slight Improvement"]])
    expect(filtered["peii-batch"]?.note).toMatch(/Batch 2023 has no score under these filters/)
  })

  it("drops tables without data instead of printing empty ones", () => {
    const empty = buildReportSections({
      analytics: { ...analytics, demographics: null, historical_trend: [], feedback_classification: null, qualitative_feedback_total: 0, cohort_result: { batch_year: "x", domains: [], peii_score: 0, peii_index: null }, outcome_distributions: { employment_stability: null, degree_alignment: null } },
      coverage: null,
      filters: input.filters,
    })
    expect(empty).toEqual([])
  })
})
