import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { SurveyEditorSidebar } from "./SurveyEditorSidebar"

function renderSidebar(retentionEnabled = true, contentLocked = false) {
  return render(
    <SurveyEditorSidebar
      contentLocked={contentLocked}
      surveyTitle="Alumni survey"
      setSurveyTitle={vi.fn()}
      surveyStatus="Inactive"
      setSurveyStatus={vi.fn()}
      statusOpen={false}
      setStatusOpen={vi.fn()}
      surveyDescription=""
      setSurveyDescription={vi.fn()}
      retentionEnabled={retentionEnabled}
      setRetentionEnabled={vi.fn()}
      retentionDays={1825}
      setRetentionDays={vi.fn()}
    />,
  )
}

describe("SurveyEditorSidebar retention controls", () => {
  it("renders the default policy with accessible controls and explanation", () => {
    renderSidebar()

    expect(screen.getByRole("switch", { name: "Automatically delete responses" })).toBeChecked()
    expect(screen.getByLabelText("Retention period (days)")).toHaveValue(1825)
    expect(screen.getByText(/five years from submission/i)).toBeInTheDocument()
    expect(screen.getByText(/immutable after responses are received/i)).toBeInTheDocument()
  })

  it("disables the retention period when automatic deletion is off", () => {
    renderSidebar(false)

    expect(screen.getByRole("switch", { name: "Automatically delete responses" })).not.toBeChecked()
    expect(screen.getByLabelText("Retention period (days)")).toBeDisabled()
    expect(screen.getByLabelText("Retention period (days)")).toHaveAttribute("min", "1")
    expect(screen.getByLabelText("Retention period (days)")).toHaveAttribute("step", "1")
  })

  it("reports changes from both retention controls", () => {
    const setRetentionEnabled = vi.fn()
    const setRetentionDays = vi.fn()
    render(
      <SurveyEditorSidebar
        surveyTitle=""
        setSurveyTitle={vi.fn()}
        surveyStatus="Inactive"
        setSurveyStatus={vi.fn()}
        statusOpen={false}
        setStatusOpen={vi.fn()}
        surveyDescription=""
        setSurveyDescription={vi.fn()}
        retentionEnabled
        setRetentionEnabled={setRetentionEnabled}
        retentionDays={1825}
        setRetentionDays={setRetentionDays}
      />,
    )

    fireEvent.click(screen.getByRole("switch", { name: "Automatically delete responses" }))
    fireEvent.change(screen.getByLabelText("Retention period (days)"), { target: { value: "90" } })

    expect(setRetentionEnabled).toHaveBeenCalledWith(false)
    expect(setRetentionDays).toHaveBeenCalledWith(90)
  })
})

it("locks content and retention while preserving the status control", () => {
  renderSidebar(true, true)
  expect(screen.getByRole("group", { name: "Collection status" })).toBeInTheDocument()
  expect(screen.getByRole("textbox", { name: "Title" })).toBeDisabled()
  expect(screen.getByRole("textbox", { name: "Description" })).toBeDisabled()
  expect(screen.getByRole("switch", { name: "Automatically delete responses" })).toHaveAttribute("aria-disabled", "true")
  expect(screen.getByLabelText("Retention period (days)")).toBeDisabled()
  expect(screen.getByRole("button", { name: "Inactive" })).not.toBeDisabled()
})
