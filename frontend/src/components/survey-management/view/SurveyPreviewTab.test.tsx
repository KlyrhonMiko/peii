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
      {
        id: "role",
        text: "Which role or job title best describes your work?",
        type: "single_choice",
        options: ["Account Executive", "Analyst"],
        config: { presentation: "searchable_dropdown" },
      },
    ],
  },
]

describe("SurveyPreviewTab", () => {
  it("uses compact dropdown previews for regular and searchable choices", () => {
    render(<SurveyPreviewTab sections={sections} />)

    expect(screen.getAllByRole("button", { name: "Select an option…" })).toHaveLength(2)
    expect(screen.queryByText("BSA")).not.toBeInTheDocument()
    expect(screen.queryByText("Account Executive")).not.toBeInTheDocument()
    expect(screen.getByText("2023")).toBeInTheDocument()
    expect(screen.getByText("2024")).toBeInTheDocument()
  })
})
