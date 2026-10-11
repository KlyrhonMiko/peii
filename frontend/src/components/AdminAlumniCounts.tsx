"use client"

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react"
import { AlertCircle, Download, Plus, RotateCcw, Save, Upload, X } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { ApiError } from "@/lib/api"
import { ALUMNI_CSV_MAX_BYTES, buildAlumniCsv, parseAlumniCsv, type AlumniCountGrid } from "@/lib/alumni-csv"
import { listAlumniCounts, replaceAlumniCounts, type AlumniCount, type AlumniCountEntry } from "@/lib/alumni-counts"
import { departmentDegrees } from "@/lib/degree-programs"
import { cn } from "@/lib/utils"

/** Cell values keyed by batch year, then degree program. Blank means "no registrar count". */
type CountGrid = AlumniCountGrid

const BATCH_PATTERN = /^\d{4}$/
const COUNT_PATTERN = /^\d{1,7}$/

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback
}

function gridFromRows(rows: AlumniCount[]): { batches: string[]; grid: CountGrid } {
  const grid: CountGrid = {}
  for (const row of rows) {
    grid[row.batch_year] = { ...grid[row.batch_year], [row.degree_program]: String(row.total) }
  }
  return { batches: Object.keys(grid).sort(), grid }
}

/** Converts the grid to API rows. Returns null when a cell holds a value that is not a whole number. */
export function entriesFromGrid(batches: string[], grid: CountGrid): AlumniCountEntry[] | null {
  const entries: AlumniCountEntry[] = []
  for (const batch of batches) {
    for (const [degree, raw] of Object.entries(grid[batch] ?? {})) {
      const value = raw.trim()
      if (value === "") continue
      if (!COUNT_PATTERN.test(value)) return null
      entries.push({ batch_year: batch, degree_program: degree, total: Number(value) })
    }
  }
  return entries
}

function sumCells(values: Array<string | undefined>): number | null {
  let total = 0
  let hasValue = false
  for (const raw of values) {
    const value = raw?.trim() ?? ""
    if (!COUNT_PATTERN.test(value)) continue
    total += Number(value)
    hasValue = true
  }
  return hasValue ? total : null
}

function formatTotal(value: number | null) {
  return value === null ? "—" : value.toLocaleString()
}

