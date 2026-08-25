import { describe, expect, it } from "vitest"

import {
  normalizeQuestionStructure,
  validateSurveyStructure,
} from "./survey-structure"

describe("normalizeQuestionStructure", () => {
  it("clears options when creating a text question", () => {
    expect(normalizeQuestionStructure("text", ["stale option"], { min: 1 })).toEqual({
      options: null,
      config: null,
    })
  })

  it("replaces blank or deleted choice options with valid defaults", () => {
    expect(normalizeQuestionStructure("single_choice", ["", "  "])).toEqual({
      options: ["Option 1", "Option 2"],
      config: null,
    })
  })

  it("normalizes matrix rows and columns independently", () => {
    expect(normalizeQuestionStructure("matrix", ["Row 1", ""], { columns: ["", "Agree"] })).toEqual({
      options: ["Row 1"],
      config: { columns: ["Agree"] },
    })
  })

  it("provides a valid scale configuration", () => {
    expect(normalizeQuestionStructure("scale", ["old"], { min: 5, max: 2 })).toEqual({
      options: null,
      config: { min: 1, max: 4, min_label: "", max_label: "" },
    })
  })
})

describe("validateSurveyStructure", () => {
  it("rejects blank and all-deleted option structures with actionable messages", () => {
    expect(validateSurveyStructure([{
      title: "Choices",
      questions: [{ type: "single_choice", options: ["", "  "], config: null }],
    }])).toContain("needs at least one non-blank option")

    expect(validateSurveyStructure([{
      title: "Matrix",
      questions: [{ type: "matrix", options: [], config: { columns: [] } }],
    }])).toContain("needs at least one non-blank row and column")
  })

  it("accepts normalized option and scale structures", () => {
    expect(validateSurveyStructure([{
      title: "Valid",
      questions: [
        { type: "single_choice", options: ["A", "B"], config: null },
        { type: "matrix", options: ["Row"], config: { columns: ["Poor", "Good"] } },
        { type: "scale", options: null, config: { min: 1, max: 4 } },
        { type: "text", options: null, config: null },
      ],
    }])).toBeNull()
  })
})
