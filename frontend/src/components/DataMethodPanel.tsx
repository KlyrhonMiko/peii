"use client"

import { useId, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { ChevronDown, TableProperties } from "lucide-react"

import { ReportTable } from "@/components/ReportTable"
import type { ReportTable as ReportTableSpec } from "@/lib/peii-report"
import { cn } from "@/lib/utils"

/**
 * "Data and method" toggle under one dashboard chart. It holds only the tables behind that chart.
 *
 * - In a row of several charts (an ancestor marked `data-table-row`), the open tables render in
 *   the row's full-width `data-table-slot`, so the neighbouring charts keep their size and level.
 * - While the chart is being exported (`capturing`), the tables render inline under the chart so
 *   the PNG carries them. The toggle itself is never exported.
 */
export function DataMethodPanel({
  name,
  tables,
  capturing = false,
}: {
  /** Chart name, shown above the tables when they open in the row strip. */
  name: string
  tables: Array<ReportTableSpec | null | undefined>
  capturing?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const panelId = useId()
  const visible = tables.filter((table): table is ReportTableSpec => Boolean(table))
  if (visible.length === 0) return null

  const toggle = () => {
    if (!open) {
      const row = rootRef.current?.closest<HTMLElement>("[data-table-row]")
      setSlot(row?.querySelector<HTMLElement>(":scope > [data-table-slot]") ?? null)
    }
    setOpen((value) => !value)
  }

  const tableList = (
    <div className="flex flex-col gap-10">
      {visible.map((table) => (
        <ReportTable key={table.id} table={table} />
      ))}
    </div>
  )

  return (
    <div ref={rootRef} className="flex flex-col print:hidden">
      <button
        type="button"
        data-export-exclude="true"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={toggle}
        className="mt-6 flex items-center gap-2 border-t border-slate-200 py-3 text-left text-xs font-medium text-slate-500 transition-colors hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
      >
        <TableProperties aria-hidden="true" className="size-3.5 shrink-0" />
        <span className="truncate">{open ? "Hide data and method" : "Data and method"}</span>
        <span className="shrink-0 text-slate-400">· {visible.length === 1 ? "1 table" : `${visible.length} tables`}</span>
        <ChevronDown aria-hidden="true" className={cn("ml-auto size-3.5 shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {capturing ? (
        <div className="pt-4">{tableList}</div>
      ) : open && slot ? (
        createPortal(
          <section id={panelId} aria-label={`${name}: data and method`} className="mt-10 flex flex-col gap-6 border-t border-slate-200 pt-6">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">{name} · Data and method</p>
            {tableList}
          </section>,
          slot,
        )
      ) : open ? (
        <div id={panelId} className="pb-4 pt-2">{tableList}</div>
      ) : null}
    </div>
  )
}
