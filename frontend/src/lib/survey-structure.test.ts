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

  it("preserves generated questionnaire choice conditions when options are edited", () => {
    const config = {
      survey_phase: 2,
      question_key: "job_category",
      presentation: "dropdown",
      options_by_answer: { question_key: "job_industry", choices: { Accounting: ["Audit"] } },
      min: 0,
    }
    expect(normalizeQuestionStructure("single_choice", ["Audit"], config)).toEqual({
      options: ["Audit"],
      config: {
        survey_phase: 2,
        question_key: "job_category",
        presentation: "dropdown",
        options_by_answer: { question_key: "job_industry", choices: { Accounting: ["Audit"] } },
      },
    })
  })

  it("preserves the saved template version when its consent choices are edited", () => {
    expect(normalizeQuestionStructure("single_choice", ["Yes", "No"], {
      survey_phase: 1,
      template_definition_version: "survey-questionnaire-2026-09-16",
    })).toEqual({
      options: ["Yes", "No"],
      config: {
        survey_phase: 1,
        template_definition_version: "survey-questionnaire-2026-09-16",
      },
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
    expect(normalizeQuestionStructure("scale", null, { min: 1, max: 5, survey_phase: 2 })).toEqual({
      options: null,
      config: { min: 1, max: 5, min_label: "", max_label: "", survey_phase: 2 },
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
        { type: "single_choice", options: ["Pasig City", "Outside Pasig"], config: { question_key: "current_location", survey_phase: 1 } },
        { type: "text", options: null, config: { survey_phase: 1, visible_when: { question_key: "current_location", equals: "Pasig City" } } },
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

  it("rejects dependent choices that are no longer in the question options", () => {
    expect(validateSurveyStructure([{
      title: "Employment",
      questions: [
        { type: "single_choice", options: ["Education"], config: { question_key: "job_industry" } },
        {
          type: "single_choice", options: ["Audit"],
          config: {
            question_key: "job_category",
            options_by_answer: {
              question_key: "job_industry",
              choices: { Education: ["Teaching"] },
            },
          },
        },
      ],
    }])).toContain("invalid dependent choices")
  })

  it("rejects conditional dependencies when the source is missing, duplicated, or later", () => {
    expect(validateSurveyStructure([{
      title: "Employment",
      questions: [{
        type: "single_choice",
        options: ["Audit"],
        config: { options_by_answer: { question_key: "job_industry", choices: { Accounting: ["Audit"] } } },
      }],
    }])).toContain("missing conditional source")

    expect(validateSurveyStructure([{
      title: "Employment",
      questions: [
        { type: "single_choice", options: ["A"], config: { question_key: "job_industry" } },
        { type: "single_choice", options: ["B"], config: { question_key: "job_industry" } },
      ],
    }])).toContain("duplicate question_key")

    expect(validateSurveyStructure([{
      title: "Employment",
      questions: [
        {
          type: "single_choice",
          options: ["Audit"],
          config: { options_by_answer: { question_key: "job_industry", choices: { Accounting: ["Audit"] } } },
        },
        { type: "single_choice", options: ["Accounting"], config: { question_key: "job_industry" } },
      ],
    }])).toContain("earlier conditional source")
  })

  it("requires conditional map keys to match source options but permits partial maps", () => {
    expect(validateSurveyStructure([{
      title: "Employment",
      questions: [
        { type: "single_choice", options: ["Accounting", "Technology"], config: { question_key: "job_industry" } },
        {
          type: "single_choice",
          options: ["Audit", "Software"],
          config: {
            options_by_answer: {
              question_key: "job_industry",
              choices: { Technology: ["Software"] },
            },
          },
        },
      ],
    }])).toBeNull()

    expect(validateSurveyStructure([{
      title: "Employment",
      questions: [
        { type: "single_choice", options: ["Accounting"], config: { question_key: "job_industry" } },
        {
          type: "single_choice",
          options: ["Audit"],
          config: {
            options_by_answer: {
              question_key: "job_industry",
              choices: { Technology: ["Audit"] },
            },
          },
        },
      ],
    }])).toContain("unknown source answer")
  })

  it("rejects source questions from another phase but keeps permissive visibility values", () => {
    expect(validateSurveyStructure([{
      title: "Employment",
      questions: [
        { type: "single_choice", options: ["Accounting"], config: { question_key: "job_industry", survey_phase: 1 } },
        {
          type: "text",
          options: null,
          config: { survey_phase: 2, visible_when: { question_key: "job_industry", one_of: ["Technology"] } },
        },
      ],
    }])).toContain("same phase")

    expect(validateSurveyStructure([{
      title: "Employment",
      questions: [
        { type: "single_choice", options: ["Accounting"], config: { question_key: "job_industry", survey_phase: 2 } },
        {
          type: "text",
          options: null,
          config: { survey_phase: 2, visible_when: { question_key: "job_industry", one_of: ["Technology"] } },
        },
      ],
    }])).toBeNull()
  })
})
