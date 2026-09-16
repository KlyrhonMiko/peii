import { describe, expect, it } from "vitest"
import type { PublicSurveyQuestion } from "./public-survey"
import {
  availableQuestionOptions,
  isQuestionVisible,
  pruneConditionalAnswers,
  questionsByKey,
} from "./survey-conditions"

function question(id: string, config: Record<string, unknown> | null, options: string[] | null = null): PublicSurveyQuestion {
  return {
    id,
    question_text: id,
    question_type: options ? "single_choice" : "text",
    options,
    config,
    order_index: 0,
    is_required: true,
  }
}

describe("survey conditions", () => {
  it("shows a required follow-up only for its matching source answer and clears stale answers", () => {
    const location = question("location", { question_key: "current_location" }, ["Pasig City", "Outside NCR"])
    const barangay = question("barangay", {
      visible_when: { question_key: "current_location", equals: "Pasig City" },
    }, ["Maybunga", "Ugong"])
    const questions = [location, barangay]
    const byKey = questionsByKey(questions)
    expect(isQuestionVisible(barangay, byKey, {})).toBe(false)
    expect(isQuestionVisible(barangay, byKey, { location: "Pasig City" })).toBe(true)
    expect(pruneConditionalAnswers(questions, byKey, {
      location: "Outside NCR", barangay: "Maybunga",
    })).toEqual({ location: "Outside NCR" })
  })

  it("restricts category choices to the selected industry and clears its Other follow-up", () => {
    const industry = question("industry", { question_key: "job_industry" }, ["Accounting", "Education"])
    const category = question("category", {
      question_key: "job_category",
      options_by_answer: {
        question_key: "job_industry",
        choices: { Accounting: ["Audit", "Other (specify)"], Education: ["Teaching", "Other (specify)"] },
      },
    }, ["Audit", "Teaching", "Other (specify)"])
    const detail = question("detail", {
      visible_when: { question_key: "job_category", one_of: ["Other (specify)"] },
    })
    const questions = [industry, category, detail]
    const byKey = questionsByKey(questions)
    expect(isQuestionVisible(category, byKey, {})).toBe(false)
    expect(availableQuestionOptions(category, byKey, { industry: "Education" })).toEqual(["Teaching", "Other (specify)"])
    expect(pruneConditionalAnswers(questions, byKey, {
      industry: "Education", category: "Audit", detail: "Internal audit",
    })).toEqual({ industry: "Education" })
    expect(isQuestionVisible(detail, byKey, {
      industry: "Education", category: "Other (specify)",
    })).toBe(true)
  })
})
