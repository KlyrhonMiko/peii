import { describe, expect, it } from "vitest"

import { buildAlumniCsv, parseAlumniCsv } from "./alumni-csv"

const BSN = "Bachelor of Science in Nursing"
const BSIT = "Bachelor of Science in Information Technology"

describe("parseAlumniCsv", () => {
  it("reads the template layout and ignores the college column", () => {
    const result = parseAlumniCsv(
      "﻿college,degree_program,2024,2023\r\n" +
        `College of Nursing,${BSN},54,74\r\n` +
        `College of Computer Studies,"${BSIT.toUpperCase()}","1,120",\r\n`,
    )
    expect(result.errors).toEqual([])
    expect(result.batches).toEqual(["2023", "2024"])
    expect(result.totals).toBe(3)
    expect(result.grid).toEqual({
      "2023": { [BSN]: "74" },
      "2024": { [BSN]: "54", [BSIT]: "1120" },
    })
  })

  it("round-trips the downloaded template", () => {
    const csv = buildAlumniCsv(["2025"], { "2025": { [BSN]: "80" } })
    expect(csv.split("\r\n")[0]).toBe("college,degree_program,2025")
    const result = parseAlumniCsv(csv)
    expect(result.errors).toEqual([])
    expect(result.grid).toEqual({ "2025": { [BSN]: "80" } })
  })

  it("rejects unknown programs, duplicates, bad numbers, and bad headers", () => {
    expect(parseAlumniCsv(`degree_program,2025\nBS Astrology,1\n${BSN},1\n${BSN},2\n${BSIT},-4\n`).errors).toEqual([
      'Line 2: "BS Astrology" is not a degree program in the questionnaire.',
      `Line 4: "${BSN}" appears more than once.`,
      'Line 5, batch 2025: "-4" is not a whole number.',
    ])
    expect(parseAlumniCsv("program,2025\n").errors).toEqual([
      'Column "program" is not "college", "degree_program", or a four-digit batch year.',
      'The header row needs a "degree_program" column.',
    ])
    expect(parseAlumniCsv("degree_program,college\n").errors).toEqual([
      "The header row needs at least one batch year column, for example 2025.",
    ])
    expect(parseAlumniCsv("").errors).toHaveLength(1)
  })
})
