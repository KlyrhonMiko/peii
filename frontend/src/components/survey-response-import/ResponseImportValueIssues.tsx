"use client"

import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import type { SurveyResponseImportQuestion, SurveyResponseImportValueIssue } from "@/lib/surveys"
import { valueIssueChoice, valueIssueKey } from "./import-helpers"
import type { ValueOverrides } from "./import-helpers"

const UNRESOLVED = ""
const LEAVE_BLANK = "blank"

function optionValue(index: number): string {
  return `option:${index}`
}

function selectValue(issue: SurveyResponseImportValueIssue, choice: string | null | undefined): string {
  if (choice === undefined) return UNRESOLVED
  if (choice === null) return LEAVE_BLANK
  const index = issue.options.indexOf(choice)
  return index === -1 ? UNRESOLVED : optionValue(index)
}

interface ResponseImportValueIssuesProps {
  issues: SurveyResponseImportValueIssue[]
  questions: SurveyResponseImportQuestion[]
  valueOverrides: ValueOverrides
  disabled: boolean
  onValueChange: (issue: SurveyResponseImportValueIssue, choice: string | null) => void
}

export function ResponseImportValueIssues({
  issues,
  questions,
  valueOverrides,
  disabled,
  onValueChange,
}: ResponseImportValueIssuesProps) {
  const questionText = new Map(questions.map((question) => [question.question_id, question.question_text]))

  return (
    <ul className="flex min-w-0 flex-col divide-y divide-border rounded-lg border border-border">
      {issues.map((issue, index) => {
        const selectId = `import-value-${index}`
        const choice = valueIssueChoice(issue, valueOverrides)
        const question = questionText.get(issue.question_id)
        return (
          <li
            key={valueIssueKey(issue)}
            className="grid min-w-0 grid-cols-1 gap-2 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,16rem)] sm:items-center sm:gap-4"
          >
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="text-sm text-foreground [overflow-wrap:anywhere]">
                <span className="font-medium">&ldquo;{issue.raw_value}&rdquo;</span>
                <span className="text-muted-foreground"> · {issue.count} {issue.count === 1 ? "row" : "rows"}</span>
              </p>
              <p className="truncate text-xs text-muted-foreground" title={question ?? issue.column}>
                Column: {issue.column}
                {question && question !== issue.column ? ` · ${question}` : ""}
              </p>
            </div>
            <div className="min-w-0">
              <label htmlFor={selectId} className="sr-only">
                {`Value to use for "${issue.raw_value}" in ${issue.column}`}
              </label>
              <NativeSelect
                id={selectId}
                size="sm"
                className="w-full"
                value={selectValue(issue, choice)}
                disabled={disabled}
                aria-invalid={choice === undefined || undefined}
                onChange={(event) => {
                  const next = event.target.value
                  if (next === UNRESOLVED) return
                  if (next === LEAVE_BLANK) {
                    onValueChange(issue, null)
                    return
                  }
                  const option = issue.options[Number(next.slice("option:".length))]
                  if (option !== undefined) onValueChange(issue, option)
                }}
              >
                <NativeSelectOption value={UNRESOLVED} disabled>Choose a value</NativeSelectOption>
                {issue.options.map((option, optionIndex) => (
                  <NativeSelectOption key={`${option}-${optionIndex}`} value={optionValue(optionIndex)}>
                    {option === issue.suggestion ? `${option} (suggested)` : option}
                  </NativeSelectOption>
                ))}
                <NativeSelectOption value={LEAVE_BLANK}>Leave blank</NativeSelectOption>
              </NativeSelect>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
