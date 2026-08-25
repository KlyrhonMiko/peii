import type { AggregateCell, SurveyQuestion, SurveyResponse, SurveyResponseAggregate } from "./surveys"

export interface AggregateDisplayItem {
  key: string
  label: string
  count: number
}

export type AggregatePresentation =
  | { kind: "bars"; total: number; items: AggregateDisplayItem[] }
  | { kind: "ranking"; total: number; rows: Array<{ rank: number; cells: AggregateDisplayItem[] }> }
  | { kind: "matrix"; total: number; rows: Array<{ row: string; cells: AggregateDisplayItem[] }> }
  | { kind: "empty"; total: number }

function displayLabel(value: AggregateCell["value"], questionType: string): string {
  if (questionType === "boolean" && typeof value === "boolean") return value ? "Yes" : "No"
  return String(value)
}

function itemFromCell(cell: AggregateCell, questionType: string, key: string): AggregateDisplayItem {
  return { key, label: displayLabel(cell.value, questionType), count: cell.count }
}

function scaleLabel(question: Pick<SurveyQuestion, "options" | "config">, value: AggregateCell["value"]): string | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null
  const minimum = typeof question.config?.min === "number" && Number.isInteger(question.config.min)
    ? question.config.min
    : 1
  return question.options?.[value - minimum] ?? null
}

export function buildAggregatePresentation(
  aggregate: SurveyResponseAggregate,
  question: Pick<SurveyQuestion, "type" | "options" | "config">,
): AggregatePresentation {
  if (aggregate.cells.length === 0) return { kind: "empty", total: aggregate.total }

  if (aggregate.question_type === "ranking" || question.type === "ranking") {
    const byRank = new Map<number, AggregateDisplayItem[]>()
    for (const cell of aggregate.cells) {
      if (cell.rank === null) continue
      const cells = byRank.get(cell.rank) ?? []
      cells.push(itemFromCell(cell, "ranking", `${cell.rank}:${String(cell.value)}`))
      byRank.set(cell.rank, cells)
    }
    const rows = [...byRank.entries()]
      .sort(([left], [right]) => left - right)
      .map(([rank, cells]) => ({ rank, cells }))
    return rows.length > 0 ? { kind: "ranking", total: aggregate.total, rows } : { kind: "empty", total: aggregate.total }
  }

  if (aggregate.question_type === "matrix" || question.type === "matrix") {
    const byRow = new Map<string, AggregateDisplayItem[]>()
    for (const cell of aggregate.cells) {
      if (cell.row === null) continue
      const cells = byRow.get(cell.row) ?? []
      cells.push(itemFromCell(cell, "matrix", `${cell.row}:${String(cell.value)}`))
      byRow.set(cell.row, cells)
    }
    const rows = [...byRow.entries()].map(([row, cells]) => ({ row, cells }))
    return rows.length > 0 ? { kind: "matrix", total: aggregate.total, rows } : { kind: "empty", total: aggregate.total }
  }

  const items = aggregate.cells.map((cell) => {
    const label = aggregate.question_type === "scale"
      ? scaleLabel(question, cell.value) ?? String(cell.value)
      : displayLabel(cell.value, aggregate.question_type)
    return { key: String(cell.value), label, count: cell.count }
  })
  return items.length > 0 ? { kind: "bars", total: aggregate.total, items } : { kind: "empty", total: aggregate.total }
}

function isBlankAnswer(answer: unknown): boolean {
  return answer === undefined || answer === null || answer === "" ||
    (Array.isArray(answer) && answer.length === 0) ||
    (typeof answer === "object" && answer !== null && !Array.isArray(answer) && Object.keys(answer).length === 0)
}

function optionsFor(question: Pick<SurveyQuestion, "options">): string[] {
  return (question.options ?? []).filter((option) => option.trim().length > 0)
}

function scaleBounds(question: Pick<SurveyQuestion, "options" | "config">): { min: number; max: number } {
  const min = question.config?.min
  const max = question.config?.max
  return typeof min === "number" && Number.isInteger(min) && typeof max === "number" &&
    Number.isInteger(max) && min < max
    ? { min, max }
    : { min: 1, max: question.options?.length ?? 4 }
}

export function buildRawAggregate(
  question: Pick<SurveyQuestion, "id" | "type" | "options" | "config">,
  responses: readonly SurveyResponse[],
): SurveyResponseAggregate | null {
  if (![
    "single_choice",
    "boolean",
    "multiple_choice",
    "scale",
    "ranking",
    "matrix",
  ].includes(question.type)) return null

  const answers = responses
    .map((response) => response.answers[question.id])
    .filter((answer) => !isBlankAnswer(answer))
  const options = optionsFor(question)
  const counts = new Map<string, number>()
  const increment = (key: string) => counts.set(key, (counts.get(key) ?? 0) + 1)
  const questionType = question.type as SurveyResponseAggregate["question_type"]

  for (const answer of answers) {
    if (question.type === "multiple_choice" && Array.isArray(answer)) {
      for (const value of answer) if (typeof value === "string") increment(`value:${value}`)
    } else if (question.type === "ranking" && Array.isArray(answer)) {
      for (const [rank, value] of answer.entries()) {
        if (typeof value === "string") increment(`rank:${rank + 1}:${value}`)
      }
    } else if (question.type === "matrix" && typeof answer === "object" && answer !== null && !Array.isArray(answer)) {
      for (const [row, value] of Object.entries(answer)) {
        if (typeof value === "string") increment(`row:${row}:${value}`)
      }
    } else if (question.type !== "multiple_choice" && question.type !== "ranking" && question.type !== "matrix") {
      increment(`value:${String(answer)}`)
    }
  }

  let cells: AggregateCell[]
  if (question.type === "boolean") {
    cells = [false, true].map((value) => ({ value, count: counts.get(`value:${value}`) ?? 0, rank: null, row: null }))
  } else if (question.type === "scale") {
    const { min, max } = scaleBounds(question)
    cells = Array.from({ length: Math.max(0, max - min + 1) }, (_, index) => {
      const value = min + index
      return { value, count: counts.get(`value:${value}`) ?? 0, rank: null, row: null }
    })
  } else if (question.type === "ranking") {
    cells = options.flatMap((option) => options.map((_, rank) => ({
      value: option,
      count: counts.get(`rank:${rank + 1}:${option}`) ?? 0,
      rank: rank + 1,
      row: null,
    })))
  } else if (question.type === "matrix") {
    const configuredColumns = question.config?.columns
    const columns = Array.isArray(configuredColumns)
      ? configuredColumns.filter((column): column is string => typeof column === "string" && column.trim().length > 0)
      : ["Poor", "Fair", "Good", "Excellent"]
    cells = options.flatMap((row) => columns.map((column) => ({
      value: column,
      count: counts.get(`row:${row}:${column}`) ?? 0,
      rank: null,
      row,
    })))
  } else {
    cells = options.map((option) => ({
      value: option,
      count: counts.get(`value:${option}`) ?? 0,
      rank: null,
      row: null,
    }))
  }

  return {
    question_id: question.id,
    question_text: "",
    question_type: questionType,
    total: answers.length,
    cells,
  }
}
