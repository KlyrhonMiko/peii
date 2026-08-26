"use client"

import { type ComponentType } from "react"
import { Button } from "@/components/ui/button"
import {
  Star,
  ArrowUpDown,
  Table,
  Calendar,
  Upload,
  ToggleLeft,
  ListChecks,
  Type,
  Hash,
  Circle,
  ArrowLeft,
  ArrowRight,
} from "lucide-react"
import type { PublicAnswerValue, PublicSurveyQuestion } from "@/lib/public-survey"

const TYPE_ICON: Record<string, ComponentType<{ className?: string }>> = {
  single_choice: Circle,
  multiple_choice: ListChecks,
  text: Type,
  number: Hash,
  scale: Star,
  ranking: ArrowUpDown,
  matrix: Table,
  datetime: Calendar,
  file: Upload,
  boolean: ToggleLeft,
}

const TYPE_LABEL: Record<string, string> = {
  single_choice: "Single Choice",
  multiple_choice: "Multiple Choice",
  text: "Text",
  number: "Number",
  scale: "Scale",
  ranking: "Ranking",
  matrix: "Matrix",
  datetime: "Date/Time",
  file: "File Upload",
  boolean: "Yes/No",
}

interface QuestionInputProps {
  question: PublicSurveyQuestion
  answer: PublicAnswerValue | undefined
  error: string | undefined
  onAnswer: (questionId: string, value: PublicAnswerValue) => void
  onToggleMultiple: (questionId: string, option: string) => void
}

