import { describe, expect, it } from "vitest"

import { responseCoverage, responseRate } from "./alumni-counts"
import { entriesFromGrid } from "@/components/AdminAlumniCounts"

describe("responseRate", () => {
  it("divides responses by the alumni total", () => {
    expect(responseRate(412, 3835)).toBeCloseTo(10.743, 2)
  })

  it("returns null when the alumni total is unknown or zero", () => {
    expect(responseRate(412, null)).toBeNull()
    expect(responseRate(412, 0)).toBeNull()
  })
})

describe("entriesFromGrid", () => {
  it("skips blank cells and keeps batch order", () => {
    expect(
      entriesFromGrid(["2024", "2025"], {
        "2024": { "Bachelor of Science in Nursing": "54", "Bachelor of Science in Accountancy": " " },
        "2025": { "Bachelor of Science in Nursing": " 80 " },
      }),
    ).toEqual([
      { batch_year: "2024", degree_program: "Bachelor of Science in Nursing", total: 54 },
      { batch_year: "2025", degree_program: "Bachelor of Science in Nursing", total: 80 },
    ])
  })

  it("rejects cells that are not whole numbers", () => {
    expect(entriesFromGrid(["2025"], { "2025": { "Bachelor of Science in Nursing": "8.5" } })).toBeNull()
    expect(entriesFromGrid(["2025"], { "2025": { "Bachelor of Science in Nursing": "-3" } })).toBeNull()
  })

  it("drops columns for removed batches", () => {
    expect(entriesFromGrid([], { "2025": { "Bachelor of Science in Nursing": "80" } })).toEqual([])
  })
})

describe("responseCoverage", () => {
  const alumni = {
    alumni_total: 3835,
    by_batch: { "2023": 1120, "2024": 730, "2025": 841, "2026": 1144 },
    by_batch_college: {
      "2023": { "College of Nursing": 74 },
      "2026": { "College of Nursing": 120 },
    },
  }

  it("counts only cohorts that have both responses and an alumni total", () => {
    const coverage = responseCoverage(
      { "2023": 38, "2024": 42, "2025": 41, "2022": 3 },
      { "2023": { "College of Nursing": 4 }, "2022": { "College of Nursing": 3 } },
      alumni,
    )
    expect(coverage.respondents).toBe(121)
    expect(coverage.alumni).toBe(2691)
    expect(coverage.cohortsWithoutResponses).toEqual([{ batch: "2026", alumni: 1144 }])
    expect(coverage.respondentsWithoutAlumni).toBe(3)
    expect(coverage.cohorts.map((row) => [row.key, row.responses, row.alumni])).toEqual([
      ["2022", 3, null],
      ["2023", 38, 1120],
      ["2024", 42, 730],
      ["2025", 41, 841],
      ["2026", 0, 1144],
    ])
    // Nursing 2022 respondents and 2026 alumni sit outside the covered cohorts.
    expect(coverage.colleges).toEqual([
      { key: "College of Nursing", label: "College of Nursing", responses: 4, alumni: 74 },
    ])
  })

  it("keeps respondent counts without rates when no alumni totals exist", () => {
    const coverage = responseCoverage({ "2023": 5 }, { "2023": { "College of Nursing": 5 } }, null)
    expect(coverage.alumni).toBeNull()
    expect(coverage.colleges).toEqual([
      { key: "College of Nursing", label: "College of Nursing", responses: 5, alumni: null },
    ])
  })
})
