import { describe, expect, it } from "vitest"

import { parsePublicSurveyEnvelope } from "./public-survey"

function publicSurveyEnvelope(questionOverrides: Record<string, unknown> = {}) {
  const question = {
    id: "question-1",
    question_text: "What did you enjoy?",
    question_type: "text",
    options: null,
    config: null,
    order_index: 0,
    is_required: false,
    ...questionOverrides,
  }

  return {
    data: {
      survey_id: "survey-1",
      title: "Alumni Survey",
      description: null,
      questions: [question],
      sections: [
        {
          id: "section-1",
          title: "Feedback",
          description: null,
          order_index: 0,
          questions: [question],
        },
      ],
      consent: {
        version: "1",
        notice: "Notice",
        purpose: "Purpose",
        retention: "Retention",
        contact: "Contact",
      },
    },
    message: "Survey loaded",
    errors: null,
    meta: {},
  }
}

describe("parsePublicSurveyEnvelope", () => {
  it("parses backend-shaped questions with explicit null options and config", () => {
    const survey = parsePublicSurveyEnvelope(publicSurveyEnvelope())

    expect(survey?.questions[0]).toEqual(expect.objectContaining({ options: null, config: null }))
    expect(survey?.sections[0]?.questions[0]).toEqual(
      expect.objectContaining({ options: null, config: null }),
    )
  })

  it.each([
    { field: "options", value: 42 },
    { field: "config", value: "malformed" },
  ])("rejects malformed non-null $field values", ({ field, value }) => {
    expect(parsePublicSurveyEnvelope(publicSurveyEnvelope({ [field]: value }))).toBeNull()
  })
})
