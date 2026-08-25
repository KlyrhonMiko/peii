import { describe, expect, it } from "vitest"

import type { SurveyResponse, SurveyResponseAggregate, SurveyQuestion } from "./surveys"
import { buildAggregatePresentation, buildRawAggregate } from "./survey-aggregates"

const question = (type: string, options?: string[]): SurveyQuestion => ({
  id: "question-id",
  text: "Question",
  type,
  options,
})

const aggregate = (
  questionType: SurveyResponseAggregate["question_type"],
  cells: SurveyResponseAggregate["cells"],
): SurveyResponseAggregate => ({
  question_id: "question-id",
  question_text: "Question",
  question_type: questionType,
  total: 5,
  cells,
})

describe("buildAggregatePresentation", () => {
  it("labels boolean cells while retaining their counts", () => {
    expect(buildAggregatePresentation(
      aggregate("boolean", [
        { value: false, count: 5, rank: null, row: null },
        { value: true, count: 7, rank: null, row: null },
      ]),
      question("boolean"),
    )).toEqual({
      kind: "bars",
      total: 5,
      items: [
        { key: "false", label: "No", count: 5 },
        { key: "true", label: "Yes", count: 7 },
      ],
    })
  })

  it("groups ranking cells by rank instead of flattening option counts", () => {
    expect(buildAggregatePresentation(
      aggregate("ranking", [
        { value: "A", count: 5, rank: 1, row: null },
        { value: "B", count: 6, rank: 1, row: null },
        { value: "A", count: 8, rank: 2, row: null },
        { value: "B", count: 5, rank: 2, row: null },
      ]),
      question("ranking", ["A", "B"]),
    )).toEqual({
      kind: "ranking",
      total: 5,
      rows: [
        { rank: 1, cells: [{ key: "1:A", label: "A", count: 5 }, { key: "1:B", label: "B", count: 6 }] },
        { rank: 2, cells: [{ key: "2:A", label: "A", count: 8 }, { key: "2:B", label: "B", count: 5 }] },
      ],
    })
  })

  it("groups matrix cells by row and keeps each column", () => {
    expect(buildAggregatePresentation(
      aggregate("matrix", [
        { value: "Poor", count: 5, rank: null, row: "Teaching" },
        { value: "Good", count: 6, rank: null, row: "Teaching" },
        { value: "Poor", count: 7, rank: null, row: "Support" },
        { value: "Good", count: 8, rank: null, row: "Support" },
      ]),
      question("matrix", ["Teaching", "Support"]),
    )).toEqual({
      kind: "matrix",
      total: 5,
      rows: [
        { row: "Teaching", cells: [{ key: "Teaching:Poor", label: "Poor", count: 5 }, { key: "Teaching:Good", label: "Good", count: 6 }] },
        { row: "Support", cells: [{ key: "Support:Poor", label: "Poor", count: 7 }, { key: "Support:Good", label: "Good", count: 8 }] },
      ],
    })
  })

  it("keeps choice and scale cells as ordinary labeled bars", () => {
    expect(buildAggregatePresentation(
      aggregate("multiple_choice", [
        { value: "Email", count: 6, rank: null, row: null },
        { value: "Phone", count: 5, rank: null, row: null },
      ]),
      question("multiple_choice", ["Email", "Phone"]),
    )).toMatchObject({
      kind: "bars",
      items: [{ label: "Email", count: 6 }, { label: "Phone", count: 5 }],
    })

    expect(buildAggregatePresentation(
      aggregate("scale", [
        { value: 1, count: 5, rank: null, row: null },
        { value: 2, count: 6, rank: null, row: null },
      ]),
      { ...question("scale", ["Low", "High"]), config: { min: 1, max: 2 } },
    )).toMatchObject({
      kind: "bars",
      items: [{ label: "Low", count: 5 }, { label: "High", count: 6 }],
    })
  })

  it("returns an explicit empty state for an empty aggregate", () => {
    expect(buildAggregatePresentation(aggregate("single_choice", []), question("single_choice", ["A"]))).toEqual({
      kind: "empty",
      total: 5,
    })
  })

  it("keeps rank dimensions when a raw-response viewer has no aggregate capability", () => {
    const raw: SurveyResponse[] = [{
      id: "response-id",
      surveyId: "survey-id",
      distributionId: null,
      answers: { "question-id": ["B", "A"] },
      createdAt: "2026-01-01T00:00:00Z",
    }]
    const result = buildRawAggregate(question("ranking", ["A", "B"]), raw)

    expect(result?.cells).toEqual([
      { value: "A", count: 0, rank: 1, row: null },
      { value: "A", count: 1, rank: 2, row: null },
      { value: "B", count: 1, rank: 1, row: null },
      { value: "B", count: 0, rank: 2, row: null },
    ])
  })
})
