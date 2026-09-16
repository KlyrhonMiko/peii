import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import type { useSurveyManagement } from "../useSurveyManagement"
import { SurveyQuestionCard } from "./SurveyQuestionCard"

function editorActions() {
  return {
    handleDragStart: vi.fn(),
    handleDrop: vi.fn(),
    setDragItem: vi.fn(),
    updateQuestion: vi.fn(),
    setOpenQuestionSelectId: vi.fn(),
    moveQuestionBy: vi.fn(),
    removeQuestion: vi.fn(),
    getQuestionOptionsByKey: vi.fn(() => ["Accounting", "Technology"]),
    updateDependentOption: vi.fn(),
    moveDependentOption: vi.fn(),
    removeDependentOption: vi.fn(),
    addDependentOption: vi.fn(),
    removeDependentBranch: vi.fn(),
  } as unknown as ReturnType<typeof useSurveyManagement>["actions"]
}

describe("QuestionOptionsEditor", () => {
  it("renders and updates branch-specific choices for an options_by_answer question", () => {
    const actions = editorActions()
    render(
      <SurveyQuestionCard
        sectionId="employment"
        sectionIndex={0}
        questionIndex={1}
        totalQuestions={2}
        openQuestionSelectId={null}
        actions={actions}
        question={{
          id: "category",
          text: "Which category?",
          type: "single_choice",
          options: ["Audit", "Software"],
          config: {
            question_key: "job_category",
            options_by_answer: {
              question_key: "job_industry",
              choices: { Accounting: ["Audit"], Technology: ["Software"] },
            },
          },
        }}
      />,
    )

    expect(screen.getByText("Options by answer")).toBeInTheDocument()
    expect(screen.getByLabelText("Accounting choice 1")).toHaveValue("Audit")
    expect(screen.getByLabelText("Technology choice 1")).toHaveValue("Software")

    fireEvent.click(screen.getAllByRole("button", { name: "Add choice" })[0]!)
    expect(actions.addDependentOption).toHaveBeenCalledWith(0, 1, "Accounting")
  })
})
