import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import type { SurveySection } from "@/lib/surveys"
import { SurveyPreviewTab } from "./SurveyPreviewTab"

const sections: SurveySection[] = [
  {
    id: "profile",
    title: "Profile",
    orderIndex: 0,
    questions: [
      {
        id: "degree",
        text: "Degree Program Category:",
        type: "single_choice",
        options: ["BSA", "BSBA", "BSE"],
        config: { presentation: "dropdown" },
      },
      {
        id: "year",
        text: "Year Graduated:",
        type: "single_choice",
        options: ["2023", "2024"],
        config: null,
      },
    ],
  },
]

describe("SurveyPreviewTab", () => {
  it("uses a compact dropdown preview only for marked single-choice questions", () => {
    render(<SurveyPreviewTab sections={sections} />)

    expect(screen.getByRole("button", { name: "Select a degree program…" })).toBeDisabled()
    expect(screen.queryByText("BSA")).not.toBeInTheDocument()
    expect(screen.getByText("2023")).toBeInTheDocument()
    expect(screen.getByText("2024")).toBeInTheDocument()
  })
})
