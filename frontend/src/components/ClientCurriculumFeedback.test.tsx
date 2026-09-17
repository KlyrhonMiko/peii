import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { ClientCurriculumFeedback } from "./ClientCurriculumFeedback"

describe("ClientCurriculumFeedback", () => {
  it("renders single-button popover triggers and opens the category filter", async () => {
    const { container } = render(
      <ClientCurriculumFeedback
        surveyId="survey-id"
        feedbacks={[{
          response_id: "response-1",
          question_id: "question-1",
          question_text: "Feedback",
          response_text: "Improve the curriculum",
          sentiment_score: 0,
          is_false_positive: false,
          dimension: "Curriculum",
        }]}
        qualitativeFeedbackTotal={1}
        qualitativeFeedbackTruncated={false}
      />,
    )

    expect(container.querySelector("button button")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Negative First" }))
    fireEvent.click(await screen.findByRole("button", { name: "Positive First" }))
    expect(screen.getByRole("button", { name: "Positive First" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "All Feedback" }))
    expect(await screen.findByRole("button", { name: /Curriculum/ })).toBeInTheDocument()
  })

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

    expect(screen.getByText(/showing 30 of the newest 200 feedback entries \(245 matching entries\)\. note: placeholder and noise comments/i)).toBeInTheDocument()
    expect(screen.getAllByText(/Feedback \d+/)).toHaveLength(30)
    expect(screen.queryByText(/Feedback 31/)).not.toBeInTheDocument()
  })
})