export function AdminAlumniCounts() {
  const [saved, setSaved] = useState<{ batches: string[]; grid: CountGrid }>({ batches: [], grid: {} })
  const [batches, setBatches] = useState<string[]>([])
  const [grid, setGrid] = useState<CountGrid>({})
  const [newBatch, setNewBatch] = useState("")
  const [hasLoaded, setHasLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, startSaving] = useTransition()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [importErrors, setImportErrors] = useState<string[] | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const applyRows = useCallback((rows: AlumniCount[]) => {
    const next = gridFromRows(rows)
    setSaved(next)
    setBatches(next.batches)
    setGrid(next.grid)
  }, [])

  const load = useCallback(() => {
    void listAlumniCounts()
      .then((rows) => {
        applyRows(rows)
        setError(null)
        setHasLoaded(true)
      })
      .catch((err: unknown) => {
        setError(errorMessage(err, "Unable to load alumni counts."))
        setHasLoaded(true)
      })
  }, [applyRows])

  useEffect(() => {
    load()
  }, [load])

  const retry = () => {
    setError(null)
    setHasLoaded(false)
    load()
  }

  const entries = useMemo(() => entriesFromGrid(batches, grid), [batches, grid])
  const savedEntries = useMemo(() => entriesFromGrid(saved.batches, saved.grid), [saved])
  // An empty batch column is not a change: it stores nothing until a cell has a value.
  const isDirty = JSON.stringify(entries) !== JSON.stringify(savedEntries)
  const removedCount = useMemo(() => {
    if (entries === null || savedEntries === null) return 0
    const kept = new Set(entries.map((entry) => `${entry.batch_year}|${entry.degree_program}`))
    return savedEntries.filter((entry) => !kept.has(`${entry.batch_year}|${entry.degree_program}`)).length
  }, [entries, savedEntries])
  const hasInvalidCell = entries === null

  const trimmedNewBatch = newBatch.trim()
  const newBatchError =
    trimmedNewBatch === "" ? null
      : !BATCH_PATTERN.test(trimmedNewBatch) ? "Enter a four-digit year."
        : batches.includes(trimmedNewBatch) ? "This batch is already in the table."
          : null

  const addBatch = () => {
    if (trimmedNewBatch === "" || newBatchError) return
    setBatches((current) => [...current, trimmedNewBatch].sort())
    setGrid((current) => ({ ...current, [trimmedNewBatch]: current[trimmedNewBatch] ?? {} }))
    setNewBatch("")
  }

  const removeBatch = (batch: string) => {
    setBatches((current) => current.filter((item) => item !== batch))
    setGrid((current) => {
      const next = { ...current }
      delete next[batch]
      return next
    })
  }

  const setCell = (batch: string, degree: string, value: string) => {
    setGrid((current) => ({ ...current, [batch]: { ...current[batch], [degree]: value } }))
  }

  /** Replaces each imported batch column with the file's values; other batches stay unchanged. */
  const importFile = async (file: File) => {
    if (file.size > ALUMNI_CSV_MAX_BYTES) {
      setImportErrors([`The file is ${Math.ceil(file.size / 1024)} KB. The limit is ${ALUMNI_CSV_MAX_BYTES / 1024} KB.`])
      return
    }
    const parsed = parseAlumniCsv(await file.text())
    if (parsed.errors.length > 0) {
      setImportErrors(parsed.errors)
      return
    }
    setImportErrors(null)
    setBatches((current) => Array.from(new Set([...current, ...parsed.batches])).sort())
    setGrid((current) => {
      const next = { ...current }
      for (const batch of parsed.batches) next[batch] = parsed.grid[batch] ?? {}
      return next
    })
    toast.success(
      `Imported ${parsed.totals} totals for ${parsed.batches.length === 1 ? "batch" : "batches"} ${parsed.batches.join(", ")}. Review the table, then save.`,
    )
  }

  const downloadTemplate = () => {
    const blob = new Blob([buildAlumniCsv(batches, grid)], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = "alumni-population-template.csv"
    link.click()
    URL.revokeObjectURL(url)
  }

  const discard = () => {
    setBatches(saved.batches)
    setGrid(saved.grid)
  }

  const commit = () => {
    if (entries === null) return
    setConfirmOpen(false)
    startSaving(async () => {
      try {
        applyRows(await replaceAlumniCounts(entries))
        toast.success("Alumni counts saved.")
      } catch (err: unknown) {
        toast.error(errorMessage(err, "Unable to save alumni counts."))
      }
    })
  }

  const save = () => {
    if (removedCount > 0) setConfirmOpen(true)
    else commit()
  }

  const departments = Object.entries(departmentDegrees)
  const allDegrees = departments.flatMap(([, degrees]) => degrees)
  const batchTotals = batches.map((batch) => sumCells(allDegrees.map((degree) => grid[batch]?.[degree])))
  const grandTotal = sumCells(batchTotals.map((value) => (value === null ? undefined : String(value))))

  return (
    <div className="flex flex-col gap-6 p-2">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-950">Alumni population</h2>
          <p className="text-[14px] text-zinc-500 max-w-2xl">
            Graduate totals from the registrar, by batch and degree program. The dashboard divides
            responses by these totals to show the response rate for every survey.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isDirty && (
            <Button variant="outline" onClick={discard} disabled={isSaving} className="h-9 rounded-lg text-[13px]">
              <RotateCcw data-icon="inline-start" />
              Discard
            </Button>
          )}
          <Button
            onClick={save}
            disabled={!isDirty || hasInvalidCell || isSaving || !hasLoaded || error !== null}
            className="h-9 rounded-lg text-[13px]"
          >
            <Save data-icon="inline-start" />
            {isSaving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>

      {error ? (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700">
          <AlertCircle className="size-5 shrink-0 mt-0.5" />
          <div className="flex flex-col gap-2 text-[13px]">
            <p className="font-semibold">{error}</p>
            <Button variant="outline" onClick={retry} className="h-8 w-fit rounded-lg text-[13px]">
              Try again
            </Button>
          </div>
        </div>
      ) : !hasLoaded ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} className="h-10 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-end justify-between gap-3">
          <form
            className="flex flex-wrap items-start gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              addBatch()
            }}
          >
            <div className="flex flex-col gap-1.5">
              <label htmlFor="new-batch-year" className="text-[12px] font-semibold text-zinc-600">Batch year</label>
              <Input
                id="new-batch-year"
                value={newBatch}
                onChange={(event) => setNewBatch(event.target.value)}
                placeholder="e.g. 2027"
                inputMode="numeric"
                maxLength={4}
                aria-invalid={newBatchError !== null}
                aria-describedby={newBatchError ? "new-batch-error" : undefined}
                className="h-9 w-32 rounded-lg text-[13px] tabular-nums"
              />
              {newBatchError && (
                <span id="new-batch-error" className="text-[12px] text-destructive">{newBatchError}</span>
              )}
            </div>
            <Button
              type="submit"
              variant="outline"
              disabled={trimmedNewBatch === "" || newBatchError !== null}
              className="h-9 mt-[22px] rounded-lg text-[13px]"
            >
              <Plus data-icon="inline-start" />
              Add batch
            </Button>
          </form>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={downloadTemplate} className="h-9 rounded-lg text-[13px]">
              <Download data-icon="inline-start" />
              Download template
            </Button>
            <Button variant="outline" onClick={() => fileInput.current?.click()} className="h-9 rounded-lg text-[13px]">
              <Upload data-icon="inline-start" />
              Import CSV
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              aria-label="Alumni population CSV file"
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ""
                if (file) void importFile(file)
              }}
            />
          </div>
          </div>

          {importErrors && (
            <div role="alert" className="flex items-start gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700">
              <AlertCircle className="size-5 shrink-0 mt-0.5" />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5 text-[13px]">
                <p className="font-semibold">The file was not imported. The table did not change.</p>
                <ul className="list-disc pl-4 text-red-700/90">
                  {importErrors.slice(0, 8).map((message) => <li key={message}>{message}</li>)}
                </ul>
                {importErrors.length > 8 && <p className="text-red-700/80">{importErrors.length - 8} more problems are not shown.</p>}
              </div>
              <button
                type="button"
                onClick={() => setImportErrors(null)}
                aria-label="Dismiss import errors"
                className="rounded p-0.5 text-red-500 hover:bg-red-100 hover:text-red-700"
              >
                <X className="size-4" />
              </button>
            </div>
          )}

          {batches.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center border border-dashed border-zinc-200 rounded-xl">
              <p className="text-[14px] font-medium text-zinc-700">No alumni counts yet</p>
              <p className="text-[13px] text-zinc-500 max-w-sm">
                Import a CSV that follows the template, or add a batch year and type the registrar total
                for each degree program.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
              <table className="w-full min-w-max border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50/80">
                    <th scope="col" className="sticky left-0 z-10 bg-zinc-50 px-3 py-2.5 text-left text-[11px] sm:px-4 font-bold uppercase tracking-wider text-zinc-500">
                      Degree program
                    </th>
                    {batches.map((batch) => (
                      <th key={batch} scope="col" className="px-2 py-2.5 text-right text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                        <span className="inline-flex items-center gap-1">
                          {batch}
                          <button
                            type="button"
                            onClick={() => removeBatch(batch)}
                            aria-label={`Remove batch ${batch}`}
                            title={`Remove batch ${batch}`}
                            className="rounded p-0.5 text-zinc-400 hover:bg-zinc-200/70 hover:text-zinc-700"
                          >
                            <X className="size-3" />
                          </button>
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {departments.map(([department, degrees]) => (
                    <Fragment key={department}>
                      <tr className="border-b border-zinc-100">
                        <th
                          scope="colgroup"
                          colSpan={batches.length + 1}
                          className="sticky left-0 bg-white px-3 pt-4 sm:px-4 pb-1.5 text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-400"
                        >
                          {department}
                        </th>
                      </tr>
                      {degrees.map((degree) => (
                        <tr key={degree} className="border-b border-zinc-100 hover:bg-zinc-50/60">
                          <th scope="row" className="sticky left-0 z-10 max-w-[9.5rem] bg-white px-3 py-1.5 text-left font-normal text-zinc-700 sm:max-w-[18rem] sm:px-4">
                            <span className="block leading-snug sm:truncate" title={degree}>{degree}</span>
                          </th>
                          {batches.map((batch) => {
                            const value = grid[batch]?.[degree] ?? ""
                            const invalid = value.trim() !== "" && !COUNT_PATTERN.test(value.trim())
                            return (
                              <td key={batch} className="px-2 py-1.5 text-right">
                                <Input
                                  value={value}
                                  onChange={(event) => setCell(batch, degree, event.target.value)}
                                  inputMode="numeric"
                                  placeholder="—"
                                  aria-label={`${degree}, batch ${batch}`}
                                  aria-invalid={invalid}
                                  className="h-8 w-20 rounded-md text-right text-[13px] tabular-nums"
                                />
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-zinc-200 bg-zinc-50/80 font-semibold text-zinc-900">
                    <th scope="row" className="sticky left-0 z-10 bg-zinc-50 px-3 py-2.5 text-left sm:px-4">
                      All programs
                      <span className="ml-2 font-normal text-zinc-500 tabular-nums">{formatTotal(grandTotal)}</span>
                    </th>
                    {batchTotals.map((total, index) => (
                      <td key={batches[index]} className="px-2 py-2.5 pr-4.5 text-right tabular-nums">
                        {formatTotal(total)}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          <p className={cn("text-[12px]", hasInvalidCell ? "text-destructive" : "text-zinc-500")}>
            {hasInvalidCell
              ? "Each count must be a whole number. Correct the marked cells to save."
              : "Leave a cell blank when the registrar has no total for that program. The dashboard then hides the response rate for that program."}
          </p>
        </>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Remove {removedCount} stored {removedCount === 1 ? "total" : "totals"}?</DialogTitle>
            <DialogDescription>
              You cleared cells or removed batches that have saved totals. Saving deletes those totals,
              and the dashboard stops showing a response rate for them.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={commit}>Save and remove</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
