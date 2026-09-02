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

  it("preserves allowed configuration for optionless questions", () => {
    expect(normalizeQuestionStructure("text", ["stale option"], { survey_phase: 2, min: 1 })).toEqual({
      options: null,
      config: { survey_phase: 2 },
    })
    expect(normalizeQuestionStructure("number", null, { survey_phase: 1, min: 0, max: 100, step: 1 })).toEqual({
      options: null,
      config: { survey_phase: 1, min: 0, max: 100, step: 1 },
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

  it("accepts optionless questions carrying only allowed configuration", () => {
    expect(validateSurveyStructure([{
      title: "Valid",
      questions: [
        { type: "text", options: null, config: { survey_phase: 1, max_length: 200 } },
        { type: "number", options: null, config: { survey_phase: 2, min: 0, max: 100, integer: true, step: 1 } },
        { type: "datetime", options: null, config: { survey_phase: 1 } },
        { type: "boolean", options: null, config: { survey_phase: 2 } },
      ],
    }])).toBeNull()
  })

  it("rejects options on optionless questions", () => {
    expect(validateSurveyStructure([{
      title: "Bad",
      questions: [{ type: "text", options: ["A"], config: null }],
    }])).toContain("must not define options for text questions")
  })

  it("rejects unsupported configuration on optionless questions", () => {
    expect(validateSurveyStructure([{
      title: "Bad",
      questions: [{ type: "text", options: null, config: { survey_phase: 1, presentation: "dropdown" } }],
    }])).toContain("unsupported configuration for text questions")
  })
})
