import { parseCsvRows } from "@/lib/csv"
import { departmentDegrees } from "@/lib/degree-programs"

/**
 * Alumni population CSV contract (one row per degree program, one column per batch):
 *
 *   college,degree_program,2023,2024
 *   College of Nursing,Bachelor of Science in Nursing,74,54
 *
 * - `degree_program` is required and must match a questionnaire degree name (case-insensitive).
 * - `college` is optional and informational; the importer ignores it.
 * - Every other column header must be a four-digit batch year.
 * - A blank cell means "no registrar total" for that batch and program.
 */

/** Cell values keyed by batch year, then degree program. */
export type AlumniCountGrid = Record<string, Record<string, string>>

export interface AlumniCsvImport {
  batches: string[]
  grid: AlumniCountGrid
  totals: number
  errors: string[]
}

export const ALUMNI_CSV_MAX_BYTES = 256 * 1024
const MAX_ROWS = 500
const BATCH_PATTERN = /^\d{4}$/
const COUNT_PATTERN = /^(\d{1,7}|\d{1,3}(,\d{3}){1,2})$/

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase()
}

const degreeByName = new Map(
  Object.values(departmentDegrees).flat().map((degree) => [normalizeName(degree), degree]),
)

function csvField(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

/** Builds the import template: every degree program, one column per batch, prefilled from `grid`. */
export function buildAlumniCsv(batches: string[], grid: AlumniCountGrid): string {
  const columns = batches.length > 0 ? batches : [String(new Date().getFullYear())]
  const lines = [["college", "degree_program", ...columns].join(",")]
  for (const [college, degrees] of Object.entries(departmentDegrees)) {
    for (const degree of degrees) {
      const cells = columns.map((batch) => (grid[batch]?.[degree] ?? "").trim())
      lines.push([csvField(college), csvField(degree), ...cells].join(","))
    }
  }
  return `${lines.join("\r\n")}\r\n`
}

export function parseAlumniCsv(input: string): AlumniCsvImport {
  const parsed = parseCsvRows(input.replace(/^﻿/, ""))
  const errors = [...parsed.errors]
  const result: AlumniCsvImport = { batches: [], grid: {}, totals: 0, errors }
  const [header, ...rows] = parsed.rows
  if (!header) {
    errors.push("The file is empty. Use the template: college, degree_program, then one column per batch year.")
    return result
  }
  if (rows.length > MAX_ROWS) {
    errors.push(`The file has ${rows.length} rows. The limit is ${MAX_ROWS}.`)
    return result
  }

  let degreeColumn = -1
  const batchColumns: Array<{ index: number; batch: string }> = []
  header.values.forEach((raw, index) => {
    const name = raw.trim().toLowerCase()
    if (name === "degree_program") degreeColumn = index
    else if (name === "college" || name === "") return
    else if (BATCH_PATTERN.test(name)) {
      if (batchColumns.some((column) => column.batch === name)) errors.push(`Batch ${name} appears in more than one column.`)
      else batchColumns.push({ index, batch: name })
    } else errors.push(`Column "${raw.trim()}" is not "college", "degree_program", or a four-digit batch year.`)
  })
  if (degreeColumn === -1) errors.push('The header row needs a "degree_program" column.')
  if (batchColumns.length === 0) errors.push("The header row needs at least one batch year column, for example 2025.")
  if (errors.length > 0) return result

  const seen = new Set<string>()
  for (const row of rows) {
    const rawDegree = row.values[degreeColumn] ?? ""
    const degree = degreeByName.get(normalizeName(rawDegree))
    if (!degree) {
      errors.push(`Line ${row.line}: "${rawDegree.trim()}" is not a degree program in the questionnaire.`)
      continue
    }
    if (seen.has(degree)) {
      errors.push(`Line ${row.line}: "${degree}" appears more than once.`)
      continue
    }
    seen.add(degree)
    for (const { index, batch } of batchColumns) {
      const value = (row.values[index] ?? "").trim()
      if (value === "") continue
      if (!COUNT_PATTERN.test(value)) {
        errors.push(`Line ${row.line}, batch ${batch}: "${value}" is not a whole number.`)
        continue
      }
      result.grid[batch] = { ...result.grid[batch], [degree]: value.replace(/,/g, "") }
      result.totals += 1
    }
  }

  result.batches = batchColumns.map((column) => column.batch).sort()
  return result
}
