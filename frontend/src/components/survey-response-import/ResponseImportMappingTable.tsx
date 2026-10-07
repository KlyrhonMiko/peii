"use client"

import { CheckCircle2, CircleAlert, CircleMinus, CircleHelp } from "lucide-react"
import type { ReactNode } from "react"

import {
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
} from "@/components/ui/native-select"
import { cn } from "@/lib/utils"
import type {
  SurveyResponseImportColumn,
  SurveyResponseImportColumnStatus,
  SurveyResponseImportQuestion,
} from "@/lib/surveys"
import {
  COLUMN_TARGET_IGNORE,
  COLUMN_TARGET_MATCH_ONLY,
  COLUMN_TARGET_SUBMITTED_AT,
  columnTargetValue,
  groupQuestionsBySection,
  sortColumnsForReview,
} from "./import-helpers"
import type { ColumnOverrides } from "./import-helpers"

const STATUS_LABELS: Record<SurveyResponseImportColumnStatus, string> = {
  matched: "Matched",
  check: "Check",
  unmatched: "Not matched",
  ignored: "Not imported",
}

const STATUS_STYLES: Record<SurveyResponseImportColumnStatus, string> = {
  matched: "bg-muted text-foreground",
  check: "border-peii-tier3/50 bg-peii-tier3/10 text-foreground",
  unmatched: "border-destructive/30 bg-destructive/10 text-destructive",
  ignored: "bg-muted text-muted-foreground",
}

const STATUS_ICONS: Record<SurveyResponseImportColumnStatus, ReactNode> = {
  matched: <CheckCircle2 className="size-3" aria-hidden="true" />,
  check: <CircleHelp className="size-3" aria-hidden="true" />,
  unmatched: <CircleAlert className="size-3" aria-hidden="true" />,
  ignored: <CircleMinus className="size-3" aria-hidden="true" />,
}

export function ImportStatusBadge({ status }: { status: SurveyResponseImportColumnStatus }) {
  return (
    <span
      className={cn(
        "inline-flex w-fit shrink-0 items-center gap-1 rounded-md border border-transparent px-1.5 py-0.5 text-xs font-medium",
        STATUS_STYLES[status],
      )}
    >
      {STATUS_ICONS[status]}
      {STATUS_LABELS[status]}
    </span>
  )
}

function shortText(text: string, max = 90): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

interface ResponseImportMappingTableProps {
  columns: SurveyResponseImportColumn[]
  questions: SurveyResponseImportQuestion[]
  columnOverrides: ColumnOverrides
  disabled: boolean
  onColumnChange: (columnIndex: number, target: string) => void
}

export function ResponseImportMappingTable({
  columns,
  questions,
  columnOverrides,
  disabled,
  onColumnChange,
}: ResponseImportMappingTableProps) {
  const groups = groupQuestionsBySection(questions)
  const sortedColumns = sortColumnsForReview(columns)
  const gridColumns = "sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1.5fr)_7rem]"

  return (
    <div className="flex min-w-0 flex-col rounded-lg border border-border">
      <div
        aria-hidden="true"
        className={cn(
          "hidden gap-3 border-b border-border bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground sm:grid",
          gridColumns,
        )}
      >
        <span>Spreadsheet column</span>
        <span>Sample values</span>
        <span>Import as</span>
        <span>Status</span>
      </div>
      <ul className="flex min-w-0 flex-col divide-y divide-border">
        {sortedColumns.map((column) => {
          const selectId = `import-column-${column.index}`
          const value = columnOverrides[String(column.index)] ?? columnTargetValue(column)
          const header = column.header || `Column ${column.index + 1}`
          return (
            <li
              key={column.index}
              className={cn("grid min-w-0 grid-cols-1 gap-2 px-3 py-3 sm:items-start sm:gap-3", gridColumns)}
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm font-medium text-foreground [overflow-wrap:anywhere]">{header}</span>
                {column.reason && <span className="text-xs text-muted-foreground">{column.reason}</span>}
              </div>
              <div className="min-w-0 text-xs text-muted-foreground">
                {column.samples.length > 0 ? (
                  <p className="truncate" title={column.samples.join(" · ")}>
                    <span className="sm:sr-only">Samples: </span>
                    {column.samples.join(" · ")}
                  </p>
                ) : (
                  <p className="hidden sm:block">—</p>
                )}
              </div>
              <div className="min-w-0">
                <label htmlFor={selectId} className="sr-only">{`Import column "${header}" as`}</label>
                <NativeSelect
                  id={selectId}
                  size="sm"
                  className="w-full"
                  value={value}
                  disabled={disabled}
                  onChange={(event) => onColumnChange(column.index, event.target.value)}
                >
                  <NativeSelectOptGroup label="Other uses">
                    <NativeSelectOption value={COLUMN_TARGET_SUBMITTED_AT}>Timestamp (submission time)</NativeSelectOption>
                    <NativeSelectOption value={COLUMN_TARGET_MATCH_ONLY}>Use only to find duplicates</NativeSelectOption>
                    <NativeSelectOption value={COLUMN_TARGET_IGNORE}>Don&apos;t import</NativeSelectOption>
                  </NativeSelectOptGroup>
                  {groups.map((group, groupIndex) => (
                    <NativeSelectOptGroup key={`${group.sectionTitle}-${groupIndex}`} label={group.sectionTitle}>
                      {group.questions.map((question) => (
                        <NativeSelectOption
                          key={question.question_id}
                          value={question.question_id}
                          disabled={!question.importable}
                        >
                          {question.importable
                            ? shortText(question.question_text)
                            : `${shortText(question.question_text)} (cannot import)`}
                        </NativeSelectOption>
                      ))}
                    </NativeSelectOptGroup>
                  ))}
                </NativeSelect>
              </div>
              <div className="order-first sm:order-none">
                <ImportStatusBadge status={column.status} />
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
