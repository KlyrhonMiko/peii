import { describe, expect, it } from "vitest"

import { responseCoverage, responseRate } from "./alumni-counts"
import { entriesFromGrid } from "@/components/AdminAlumniCounts"
import { departmentDegrees } from "@/lib/degree-programs"

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
  const nursing = "Bachelor of Science in Nursing"
  const bsit = "Bachelor of Science in Information Technology"
  const bscs = "Bachelor of Science in Computer Science"
  const knownZeros = Object.fromEntries(Object.values(departmentDegrees).flat().map((degree) => [degree, 0]))
  const alumni = {
    alumni_total: 3835,
    by_batch: { "2023": 1120, "2024": 730, "2025": 841, "2026": 1144 },
    by_batch_college: {
      "2023": { "College of Nursing": 1120 },
      "2024": { "College of Nursing": 730 },
      "2025": { "College of Nursing": 841 },
      "2026": { "College of Nursing": 1144 },
    },
    by_batch_degree: {
      "2023": { ...knownZeros, [nursing]: 1120 },
      "2024": { ...knownZeros, [nursing]: 730 },
      "2025": { ...knownZeros, [nursing]: 841 },
      "2026": { ...knownZeros, [nursing]: 1144 },
    },
  }

  it("counts only cohorts that have both responses and an alumni total", () => {
    const coverage = responseCoverage(
      { "2023": 38, "2024": 42, "2025": 41 },
      { "2023": { "College of Nursing": 38 }, "2024": { "College of Nursing": 42 }, "2025": { "College of Nursing": 41 } },
      alumni,
      { "2023": { [nursing]: 38 }, "2024": { [nursing]: 42 }, "2025": { [nursing]: 41 } },
    )
    expect(coverage.respondents).toBe(121)
    expect(coverage.alumni).toBe(2691)
    expect(coverage.cohortsWithoutResponses).toEqual([{ batch: "2026", alumni: 1144 }])
    expect(coverage.respondentsWithoutAlumni).toBe(0)
    expect(coverage.cohorts.map((row) => [row.key, row.responses, row.alumni])).toEqual([
      ["2023", 38, 1120],
      ["2024", 42, 730],
      ["2025", 41, 841],
      ["2026", 0, 1144],
    ])
    // Batch 2026 alumni sit outside the responding cohorts.
    expect(coverage.colleges).toEqual([
      { key: "College of Nursing", label: "College of Nursing", responses: 121, alumni: 2691, alumniComplete: true },
    ])
  })

  it("keeps respondent counts without rates when no alumni totals exist", () => {
    const coverage = responseCoverage({ "2023": 5 }, { "2023": { "College of Nursing": 5 } }, null)
    expect(coverage.alumni).toBeNull()
    expect(coverage.colleges).toEqual([
      { key: "College of Nursing", label: "College of Nursing", responses: 5, alumni: null, alumniComplete: false },
    ])
  })

  it("withholds same-college and cohort rates when a registrar program is blank", () => {
    const coverage = responseCoverage(
      { "2025": 20 },
      { "2025": { "College of Computer Studies": 20 } },
      {
        alumni_total: 100,
        by_batch: { "2025": 100 },
        by_batch_college: { "2025": { "College of Computer Studies": 100 } },
        by_batch_degree: { "2025": { [bsit]: 100 } },
      },
      { "2025": { [bsit]: 10, [bscs]: 10 } },
      { batch: "All Batches", department: "College of Computer Studies", degree: "All Degrees" },
    )
    expect(coverage.respondents).toBe(20)
    expect(coverage.alumni).toBeNull()
    expect(coverage.cohorts[0]).toMatchObject({ alumni: 100, alumniComplete: false })
    expect(coverage.colleges[0]).toMatchObject({ responses: 20, alumni: 100, alumniComplete: false })
  })

  it("requires unknown programs without respondents and accepts an explicit zero", () => {
    const totals = {
      alumni_total: 100,
      by_batch: { "2025": 100 },
      by_batch_college: { "2025": { "College of Computer Studies": 100 } },
      by_batch_degree: { "2025": { [bsit]: 100 } },
    }
    const filters = { batch: "2025", department: "College of Computer Studies", degree: "All Degrees" }
    expect(responseCoverage({ "2025": 10 }, { "2025": { "College of Computer Studies": 10 } }, totals, { "2025": { [bsit]: 10 } }, filters).alumni).toBeNull()
    const completeTotals = { ...totals, by_batch_degree: { "2025": { [bsit]: 100, [bscs]: 0 } } }
    expect(responseCoverage({ "2025": 10 }, { "2025": { "College of Computer Studies": 10 } }, completeTotals, { "2025": { [bsit]: 10 } }, filters).alumni).toBe(100)
  })

  it("withholds rates for unassigned or unknown respondent degrees even with a complete catalogue", () => {
    for (const degrees of [{ [nursing]: 3 }, { [nursing]: 3, Other: 2 }]) {
      expect(responseCoverage({ "2023": 5 }, { "2023": { "College of Nursing": 3 } }, alumni, { "2023": degrees }).alumni).toBeNull()
    }
  })

  it("uses the selected degree population without demanding totals for other programs", () => {
    const coverage = responseCoverage(
      { "2025": 10 }, { "2025": { "College of Computer Studies": 10 } },
      { alumni_total: 100, by_batch: { "2025": 100 }, by_batch_college: { "2025": { "College of Computer Studies": 100 } }, by_batch_degree: { "2025": { [bsit]: 100 } } },
      { "2025": { [bsit]: 10 } },
      { batch: "2025", department: "College of Computer Studies", degree: bsit },
    )
    expect(coverage.alumni).toBe(100)
    expect(coverage.colleges[0]?.alumniComplete).toBe(true)
  })
})
