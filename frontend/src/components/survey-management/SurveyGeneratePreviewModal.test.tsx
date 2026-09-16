import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import type { Survey } from "@/lib/surveys"
import type { SurveyGeneratePreviewModalProps } from "./SurveyGeneratePreviewModal"
import { SurveyGeneratePreviewModal } from "./SurveyGeneratePreviewModal"

function createStore(): SurveyGeneratePreviewModalProps["store"] {
  return {
    state: {
      showGeneratePreview: true,
      previewSurvey: null,
      generating: false,
      interactionLocked: false,
    },
    actions: {
      setShowGeneratePreview: vi.fn(),
      handleConfirmGenerate: vi.fn(),
    },
  } as unknown as SurveyGeneratePreviewModalProps["store"]
}

describe("SurveyGeneratePreviewModal", () => {
  it("keeps the generated dropdowns compact and shows conditional-choice guidance", () => {
    render(<SurveyGeneratePreviewModal store={createStore()} />)

    expect(screen.getAllByRole("button", { name: "Select an option…" })).toHaveLength(5)
    expect(screen.queryByText("BSA")).not.toBeInTheDocument()
    expect(screen.queryByText("Accounting Role")).not.toBeInTheDocument()
    expect(screen.getByText("Choices depend on the selected job industry.")).toBeInTheDocument()
    expect(screen.getByText("2023")).toBeInTheDocument()
    expect(screen.getByText("Male")).toBeInTheDocument()
  })

  it("renders questions from fetched survey data", () => {
    const store = createStore()
    const previewSurvey: Survey = {
      id: "survey-id",
      surveyId: "survey-id",
      title: "Fetched survey",
      status: "Inactive",
      responses: null,
      dateCreated: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      isDeleted: false,
      retentionEnabled: true,
      retentionDays: 1825,
      sections: [{
        id: "section-id",
        title: "Fetched section",
        orderIndex: 0,
        questions: [{
          id: "question-id",
          text: "Fetched question",
          type: "single_choice",
          options: ["Fetched option"],
        }],
      }],
    }
    store.state.previewSurvey = previewSurvey

    render(<SurveyGeneratePreviewModal store={store} />)

    expect(screen.getByText("Fetched question")).toBeInTheDocument()
    expect(screen.getByText("Fetched option")).toBeInTheDocument()
    expect(screen.queryByRole("group", { name: "Questionnaire source" })).not.toBeInTheDocument()
  })
})
