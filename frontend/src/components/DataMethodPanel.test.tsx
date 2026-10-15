import { fireEvent, render, screen } from "@testing-library/react"
import { expect, it } from "vitest"

import type { ReportTable } from "@/lib/peii-report"
import { DataMethodPanel } from "./DataMethodPanel"

const table: ReportTable = {
  id: "batches",
  title: "Respondents per Batch",
  columns: [{ label: "Batch" }, { label: "N", align: "right" }],
  rows: [{ cells: ["2023", "38"] }, { cells: ["Total", "38"], kind: "total" }],
  note: "Batch totals sum to 38, matching the total responses.",
  method: "Counts respondents per batch.",
}

it("stays collapsed until opened, then shows the table, note, and method", () => {
  render(<DataMethodPanel name="Respondents" tables={[table, null]} />)
  const toggle = screen.getByRole("button", { name: /Data and method/ })
  expect(toggle).toHaveAttribute("aria-expanded", "false")
  expect(screen.queryByRole("table")).not.toBeInTheDocument()

  fireEvent.click(toggle)
  expect(toggle).toHaveAttribute("aria-expanded", "true")
  expect(screen.getByRole("table", { name: "Respondents per Batch" })).toBeInTheDocument()
  expect(screen.getByRole("rowheader", { name: "Total" })).toBeInTheDocument()
  expect(screen.getByText(/Batch totals sum to 38/)).toBeInTheDocument()
  expect(screen.getByText(/Counts respondents per batch/)).toBeInTheDocument()
})

it("renders nothing when no table has data", () => {
  const { container } = render(<DataMethodPanel name="Respondents" tables={[null, undefined]} />)
  expect(container).toBeEmptyDOMElement()
})

it("opens in the row's full-width strip so neighbouring charts keep their place", () => {
  render(
    <div data-table-row>
      <div data-testid="cell">
        <DataMethodPanel name="Respondents" tables={[table]} />
      </div>
      <div data-table-slot data-testid="slot" />
    </div>,
  )
  fireEvent.click(screen.getByRole("button", { name: /Data and method/ }))
  expect(screen.getByTestId("slot")).toContainElement(screen.getByRole("table", { name: "Respondents per Batch" }))
  expect(screen.getByTestId("cell")).not.toContainElement(screen.getByRole("table"))
  expect(screen.getByText("Respondents · Data and method")).toBeInTheDocument()
})

it("renders the tables inline while the chart is exported", () => {
  render(<DataMethodPanel name="Respondents" tables={[table]} capturing />)
  expect(screen.getByRole("table", { name: "Respondents per Batch" })).toBeInTheDocument()
  expect(screen.getByRole("button", { name: /Data and method/ })).toHaveAttribute("data-export-exclude", "true")
})
