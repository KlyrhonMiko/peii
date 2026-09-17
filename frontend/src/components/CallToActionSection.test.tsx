import { render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { CallToActionSection } from "./CallToActionSection"

const { fetchCtaSurvey } = vi.hoisted(() => ({ fetchCtaSurvey: vi.fn() }))
vi.mock("@/lib/surveys", () => ({ fetchCtaSurvey }))
vi.mock("motion/react", () => ({
  useReducedMotion: () => true,
  motion: {
    div: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <div className={className}>{children}</div>
    ),
  },
}))

beforeEach(() => vi.clearAllMocks())

describe("CallToActionSection", () => {
  it("links the featured survey to the public survey route", async () => {
    fetchCtaSurvey.mockResolvedValue({ survey_id: "survey-123", title: "ALUMNI SURVEY" })
    render(<CallToActionSection />)
    expect(await screen.findByRole("link", { name: /participate now/i }))
      .toHaveAttribute("href", "/survey/survey-123")
  })

  it("does not offer participation when no active survey is featured", async () => {
    fetchCtaSurvey.mockResolvedValue(null)
    render(<CallToActionSection />)
    await waitFor(() => expect(fetchCtaSurvey).toHaveBeenCalledOnce())
    expect(screen.queryByRole("link", { name: /participate now/i })).not.toBeInTheDocument()
  })
})
