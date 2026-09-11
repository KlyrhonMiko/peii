import { render, screen } from "@testing-library/react"
import { expect, it, vi } from "vitest"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { SurveyEditorHeader } from "./SurveyEditorHeader"
it("names the locked action Save status and enables it only for a change", () => {
  const props = { modalState: { type: "edit" as const, id: "survey" }, interactionLocked: false, saving: false, surveyTitle: "Survey", handleCloseModal: vi.fn(), handleSaveSurvey: vi.fn(), contentLocked: true, statusChanged: false }
  const { rerender } = render(<Dialog open><DialogContent><SurveyEditorHeader {...props} /></DialogContent></Dialog>)
  expect(screen.getByRole("button", { name: "Save status" })).toBeDisabled()
  rerender(<Dialog open><DialogContent><SurveyEditorHeader {...props} statusChanged /></DialogContent></Dialog>)
  expect(screen.getByRole("button", { name: "Save status" })).not.toBeDisabled()
})
