import { ChevronRight, ShieldAlert, TriangleAlert } from "lucide-react"
import type { ReactNode } from "react"

import type { SurveyResponseImportIssue, SurveyResponseImportPreview } from "@/lib/surveys"
import { issueLocation, matchText, rowSummaryText, skippedRowsText } from "./import-helpers"

function ListDetails({
  title,
  total,
  shown,
  defaultOpen = false,
  children,
}: {
  title: string
  total: number
  shown: number
  defaultOpen?: boolean
  children: ReactNode
}) {
  return (
    <details className="group min-w-0 rounded-lg border border-border" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-medium text-foreground [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" aria-hidden="true" />
        <span>{title} ({total})</span>
      </summary>
      <div className="flex min-w-0 flex-col gap-1 border-t border-border px-3 py-2">
        <ul className="flex max-h-40 min-w-0 flex-col gap-1 overflow-y-auto text-xs text-muted-foreground [overflow-wrap:anywhere]">
          {children}
        </ul>
        {total > shown && (
          <p className="text-xs text-muted-foreground">Showing the first {shown} of {total}.</p>
        )}
      </div>
    </details>
  )
}

function IssueItems({ issues, prefix }: { issues: SurveyResponseImportIssue[]; prefix: string }) {
  return issues.map((issue, index) => (
    <li key={`${prefix}-${issue.row ?? "file"}-${issue.column ?? ""}-${index}`}>
      <span className="font-medium text-foreground">{issueLocation(issue)}:</span> {issue.message}
    </li>
  ))
}

export function ResponseImportSummary({ preview }: { preview: SurveyResponseImportPreview }) {
  const skippedRows = skippedRowsText(preview.rows)
  // The backend also reports skipped rows as a warning; show that sentence once.
  const warnings = preview.warnings.filter((warning) => warning !== skippedRows)
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-sm font-medium text-foreground">
          {preview.rows.total} {preview.rows.total === 1 ? "row" : "rows"} in the file
        </p>
        <p className="text-sm text-muted-foreground">{rowSummaryText(preview.rows)}</p>
        {skippedRows && <p className="text-sm font-medium text-foreground">{skippedRows}</p>}
        <p className="text-xs text-muted-foreground">
          A row counts as the same person when the email, contact number, or name matches an existing
          response or an earlier row, or when every answer matches. These rows do not add a new
          response. They only fill blank answers and never replace saved answers.
        </p>
      </div>

      {preview.includes_personal_data && (
        <div className="flex min-w-0 items-start gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-foreground">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <p>
            This file contains personal data, such as names or contact details. The import stores it, and
            anyone with raw response access can see it.
          </p>
        </div>
      )}

      {warnings.length > 0 && (
        <ul className="flex min-w-0 flex-col gap-1 rounded-lg border border-peii-tier3/50 bg-peii-tier3/10 px-3 py-2 text-sm text-foreground">
          {warnings.map((warning, index) => (
            <li key={`${warning}-${index}`} className="flex items-start gap-2">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 [overflow-wrap:anywhere]">{warning}</span>
            </li>
          ))}
        </ul>
      )}

      {preview.error_count > 0 && (
        <ListDetails title="Errors" total={preview.error_count} shown={preview.errors.length} defaultOpen>
          <IssueItems issues={preview.errors} prefix="error" />
        </ListDetails>
      )}

      {preview.conflict_count > 0 && (
        <ListDetails title="Saved answers kept" total={preview.conflict_count} shown={preview.conflicts.length}>
          <IssueItems issues={preview.conflicts} prefix="conflict" />
        </ListDetails>
      )}

      {preview.match_count > 0 && (
        <ListDetails title="Duplicate rows" total={preview.match_count} shown={preview.matches.length}>
          {preview.matches.map((match) => (
            <li key={`match-${match.row}`}>{matchText(match)}</li>
          ))}
        </ListDetails>
      )}
    </div>
  )
}
