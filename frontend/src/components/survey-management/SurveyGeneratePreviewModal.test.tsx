import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import type { SurveyGeneratePreviewModalProps } from "./SurveyGeneratePreviewModal"
import { SurveyGeneratePreviewModal } from "./SurveyGeneratePreviewModal"

function createStore(): SurveyGeneratePreviewModalProps["store"] {
  return {
    state: {
      showGeneratePreview: true,
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
  it("uses a compact dropdown preview only for the marked degree program question", () => {
    render(<SurveyGeneratePreviewModal store={createStore()} />)

    expect(screen.getByRole("button", { name: "Select a degree program…" })).toBeDisabled()
    expect(screen.queryByText("BSA")).not.toBeInTheDocument()
    expect(screen.getByText("2023")).toBeInTheDocument()
    expect(screen.getByText("Male")).toBeInTheDocument()
  })
})