export function QuestionInput({
  question,
  answer,
  error,
  onAnswer,
  onToggleMultiple,
}: QuestionInputProps) {
  const errorId = `${question.id}-error`
  const hasError = Boolean(error)
  const fieldProps = {
    "aria-invalid": hasError,
    "aria-describedby": hasError ? errorId : undefined,
  } as const

  return (
    <fieldset
      aria-invalid={hasError}
      aria-describedby={hasError ? errorId : undefined}
      className={`rounded-xl bg-white px-7 py-5 shadow-sm ring-1 transition-all ${hasError ? "bg-red-50/10 ring-red-400" : "ring-black/[0.04]"}`}
    >
      <legend className="mb-4 block text-sm font-medium text-slate-800">
        {question.question_text}
        {question.is_required && <span className="ml-1 text-red-500" aria-hidden="true">*</span>}
        {question.is_required && <span className="sr-only"> (required)</span>}
      </legend>
      <div className="mb-1 flex items-center gap-2">
        {(() => {
          const Icon = TYPE_ICON[question.question_type] ?? Type
          return <Icon className="size-4 text-indigo-500" />
        })()}
        <span className="text-[11px] font-medium uppercase tracking-wider text-indigo-500">
          {TYPE_LABEL[question.question_type] ?? question.question_type}
        </span>
      </div>
      {hasError && (
        <p id={errorId} role="alert" className="mb-4 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-[13px] font-semibold text-red-600">
          {error}
        </p>
      )}

      {/* Single Choice */}
      {question.question_type === "single_choice" && (
        <select
          id={`q-${question.id}`}
          name={`q-${question.id}`}
          value={(answer as string | undefined) ?? ""}
          onChange={(event) => onAnswer(question.id, event.target.value)}
          aria-label={question.question_text}
          {...fieldProps}
          className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3.5 text-sm text-slate-700 outline-none transition-colors focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/10"
        >
          <option value="">Select an option…</option>
          {(question.options ?? []).map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      )}

      {/* Multiple Choice */}
      {question.question_type === "multiple_choice" && (
        <div className="space-y-2">
          {(question.options ?? []).map((option) => {
            const selected = ((answer as string[] | undefined) ?? []).includes(option)
            return (
              <label
                key={option}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3.5 py-3 text-sm transition-all hover:border-indigo-200 hover:bg-slate-50 ${selected ? "border-indigo-200 bg-indigo-50/20 text-indigo-900" : "border-slate-100 bg-slate-50/20 text-slate-700"}`}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => onToggleMultiple(question.id, option)}
                  aria-label={`${question.question_text}: ${option}`}
                  {...fieldProps}
                  className="size-4 accent-indigo-600"
                />
                <span className={selected ? "font-medium" : ""}>{option}</span>
              </label>
            )
          })}
        </div>
      )}

      {/* Text */}
      {question.question_type === "text" && (
        <textarea
          id={`q-${question.id}`}
          rows={1}
          value={(answer as string) ?? ""}
          onChange={(event) => {
            onAnswer(question.id, event.target.value)
            event.target.style.height = "auto"
            event.target.style.height = `${event.target.scrollHeight}px`
          }}
          aria-label={question.question_text}
          {...fieldProps}
          className="mt-2 w-full resize-none border-b border-slate-200 bg-transparent pb-1.5 pt-1 text-sm font-normal outline-none transition-colors placeholder:text-slate-400 focus:border-indigo-600"
          placeholder="Your answer"
        />
      )}

      {/* Number */}
      {question.question_type === "number" && (
        <input
          id={`q-${question.id}`}
          type="number"
          value={(answer as number | string | undefined) ?? ""}
          onChange={(event) => onAnswer(question.id, event.target.value ? Number(event.target.value) : "")}
          aria-label={question.question_text}
          {...fieldProps}
          className="mt-2 w-full max-w-[200px] border-b border-slate-200 bg-transparent pb-1.5 pt-1 text-sm font-normal outline-none transition-colors placeholder:text-slate-400 focus:border-indigo-600"
          placeholder="Your answer"
        />
      )}

      {/* Scale */}
      {question.question_type === "scale" && (() => {
        const min = typeof question.config?.min === "number" ? question.config.min : 1
        const max = typeof question.config?.max === "number" ? question.config.max : (question.options?.length ?? 4)
        const minLabel = typeof question.config?.min_label === "string" ? question.config.min_label : undefined
        const maxLabel = typeof question.config?.max_label === "string" ? question.config.max_label : undefined
        const range = Array.from({ length: max - min + 1 }, (_, index) => min + index)
        return (
          <div className="flex flex-col items-center justify-center rounded-xl bg-slate-50/30 px-4 py-4">
            <div className="flex w-full max-w-[500px] items-end justify-between gap-2.5">
              {minLabel && <span className="mb-2 max-w-[120px] text-right text-xs font-medium leading-tight text-slate-500">{minLabel}</span>}
              <div className="flex flex-1 items-start justify-center gap-2 sm:gap-4">
                {range.map((number) => {
                  const selected = answer === number
                  return (
                    <label key={number} className="group flex max-w-[70px] flex-1 cursor-pointer flex-col items-center gap-1.5">
                      <span className="text-xs font-semibold text-slate-500 group-hover:text-indigo-600">{number}</span>
                      <input
                        type="radio"
                        name={`scale-${question.id}`}
                        value={number}
                        checked={selected}
                        onChange={() => onAnswer(question.id, number)}
                        aria-label={`${question.question_text}: ${number}`}
                        {...fieldProps}
                        className="size-4 accent-indigo-600"
                      />
                      {question.options && question.options[number - min] && (
                        <span className="mt-1 text-center text-[10px] font-medium leading-tight text-slate-400">
                          {question.options[number - min]}
                        </span>
                      )}
                    </label>
                  )
                })}
              </div>
              {maxLabel && <span className="mb-2 max-w-[120px] text-left text-xs font-medium leading-tight text-slate-500">{maxLabel}</span>}
            </div>
          </div>
        )
      })()}

      {/* Ranking */}
      {question.question_type === "ranking" && (() => {
        const currentOrder = (answer as string[] | undefined) ?? question.options ?? []
        const handleMove = (index: number, direction: "up" | "down") => {
          const nextOrder = [...currentOrder]
          const targetIndex = direction === "up" ? index - 1 : index + 1
          if (targetIndex < 0 || targetIndex >= nextOrder.length) return
          const current = nextOrder[index]
          const target = nextOrder[targetIndex]
          if (current === undefined || target === undefined) return
          nextOrder[index] = target
          nextOrder[targetIndex] = current
          onAnswer(question.id, nextOrder)
        }
        return (
          <div className="space-y-2.5">
            <p className="mb-1 text-[11px] italic text-slate-400">Rank the choices using the arrow buttons:</p>
            {currentOrder.map((option, index) => (
              <div key={option} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-white p-3 shadow-sm transition-all hover:border-indigo-200">
                <div className="flex items-center gap-3">
                  <span className="flex size-6 items-center justify-center rounded bg-slate-100 text-xs font-bold text-slate-500">{index + 1}</span>
                  <span className="text-sm font-medium text-slate-700">{option}</span>
                </div>
                <div className="flex gap-1">
                  <Button type="button" variant="ghost" onClick={() => handleMove(index, "up")} disabled={index === 0} aria-label={`Move ${option} up`} className="h-8 w-8 p-0 text-slate-400 hover:bg-slate-50 hover:text-indigo-600 disabled:opacity-40">
                    <ArrowLeft className="size-4 rotate-90" />
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => handleMove(index, "down")} disabled={index === currentOrder.length - 1} aria-label={`Move ${option} down`} className="h-8 w-8 p-0 text-slate-400 hover:bg-slate-50 hover:text-indigo-600 disabled:opacity-40">
                    <ArrowRight className="size-4 rotate-90" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )
      })()}

      {/* Matrix */}
      {question.question_type === "matrix" && (() => {
        const configuredColumns = question.config?.columns
        const columns = Array.isArray(configuredColumns)
          ? configuredColumns.filter((column): column is string => typeof column === "string")
          : ["Poor", "Fair", "Good", "Excellent"]
        const rows = question.options ?? []
        const matrixAnswers = (answer as Record<string, string> | undefined) ?? {}
        return (
          <div className="-mx-7 overflow-x-auto px-7">
            <table className="w-full min-w-[500px] border-collapse text-sm">
              <caption className="sr-only">{question.question_text}</caption>
              <thead>
                <tr className="border-b border-slate-200">
                  <th scope="col" className="w-2/5 py-2.5 pr-4 text-left text-xs font-medium uppercase tracking-wider text-slate-500" />
                  {columns.map((column) => (
                    <th scope="col" key={column} className="w-1/5 min-w-[80px] px-3 py-2.5 text-center text-xs font-semibold text-slate-500">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr key={row} className="border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50/50">
                    <th scope="row" className="py-3.5 pr-4 text-left text-sm font-medium text-slate-700">{row}</th>
                    {columns.map((column) => (
                      <td key={column} className="px-3 py-3.5 text-center">
                        <input
                          type="radio"
                          name={`matrix-${question.id}-row-${rowIndex}`}
                          value={column}
                          checked={matrixAnswers[row] === column}
                          onChange={() => onAnswer(question.id, { ...matrixAnswers, [row]: column })}
                          aria-label={`${row}: ${column}`}
                          {...fieldProps}
                          className="size-4 accent-indigo-600"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      })()}

      {/* Datetime */}
      {question.question_type === "datetime" && (
        <input
          id={`q-${question.id}`}
          type="date"
          value={(answer as string) ?? ""}
          onChange={(event) => onAnswer(question.id, event.target.value)}
          aria-label={question.question_text}
          {...fieldProps}
          className="h-10 w-48 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition-colors focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/10"
        />
      )}

      {/* File */}
      {question.question_type === "file" && (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-6 text-center">
          <Upload className="size-6 text-slate-400" />
          <p className="text-xs text-slate-500">File upload questions are not currently supported.</p>
        </div>
      )}

      {/* Boolean */}
      {question.question_type === "boolean" && (
        <div className="flex gap-4">
          {["Yes", "No"].map((option) => {
            const boolValue = option === "Yes"
            const selected = answer === boolValue
            return (
              <label
                key={option}
                className={`flex flex-1 cursor-pointer items-center justify-center gap-3 rounded-lg border px-4 py-3 text-sm transition-all hover:border-indigo-200 hover:bg-slate-50 ${selected ? "border-indigo-200 bg-indigo-50/20 text-indigo-900" : "border-slate-100 bg-slate-50/20 text-slate-700"}`}
              >
                <input
                  type="radio"
                  name={`boolean-${question.id}`}
                  value={String(boolValue)}
                  checked={selected}
                  onChange={() => onAnswer(question.id, boolValue)}
                  aria-label={`${question.question_text}: ${option}`}
                  {...fieldProps}
                  className="size-4 accent-indigo-600"
                />
                <span className={selected ? "font-medium" : ""}>{option}</span>
              </label>
            )
          })}
        </div>
      )}
    </fieldset>
  )
}
