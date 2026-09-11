import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { SurveyResponseAggregate } from "@/lib/surveys"
import { ClientKeyOutcomes } from "./ClientKeyOutcomes"
import { ClientDegreeAlignment } from "./ClientDegreeAlignment"
vi.mock("recharts", () => ({ PieChart: () => null, Pie: () => null, Cell: () => null, ResponsiveContainer: () => null, Tooltip: () => null }))
const distribution: SurveyResponseAggregate = {
  question_id: "post", question_text: "Named backend outcome", question_type: "scale", total: 3,
  cells: ["Strongly Agree", "Agree", "Neutral"].map(value => ({ value, count: 1, row: null, rank: null })),
}
describe.each([ClientKeyOutcomes, ClientDegreeAlignment])("filtered outcome card", Card => {
  it.each([false, true])("rounds combined favorable counts once (export=%s)", isExport => {
    render(<Card distribution={distribution} isExport={isExport} />)
    expect(screen.getByText("67%")).toBeInTheDocument()
    expect(screen.getByText("Based on 3 responses")).toBeInTheDocument()
  })
  it("uses the singular response label for one valid answer", () => {
    render(<Card distribution={{ ...distribution, total: 1, cells: [{ value: "Agree", count: 1, row: null, rank: null }] }} />)
    expect(screen.getByText("Based on 1 response")).toBeInTheDocument()
  })
  it("renders missing and zero valid-answer outcomes without percentages", () => {
    const { rerender } = render(<Card distribution={null} />)
    expect(screen.queryByText("Favorable")).not.toBeInTheDocument()
    rerender(<Card distribution={{ ...distribution, total: 0, cells: [] }} />)
    expect(screen.queryByText("Favorable")).not.toBeInTheDocument()
  })
})
