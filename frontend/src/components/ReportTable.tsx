import { AlertTriangle } from "lucide-react"

import type { ReportTable as ReportTableSpec } from "@/lib/peii-report"
import { cn } from "@/lib/utils"

/**
 * One Chapter 3 style table: number and italic title, ruled header, totals in bold, then the
 * generated note and the method line. Used by the dashboard panels and the printable report.
 */
export function ReportTable({
  table,
  number,
  variant = "panel",
}: {
  table: ReportTableSpec
  /** Table number in the printable report; panels omit it. */
  number?: number
  variant?: "panel" | "print"
}) {
  const print = variant === "print"
  const titleId = `report-table-${table.id}`

  return (
    <figure {...(print ? { "data-pdf-block": "" } : {})} className={cn("flex flex-col gap-3 break-inside-avoid", print ? "gap-2" : "")}>
      <figcaption id={titleId} className="flex flex-col gap-0.5">
        {number !== undefined && <span className="text-sm font-bold text-slate-900">Table {number}</span>}
        <span id={`${titleId}-title`} className={cn("italic text-slate-700", print ? "text-sm" : "text-sm font-medium")}>{table.title}</span>
      </figcaption>

      <div className="overflow-x-auto">
        <table aria-labelledby={`${titleId}-title`} className="w-full border-collapse text-sm tabular-nums">
          <thead>
            <tr className="border-y border-slate-900">
              {table.columns.map((column, index) => (
                <th
                  key={`${column.label}-${index}`}
                  scope="col"
                  className={cn(
                    "px-2 py-2 align-bottom font-semibold text-slate-900 first:pl-0 last:pr-0",
                    column.align === "right" ? "text-right" : "text-left",
                  )}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                className={cn(
                  !print && "transition-colors hover:bg-slate-100/70",
                  row.kind === "total" && "font-semibold text-slate-900",
                  row.kind === "subtotal" && "italic text-slate-500",
                  rowIndex === table.rows.length - 1 && "border-b border-slate-900",
                )}
              >
                {row.cells.map((cell, cellIndex) => {
                  const column = table.columns[cellIndex]
                  const Cell = cellIndex === 0 ? "th" : "td"
                  return (
                    <Cell
                      key={cellIndex}
                      {...(cellIndex === 0 ? { scope: "row" } : {})}
                      className={cn(
                        "px-2 py-1.5 align-top first:pl-0 last:pr-0",
                        cellIndex === 0 ? "font-normal" : "",
                        row.kind === "total" && "font-semibold",
                        column?.align === "right" ? "text-right" : "text-left",
                        // Keep figures on one line; long text values may wrap.
                        column?.align === "right" && cell.length <= 16 && "whitespace-nowrap",
                        row.kind ? "" : "text-slate-700",
                      )}
                    >
                      {cell}
                    </Cell>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {table.warning && (
        <p role="alert" className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle aria-hidden="true" className="mt-px size-3.5 shrink-0" />
          {table.warning}
        </p>
      )}
      <div className="flex flex-col gap-1 text-xs leading-relaxed text-slate-600">
        {table.note && (
          <p>
            <span className="italic">Note.</span> {table.note}
          </p>
        )}
        {table.method && (
          <p>
            <span className="italic">Method.</span> {table.method}
          </p>
        )}
      </div>
    </figure>
  )
}
