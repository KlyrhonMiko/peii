"use client"

import { type ComponentType, useState } from "react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
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
  ChevronDown,
  Check,
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
  userEmail?: string | null
}

export function QuestionInput({
  question,
  answer,
  error,
  onAnswer,
  onToggleMultiple,
  userEmail,
}: QuestionInputProps) {
  const [singleChoiceOpen, setSingleChoiceOpen] = useState(false)
  const errorId = `${question.id}-error`
  const hasError = Boolean(error)
  const fieldProps = {
    "aria-invalid": hasError,
    "aria-describedby": hasError ? errorId : undefined,
  } as const

  const isEmailRecordQuestion = question.question_type === "text" && question.question_text.includes("Record <email>")

  return (
    <div
      role="group"
      aria-labelledby={`q-title-${question.id}`}
      aria-describedby={hasError ? errorId : undefined}
      className={`rounded-2xl bg-white p-6 sm:p-8 transition-all ${hasError ? "border border-red-300" : "border border-zinc-200 shadow-sm"}`}
    >
      {!isEmailRecordQuestion && (
        <div className="mb-3 flex items-center gap-2 text-zinc-400">
          {(() => {
            const Icon = TYPE_ICON[question.question_type] ?? Type
            return <Icon className="size-[14px]" />
          })()}
          <span className="text-[11px] font-medium uppercase tracking-widest">
            {TYPE_LABEL[question.question_type] ?? question.question_type}
          </span>
        </div>
      )}
      
      <div id={`q-title-${question.id}`} className={isEmailRecordQuestion ? "sr-only" : "mb-6 text-[16px] font-medium leading-relaxed text-zinc-900"}>
        {question.question_text}
        {question.is_required && <span className="ml-1 text-red-500" aria-hidden="true">*</span>}
        {question.is_required && <span className="sr-only"> (required)</span>}
      </div>
      
      {hasError && (
        <p id={errorId} role="alert" className="mb-5 text-[13.5px] font-medium text-red-500">
          {error}
        </p>
      )}

      {/* Single Choice */}
      {question.question_type === "single_choice" && (
        <Popover open={singleChoiceOpen} onOpenChange={setSingleChoiceOpen}>
          <PopoverTrigger
            render={
              <button
                type="button"
                id={`q-${question.id}`}
                aria-label={question.question_text}
                {...fieldProps}
                className={cn(
                  "flex h-11 w-full items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50/50 px-4 text-[14px] text-zinc-900 outline-none transition-all hover:bg-zinc-50 focus:border-zinc-900 focus:bg-white focus:ring-4 focus:ring-zinc-900/5",
                  !(answer as string | undefined) && "text-zinc-500"
                )}
              >
                <span>{(answer as string | undefined) || "Select an option…"}</span>
                <ChevronDown className="size-4 text-zinc-400 opacity-60" />
              </button>
            }
          />
          <PopoverContent
            align="start"
            className="flex w-(--anchor-width) min-w-[200px] flex-col gap-0.5 rounded-lg border border-slate-200 bg-white p-1 shadow-md animate-in fade-in-0 zoom-in-95 duration-100"
          >
            {(question.options ?? []).map((option) => {
              const isSelected = answer === option
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    onAnswer(question.id, option)
                    setSingleChoiceOpen(false)
                  }}
                  className={cn(
                    "flex w-full cursor-pointer items-center justify-between rounded-md px-2.5 py-1.5 text-left text-[13px] font-medium transition-colors outline-none",
                    isSelected
                      ? "bg-zinc-100 font-semibold text-zinc-900"
                      : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                  )}
                >
                  <span>{option}</span>
                  {isSelected && <Check className="size-3.5 text-zinc-900" />}
                </button>
              )
            })}
          </PopoverContent>
        </Popover>
      )}

      {/* Multiple Choice */}
      {question.question_type === "multiple_choice" && (
        <div className="space-y-2">
          {(question.options ?? []).map((option) => {
            const selected = ((answer as string[] | undefined) ?? []).includes(option)
            return (
              <label
                key={option}
                className={`flex cursor-pointer items-center gap-3.5 rounded-xl border px-4 py-3.5 transition-all ${selected ? "border-zinc-900 bg-zinc-50 text-zinc-900" : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50/50"}`}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => onToggleMultiple(question.id, option)}
                  aria-label={`${question.question_text}: ${option}`}
                  {...fieldProps}
                  className="size-[18px] cursor-pointer rounded-sm accent-zinc-900"
                />
                <span className={`text-[14px] ${selected ? "font-medium" : ""}`}>{option}</span>
              </label>
            )
          })}
        </div>
      )}

      {/* Text */}
      {question.question_type === "text" && !isEmailRecordQuestion && (
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
          className="w-full resize-none border-b border-zinc-200 bg-transparent pb-2 pt-1 text-[15px] font-normal text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-zinc-900"
          placeholder="Your answer"
        />
      )}

      {/* Email Record Checkbox */}
      {isEmailRecordQuestion && (
        <label className="group flex cursor-pointer items-center gap-3.5 py-1">
          <input
            type="checkbox"
            checked={!!answer}
            onChange={(e) => {
              if (e.target.checked) {
                onAnswer(question.id, userEmail || "recorded@email.com")
              } else {
                onAnswer(question.id, "")
              }
            }}
            aria-label={question.question_text}
            {...fieldProps}
            className="size-[18px] cursor-pointer rounded-sm accent-zinc-900"
          />
          <span className={`text-[15px] transition-colors group-hover:text-zinc-900 ${answer ? "font-medium text-zinc-900" : "text-zinc-600"}`}>
            {question.question_text.replace("<email>", userEmail || "your email")}
            {question.is_required && <span className="ml-1 text-red-500" aria-hidden="true">*</span>}
          </span>
        </label>
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
          className="w-full max-w-[240px] border-b border-zinc-200 bg-transparent pb-2 pt-1 text-[15px] font-normal text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-zinc-900"
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
          <div className="flex flex-col items-center justify-center rounded-xl bg-zinc-50/50 px-4 py-6 border border-zinc-100">
            <div className="flex w-full max-w-[500px] items-end justify-between gap-3">
              {minLabel && <span className="mb-[18px] max-w-[100px] text-right text-[12px] font-medium leading-snug text-zinc-500">{minLabel}</span>}
              <div className="flex flex-1 items-start justify-center gap-2 sm:gap-6">
                {range.map((number) => {
                  const selected = answer === number
                  return (
                    <label key={number} className="group flex flex-1 cursor-pointer flex-col items-center gap-2.5">
                      <span className={`text-[13px] font-medium transition-colors ${selected ? "text-zinc-900" : "text-zinc-400 group-hover:text-zinc-600"}`}>{number}</span>
                      <input
                        type="radio"
                        name={`scale-${question.id}`}
                        value={number}
                        checked={selected}
                        onChange={() => onAnswer(question.id, number)}
                        aria-label={`${question.question_text}: ${number}`}
                        {...fieldProps}
                        className="size-4 cursor-pointer accent-zinc-900"
                      />
                      {question.options && question.options[number - min] && (
                        <span className={`mt-1 text-center text-[11px] leading-tight transition-colors ${selected ? "text-zinc-900 font-medium" : "text-zinc-400"}`}>
                          {question.options[number - min]}
                        </span>
                      )}
                    </label>
                  )
                })}
              </div>
              {maxLabel && <span className="mb-[18px] max-w-[100px] text-left text-[12px] font-medium leading-snug text-zinc-500">{maxLabel}</span>}
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
          <div className="space-y-3">
            <p className="mb-2 text-[13px] text-zinc-500">Rank the choices using the arrows:</p>
            {currentOrder.map((option, index) => (
              <div key={option} className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-3.5 transition-all hover:border-zinc-300 hover:shadow-sm">
                <div className="flex items-center gap-3.5">
                  <span className="flex size-7 items-center justify-center rounded-md bg-zinc-100 text-[12px] font-semibold text-zinc-500">{index + 1}</span>
                  <span className="text-[14px] font-medium text-zinc-800">{option}</span>
                </div>
                <div className="flex gap-1">
                  <Button type="button" variant="ghost" onClick={() => handleMove(index, "up")} disabled={index === 0} aria-label={`Move ${option} up`} className="size-8 p-0 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-30">
                    <ArrowLeft className="size-4 rotate-90" />
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => handleMove(index, "down")} disabled={index === currentOrder.length - 1} aria-label={`Move ${option} down`} className="size-8 p-0 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-30">
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
          <div className="-mx-6 sm:-mx-8 px-6 sm:px-8">
            <table className="w-full table-fixed border-collapse text-sm">
              <caption className="sr-only">{question.question_text}</caption>
              <thead>
                <tr className="border-b border-zinc-200">
                  <th scope="col" className="w-1/2 py-3 pr-4 text-left text-[11px] font-medium uppercase tracking-wider text-zinc-400" />
                  {columns.map((column) => (
                    <th scope="col" key={column} className="px-1 sm:px-3 py-3 text-center text-[11px] sm:text-[12px] font-semibold text-zinc-500">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr key={row} className="border-b border-zinc-100 transition-colors last:border-0 hover:bg-zinc-50/50">
                    <th scope="row" className="py-4 pr-4 text-left text-[14px] font-medium text-zinc-800 text-pretty">{row}</th>
                    {columns.map((column) => (
                      <td key={column} className="px-3 py-4 text-center">
                        <input
                          type="radio"
                          name={`matrix-${question.id}-row-${rowIndex}`}
                          value={column}
                          checked={matrixAnswers[row] === column}
                          onChange={() => onAnswer(question.id, { ...matrixAnswers, [row]: column })}
                          aria-label={`${row}: ${column}`}
                          {...fieldProps}
                          className="size-4 cursor-pointer accent-zinc-900"
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
          className="h-11 w-full max-w-[200px] rounded-lg border border-zinc-200 bg-zinc-50/50 px-4 text-[14px] text-zinc-900 outline-none transition-all hover:bg-zinc-50 focus:border-zinc-900 focus:bg-white focus:ring-4 focus:ring-zinc-900/5"
        />
      )}

      {/* File */}
      {question.question_type === "file" && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-zinc-200 bg-zinc-50/50 px-4 py-8 text-center">
          <Upload className="size-6 text-zinc-400" />
          <p className="text-[13px] text-zinc-500">File upload questions are not currently supported.</p>
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
                className={`flex flex-1 cursor-pointer items-center justify-center gap-3 rounded-xl border px-4 py-3.5 transition-all ${selected ? "border-zinc-900 bg-zinc-50 text-zinc-900" : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50/50"}`}
              >
                <input
                  type="radio"
                  name={`boolean-${question.id}`}
                  value={String(boolValue)}
                  checked={selected}
                  onChange={() => onAnswer(question.id, boolValue)}
                  aria-label={`${question.question_text}: ${option}`}
                  {...fieldProps}
                  className="size-[18px] cursor-pointer accent-zinc-900"
                />
                <span className={`text-[14px] ${selected ? "font-medium" : ""}`}>{option}</span>
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}
