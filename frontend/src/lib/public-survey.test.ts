import { describe, expect, it, vi } from "vitest"

import {
  createPublicSurveySubmission,
  generateWithdrawalCode,
  parsePublicSurveyEnvelope,
  parsePublicSurveyWithdrawn,
} from "./public-survey"

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

describe("public survey withdrawal helpers", () => {
  it("generates a 32-byte base64url withdrawal code", () => {
    const getRandomValues = vi.spyOn(globalThis.crypto, "getRandomValues")
      .mockImplementation((bytes) => {
        expect(bytes).toHaveLength(32)
        return bytes
      })

    const code = generateWithdrawalCode()

    expect(getRandomValues).toHaveBeenCalledTimes(1)
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(code).toHaveLength(43)
    getRandomValues.mockRestore()
  })

  it("includes the private code in every response submission", () => {
    expect(createPublicSurveySubmission({ answer: "value" }, "v1", "private-code")).toEqual({
      answers: { answer: "value" },
      consent: { accepted: true, version: "v1" },
      withdrawal_code: "private-code",
    })
  })

  it("parses only an accepted withdrawal response", () => {
    expect(parsePublicSurveyWithdrawn({ data: { withdrawn: true } })).toEqual({ withdrawn: true })
    expect(parsePublicSurveyWithdrawn({ data: { withdrawn: false } })).toBeNull()
    expect(parsePublicSurveyWithdrawn({ data: null })).toBeNull()
  })
})
