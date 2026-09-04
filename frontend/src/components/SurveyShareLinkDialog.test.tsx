import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { toast } from "sonner"

import type { Survey } from "@/lib/surveys"
import { SurveyShareLinkDialog } from "./SurveyShareLinkDialog"

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

const activeSurvey: Survey = {
  id: "survey-uuid-1",
  surveyId: "SURV-001",
  title: "Alumni Survey",
  status: "Active",
  responses: 0,
  dateCreated: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  isDeleted: false,
  retentionEnabled: true,
  retentionDays: 1825,
}

const inactiveSurvey: Survey = {
  ...activeSurvey,
  status: "Inactive",
}

const archivedSurvey: Survey = {
  ...activeSurvey,
  isDeleted: true,
}

describe("SurveyShareLinkDialog", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.mocked(toast.success).mockReset()
    vi.mocked(toast.error).mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("renders inactive state notice when survey is not active", () => {
    const onOpenChange = vi.fn()
    render(
      <SurveyShareLinkDialog
        survey={inactiveSurvey}
        open
        onOpenChange={onOpenChange}
      />,
    )

    expect(screen.getByText("Survey is not active")).toBeInTheDocument()
    expect(
      screen.getByText(/Change the survey status to "Active" in the editor/i),
    ).toBeInTheDocument()
    // The card action "Close" button is the one without data-slot="dialog-close"
    const buttons = screen.getAllByRole("button")
    const actionCloseButton = buttons.find(
      (btn) => btn.textContent?.trim() === "Close" && btn.getAttribute("data-slot") !== "dialog-close",
    )
    expect(actionCloseButton).toBeDefined()
    // The shareable link <code> value is only rendered in the active branch
    expect(
      screen.queryByText(`${window.location.origin}/survey/SURV-001`),
    ).not.toBeInTheDocument()

    fireEvent.click(actionCloseButton!)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("renders archived notice and hides the link for archived surveys", () => {
    render(
      <SurveyShareLinkDialog
        survey={archivedSurvey}
        open
        onOpenChange={vi.fn()}
      />,
    )

    expect(screen.getByText("Survey is archived")).toBeInTheDocument()
    expect(
      screen.getByText(/Restore the survey to share the link again/i),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(`${window.location.origin}/survey/SURV-001`),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /copy/i })).not.toBeInTheDocument()
  })

  it("renders inactive state notice when survey is null", () => {
    render(
      <SurveyShareLinkDialog
        survey={null}
        open
        onOpenChange={vi.fn()}
      />,
    )

    expect(screen.getByText("Survey is not active")).toBeInTheDocument()
    // The card action Close button is rendered (in addition to the dialog X icon)
    const buttons = screen.getAllByRole("button")
    const actionCloseButton = buttons.find(
      (btn) => btn.textContent?.trim() === "Close" && btn.getAttribute("data-slot") !== "dialog-close",
    )
    expect(actionCloseButton).toBeDefined()
  })

  it("renders shareable link when survey is active", () => {
    render(
      <SurveyShareLinkDialog
        survey={activeSurvey}
        open
        onOpenChange={vi.fn()}
      />,
    )

    expect(screen.getAllByText("Shareable Link").length).toBeGreaterThan(0)
    expect(
      screen.getByText(`${window.location.origin}/survey/SURV-001`),
    ).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /copy/i })).toBeInTheDocument()
  })

  it("copies shareable link to clipboard and shows success toast", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    })

    render(
      <SurveyShareLinkDialog
        survey={activeSurvey}
        open
        onOpenChange={vi.fn()}
      />,
    )

    const copyButton = screen.getByRole("button", { name: /copy/i })
    fireEvent.click(copyButton)

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith(
        `${window.location.origin}/survey/SURV-001`,
      )
    })
    expect(screen.getByRole("button", { name: /copied/i })).toBeInTheDocument()
    expect(toast.success).toHaveBeenCalledWith("Survey link copied to clipboard.")
  })

  it("handles clipboard failure with error toast", async () => {
    const writeTextMock = vi.fn().mockRejectedValue(new Error("Clipboard error"))
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    })

    render(
      <SurveyShareLinkDialog
        survey={activeSurvey}
        open
        onOpenChange={vi.fn()}
      />,
    )

    const copyButton = screen.getByRole("button", { name: /copy/i })
    fireEvent.click(copyButton)

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalled()
    })
    expect(toast.error).toHaveBeenCalledWith("We could not copy the link.")
  })

  it("resets copied state when dialog is closed", () => {
    const onOpenChange = vi.fn()
    const { rerender } = render(
      <SurveyShareLinkDialog
        survey={activeSurvey}
        open
        onOpenChange={onOpenChange}
      />,
    )

    rerender(
      <SurveyShareLinkDialog
        survey={activeSurvey}
        open={false}
        onOpenChange={onOpenChange}
      />,
    )

    expect(screen.queryByText("Shareable Link")).not.toBeInTheDocument()
  })
})
