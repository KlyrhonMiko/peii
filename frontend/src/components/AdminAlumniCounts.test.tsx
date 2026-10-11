import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, expect, it, vi } from "vitest"

import { AdminAlumniCounts } from "./AdminAlumniCounts"

const alumniMocks = vi.hoisted(() => ({
  listAlumniCounts: vi.fn(),
  replaceAlumniCounts: vi.fn(),
}))

vi.mock("@/lib/alumni-counts", async () => {
  const actual = await vi.importActual<typeof import("@/lib/alumni-counts")>("@/lib/alumni-counts")
  return { ...actual, ...alumniMocks }
})

const BSN = "Bachelor of Science in Nursing"
const BSIT = "Bachelor of Science in Information Technology"
const savedRows = [
  { id: "1", batch_year: "2025", degree_program: BSN, total: 80, updated_at: "2026-10-11T00:00:00" },
  { id: "2", batch_year: "2025", degree_program: BSIT, total: 131, updated_at: "2026-10-11T00:00:00" },
]

beforeEach(() => {
  alumniMocks.listAlumniCounts.mockReset().mockResolvedValue(savedRows)
  alumniMocks.replaceAlumniCounts.mockReset().mockImplementation((counts: unknown[]) =>
    Promise.resolve(savedRows.slice(0, counts.length)),
  )
})

it("does not enable saving for an empty batch column", async () => {
  render(<AdminAlumniCounts />)
  await screen.findByLabelText(`${BSN}, batch 2025`)

  fireEvent.change(screen.getByLabelText("Batch year"), { target: { value: "2027" } })
  fireEvent.click(screen.getByRole("button", { name: "Add batch" }))

  expect(await screen.findByLabelText(`${BSN}, batch 2027`)).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled()
})

it("asks for confirmation before saving removes stored totals", async () => {
  render(<AdminAlumniCounts />)
  const cell = await screen.findByLabelText(`${BSIT}, batch 2025`)

  fireEvent.change(cell, { target: { value: "" } })
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }))

  expect(await screen.findByText("Remove 1 stored total?")).toBeInTheDocument()
  expect(alumniMocks.replaceAlumniCounts).not.toHaveBeenCalled()

  fireEvent.click(screen.getByRole("button", { name: "Save and remove" }))
  await waitFor(() => expect(alumniMocks.replaceAlumniCounts).toHaveBeenCalledWith([
    { batch_year: "2025", degree_program: BSN, total: 80 },
  ]))
})

it("saves edits that keep every stored total without a confirmation", async () => {
  render(<AdminAlumniCounts />)
  const cell = await screen.findByLabelText(`${BSN}, batch 2025`)

  fireEvent.change(cell, { target: { value: "81" } })
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }))

  await waitFor(() => expect(alumniMocks.replaceAlumniCounts).toHaveBeenCalledWith([
    { batch_year: "2025", degree_program: BSN, total: 81 },
    { batch_year: "2025", degree_program: BSIT, total: 131 },
  ]))
  expect(screen.queryByText(/stored total/)).not.toBeInTheDocument()
})

it("imports a CSV into the table as unsaved changes", async () => {
  render(<AdminAlumniCounts />)
  await screen.findByLabelText(`${BSN}, batch 2025`)

  const file = new File([`college,degree_program,2025,2026\n,${BSN},81,120\n`], "alumni.csv", { type: "text/csv" })
  fireEvent.change(screen.getByLabelText("Alumni population CSV file"), { target: { files: [file] } })

  expect(await screen.findByLabelText(`${BSN}, batch 2026`)).toHaveValue("120")
  expect(screen.getByLabelText(`${BSN}, batch 2025`)).toHaveValue("81")
  // The imported 2025 column replaces the saved one, so the BSIT 2025 total is cleared.
  expect(screen.getByLabelText(`${BSIT}, batch 2025`)).toHaveValue("")
  expect(alumniMocks.replaceAlumniCounts).not.toHaveBeenCalled()
  expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled()
})

it("shows import problems and leaves the table unchanged", async () => {
  render(<AdminAlumniCounts />)
  await screen.findByLabelText(`${BSN}, batch 2025`)

  const file = new File(["degree_program,2025\nBS Astrology,3\n"], "alumni.csv", { type: "text/csv" })
  fireEvent.change(screen.getByLabelText("Alumni population CSV file"), { target: { files: [file] } })

  expect(await screen.findByRole("alert")).toHaveTextContent('"BS Astrology" is not a degree program')
  expect(screen.getByLabelText(`${BSN}, batch 2025`)).toHaveValue("80")
  expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled()
})
