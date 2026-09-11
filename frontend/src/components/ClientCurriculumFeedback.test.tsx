import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { ClientCurriculumFeedback } from "./ClientCurriculumFeedback"

describe("ClientCurriculumFeedback", () => {
  it("renders only 30 entries and identifies the newest retained subset and total", () => {
    const feedbacks = Array.from({ length: 200 }, (_, index) => ({
      response_id: `response-${index}`,
      question_id: `question-${index}`,
      question_text: "Feedback",
      response_text: `Feedback ${index + 1}`,
      sentiment_score: index,
      is_false_positive: false,
    }))

    render(
      <ClientCurriculumFeedback
        surveyId="survey-id"
        feedbacks={feedbacks}
        qualitativeFeedbackTotal={245}
        qualitativeFeedbackTruncated
      />,
    )

    expect(screen.getByText(/showing 30 of the newest 200 retained feedback entries \(245 matching entries\)/i)).toBeInTheDocument()
    expect(screen.getAllByText(/Feedback \d+/)).toHaveLength(30)
    expect(screen.queryByText(/Feedback 31/)).not.toBeInTheDocument()
  })
})
