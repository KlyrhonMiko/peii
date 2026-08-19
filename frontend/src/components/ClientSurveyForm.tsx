"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { SurveySelect } from "@/components/SurveySelect"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  ClipboardList,
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
  ShieldCheck,
  Loader2,
  CheckCircle,
  AlertCircle,
} from "lucide-react"

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1"

interface PublicQuestion {
  id: string
  question_text: string
  question_type: string
  options: string[] | null
  config: Record<string, unknown> | null
  order_index: number
  is_required: boolean
}

interface PublicSection {
  id: string
  title: string
  description: string | null
  order_index: number
  questions: PublicQuestion[]
}

interface ClientSurveyFormProps {
  title: string
  description: string | null
  sections: PublicSection[]
  token: string
}

const TYPE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
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

type Answers = Record<string, string | string[] | number>



export function ClientSurveyForm({
  title,
  description,
  sections,
  token,
}: ClientSurveyFormProps) {
  const [sectionIdx, setSectionIdx] = useState(0)
  const [answers, setAnswers] = useState<Answers>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [validationAlertOpen, setValidationAlertOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const section = sections[sectionIdx]
  if (submitted) {
    return (
      <div className="min-h-screen bg-[#f0f2f5] flex items-center justify-center">
        <div className="mx-auto w-full max-w-[480px] px-4">
          <div className="overflow-hidden rounded-xl border-t-[6px] border-t-emerald-500 bg-white shadow-sm ring-1 ring-black/[0.04] px-7 pb-8 pt-7 text-center">
            <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-emerald-50">
              <CheckCircle className="size-7 text-emerald-500" />
            </div>
            <h2 className="text-xl font-semibold tracking-tight text-slate-900">
              Response Submitted
            </h2>
            <p className="mt-2 text-[14px] leading-relaxed text-slate-500">
              Thank you for completing the survey. Your feedback helps us improve
              the quality of education at Pasig City.
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (!section) return null

  const isFirst = sectionIdx === 0
  const isLast = sectionIdx === sections.length - 1

  const validateSection = () => {
    let isValid = true
    const newErrors: Record<string, string> = {}
    for (const q of section.questions) {
      if (q.is_required) {
        const val = answers[q.id]
        if (val === undefined || val === null || val === "" || (Array.isArray(val) && val.length === 0)) {
          newErrors[q.id] = "This question is required"
          isValid = false
        }
      }
    }
    setErrors(newErrors)
    return isValid
  }

  const goNext = () => {
    if (!validateSection()) {
      setValidationAlertOpen(true)
      return
    }
    if (!isLast) setSectionIdx((p) => p + 1)
  }
  const goPrev = () => {
    if (!isFirst) setSectionIdx((p) => p - 1)
  }

  const setAnswer = (qId: string, value: string | string[] | number) => {
    setAnswers((prev) => ({ ...prev, [qId]: value }))
    if (errors[qId]) {
      setErrors((prev) => {
        const next = { ...prev }
        delete next[qId]
        return next
      })
    }
  }

  const toggleMultiple = (qId: string, opt: string) => {
    const current = (answers[qId] as string[] | undefined) ?? []
    const nextList = current.includes(opt)
      ? current.filter((v) => v !== opt)
      : [...current, opt]
    setAnswer(qId, nextList)
  }

  const onSubmitClick = () => {
    if (!validateSection()) {
      setValidationAlertOpen(true)
      return
    }
    handleSubmit()
  }

  const handleSubmit = async () => {
    if (submitting) return
    setSubmitting(true)
    try {
      const res = await fetch(`${API_BASE}/survey/${token}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      })
      if (!res.ok) throw new Error("Submit failed")
      setSubmitted(true)
    } catch {
      /* silently fail */
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#f0f2f5]">
      <div className="h-[240px] bg-gradient-to-br from-indigo-600 via-indigo-500 to-violet-500" />

      <div className="mx-auto w-full max-w-[640px] px-4 -mt-[200px] pb-12">
        {/* Title card */}
        <div className="relative mb-4 overflow-hidden rounded-xl border-t-[6px] border-t-indigo-500 bg-white shadow-sm ring-1 ring-black/[0.04]">
          <div className="px-7 pb-6 pt-7">
            <div className="mb-4 flex items-center gap-2">
              <div className="flex size-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                <ClipboardList className="size-[18px]" />
              </div>
              <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
                Alumni Survey
              </span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              {title}
            </h1>
            {description && (
              <p className="mt-2 max-w-md text-[15px] leading-relaxed text-slate-500">
                {description}
              </p>
            )}
            <p className="mt-3 text-[11px] text-slate-400">
              {Object.keys(answers).length} of{" "}
              {sections.reduce((acc, s) => acc + s.questions.length, 0)} answered
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-4">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span>
              Section {sectionIdx + 1} of {sections.length}
            </span>
            <span>{Math.round(((sectionIdx + 1) / sections.length) * 100)}% complete</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-indigo-500 transition-all duration-300"
              style={{ width: `${((sectionIdx + 1) / sections.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Section card */}
        <div className="mb-4 rounded-xl border-l-4 border-l-violet-500 bg-white px-7 py-5 shadow-sm ring-1 ring-black/[0.04]">
          <h2 className="text-lg font-semibold text-slate-900">
            {section.title || `Section ${sectionIdx + 1}`}
          </h2>
          {section.description && (
            <p className="mt-1 text-[14px] leading-relaxed text-slate-500">
              {section.description}
            </p>
          )}
        </div>

        {/* Questions */}
        <div className="space-y-3">
          {section.questions.map((q, _) => (
            <div
              key={q.id}
              className={`rounded-xl bg-white px-7 py-5 shadow-sm ring-1 transition-all ${
                errors[q.id] ? "ring-red-400 bg-red-50/10" : "ring-black/[0.04]"
              }`}
            >
              <div className="mb-1 flex items-center gap-2">
                {(() => {
                  const Icon = TYPE_ICON[q.question_type] ?? Type
                  return <Icon className="size-4 text-indigo-500" />
                })()}
                <span className="text-[11px] font-medium uppercase tracking-wider text-indigo-500">
                  {TYPE_LABEL[q.question_type] ?? q.question_type}
                </span>
              </div>
              <p className="mb-4 text-sm font-medium text-slate-800">
                {q.question_text}
                {q.is_required && <span className="text-red-500 ml-1">*</span>}
              </p>
              {errors[q.id] && (
                <p className="mb-4 text-[13px] font-semibold text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100">
                  {errors[q.id]}
                </p>
              )}

              {q.question_type === "single_choice" && (
                <SurveySelect
                  id={`q-${q.id}`}
                  name={`q-${q.id}`}
                  options={q.options ?? []}
                  placeholder="Select an option…"
                  value={answers[q.id] as string | undefined}
                  onChange={(val) => setAnswer(q.id, val)}
                />
              )}

              {q.question_type === "multiple_choice" && (
                <div className="space-y-2">
                  {(q.options ?? []).map((opt) => {
                    const isSelected = ((answers[q.id] as string[] | undefined) ?? []).includes(opt)
                    return (
                      <label
                        key={opt}
                        className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3.5 py-3 text-sm transition-all hover:border-indigo-200 hover:bg-slate-50 ${
                          isSelected ? "border-indigo-200 bg-indigo-50/20 text-indigo-900" : "border-slate-100 bg-slate-50/20 text-slate-700"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleMultiple(q.id, opt)}
                          className="sr-only"
                        />
                        <div className={`flex size-4.5 shrink-0 items-center justify-center rounded border-2 transition-all ${
                          isSelected ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 bg-white"
                        }`}>
                          {isSelected && <svg className="size-3 stroke-[3] stroke-white fill-none" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>}
                        </div>
                        <span className={isSelected ? "font-medium" : ""}>{opt}</span>
                      </label>
                    )
                  })}
                </div>
              )}

              {q.question_type === "text" && (
                <div className="relative mt-2">
                  <textarea
                    rows={1}
                    value={(answers[q.id] as string) ?? ""}
                    onChange={(e) => {
                      setAnswer(q.id, e.target.value)
                      e.target.style.height = "auto"
                      e.target.style.height = `${e.target.scrollHeight}px`
                    }}
                    className="w-full bg-transparent border-b border-slate-200 pb-1.5 pt-1 text-sm outline-none transition-colors focus:border-indigo-600 resize-none font-normal placeholder:text-slate-400"
                    placeholder="Your answer"
                  />
                </div>
              )}

              {q.question_type === "number" && (
                <div className="relative mt-2 max-w-[200px]">
                  <input
                    type="number"
                    value={(answers[q.id] as number | undefined) ?? ""}
                    onChange={(e) => setAnswer(q.id, e.target.value ? Number(e.target.value) : "")}
                    className="w-full bg-transparent border-b border-slate-200 pb-1.5 pt-1 text-sm outline-none transition-colors focus:border-indigo-600 font-normal placeholder:text-slate-400"
                    placeholder="Your answer"
                  />
                </div>
              )}

              {q.question_type === "scale" && (() => {
                const min = (q.config?.min as number) ?? 1
                const max = (q.config?.max as number) ?? (q.options?.length ?? 4)
                const minLabel = q.config?.min_label as string | undefined
                const maxLabel = q.config?.max_label as string | undefined
                const range = Array.from({ length: max - min + 1 }, (_, i) => min + i)
                return (
                  <div className="flex flex-col items-center justify-center py-4 bg-slate-50/30 rounded-xl px-4">
                    <div className="flex items-end justify-between w-full max-w-[500px] gap-2.5">
                      {minLabel && (
                        <span className="text-xs text-slate-500 font-medium max-w-[120px] text-right mb-2 leading-tight">
                          {minLabel}
                        </span>
                      )}
                      <div className="flex items-start justify-center gap-2 sm:gap-4 flex-1">
                        {range.map((num) => {
                          const isSelected = answers[q.id] === num
                          return (
                            <label key={num} className="flex flex-col items-center gap-1.5 cursor-pointer group flex-1 max-w-[70px]">
                              <span className="text-xs font-semibold text-slate-500 group-hover:text-indigo-600">{num}</span>
                              <input
                                type="radio"
                                name={`scale-${q.id}`}
                                value={num}
                                checked={isSelected}
                                onChange={() => setAnswer(q.id, num)}
                                className="sr-only"
                              />
                              <div className={`flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-all ${
                                isSelected ? "border-indigo-600 bg-indigo-50" : "border-slate-300 bg-white hover:border-indigo-400"
                              }`}>
                                {isSelected && <div className="size-2.5 rounded-full bg-indigo-600" />}
                              </div>
                              {q.options && q.options[num - min] && (
                                <span className="text-[10px] text-slate-400 font-medium text-center mt-1 leading-tight select-none">
                                  {q.options[num - min]}
                                </span>
                              )}
                            </label>
                          )
                        })}
                      </div>
                      {maxLabel && (
                        <span className="text-xs text-slate-500 font-medium max-w-[120px] text-left mb-2 leading-tight">
                          {maxLabel}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })()}

              {q.question_type === "ranking" && (() => {
                const currentOrder = (answers[q.id] as string[] | undefined) ?? q.options ?? []
                const handleMove = (idx: number, direction: "up" | "down") => {
                  const nextOrder = [...currentOrder]
                  const targetIdx = direction === "up" ? idx - 1 : idx + 1
                  if (targetIdx < 0 || targetIdx >= nextOrder.length) return
                  const temp = nextOrder[idx]!
                  nextOrder[idx] = nextOrder[targetIdx]!
                  nextOrder[targetIdx] = temp
                  setAnswer(q.id, nextOrder)
                }
                return (
                  <div className="space-y-2.5">
                    <p className="text-[11px] text-slate-400 italic mb-1">Rank the choices using the arrow buttons:</p>
                    {currentOrder.map((opt, idx) => {
                      const isFirst = idx === 0
                      const isLast = idx === currentOrder.length - 1
                      return (
                        <div
                          key={opt}
                          className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-white p-3 shadow-sm hover:border-indigo-200 transition-all"
                        >
                          <div className="flex items-center gap-3">
                            <span className="flex size-6 items-center justify-center rounded bg-slate-100 text-xs font-bold text-slate-500">
                              {idx + 1}
                            </span>
                            <span className="text-sm font-medium text-slate-700">{opt}</span>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={() => handleMove(idx, "up")}
                              disabled={isFirst}
                              className="h-8 w-8 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 disabled:opacity-40 disabled:hover:text-slate-400 p-0"
                            >
                              <ArrowLeft className="size-4 rotate-90" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={() => handleMove(idx, "down")}
                              disabled={isLast}
                              className="h-8 w-8 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 disabled:opacity-40 disabled:hover:text-slate-400 p-0"
                            >
                              <ArrowRight className="size-4 rotate-90" />
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })()}

              {q.question_type === "matrix" && (() => {
                const columns = (q.config?.columns as string[]) ?? ["Poor", "Fair", "Good", "Excellent"]
                const rows = q.options ?? []
                return (
                  <div className="overflow-x-auto -mx-7 px-7">
                    <table className="w-full text-sm border-collapse min-w-[500px]">
                      <thead>
                        <tr className="border-b border-slate-200">
                          <th className="py-2.5 pr-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider w-2/5" />
                          {columns.map((col) => (
                            <th key={col} className="px-3 py-2.5 text-center text-xs font-semibold text-slate-500 w-1/5 min-w-[80px]">
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row, rowIdx) => {
                          const rowKey = `matrix-${q.id}-row-${rowIdx}`
                          const currentVal = answers[rowKey] as string | undefined
                          return (
                            <tr
                              key={rowIdx}
                              className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors"
                            >
                              <td className="py-3.5 pr-4 text-sm font-medium text-slate-700">{row}</td>
                              {columns.map((col) => {
                                const isSelected = currentVal === col
                                return (
                                  <td key={col} className="px-3 py-3.5 text-center">
                                    <label className="inline-flex cursor-pointer p-2 items-center justify-center rounded-full hover:bg-indigo-50/50 transition-colors">
                                      <input
                                        type="radio"
                                        name={rowKey}
                                        value={col}
                                        checked={isSelected}
                                        onChange={() => setAnswer(rowKey, col)}
                                        className="sr-only"
                                      />
                                      <div className={`flex size-4.5 items-center justify-center rounded-full border-2 transition-all ${
                                        isSelected ? "border-indigo-600 bg-indigo-50" : "border-slate-300 bg-white"
                                      }`}>
                                        {isSelected && <div className="size-2 rounded-full bg-indigo-600" />}
                                      </div>
                                    </label>
                                  </td>
                                )
                              })}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              })()}

              {q.question_type === "datetime" && (
                <input
                  type="date"
                  value={(answers[q.id] as string) ?? ""}
                  onChange={(e) => setAnswer(q.id, e.target.value)}
                  className="h-10 w-48 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition-colors focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/10"
                />
              )}

              {q.question_type === "file" && (
                <div className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-slate-200 bg-slate-50/50 px-4 py-6 text-center transition-colors hover:border-indigo-300 hover:bg-indigo-50/30">
                  <Upload className="size-6 text-slate-300" />
                  <p className="text-xs text-slate-500">
                    Click to upload or drag and drop
                  </p>
                  <p className="text-[11px] text-slate-400">
                    PDF, images, or documents
                  </p>
                </div>
              )}

              {q.question_type === "boolean" && (
                <div className="flex gap-4">
                  {["Yes", "No"].map((opt) => {
                    const val = opt.toLowerCase()
                    const isSelected = answers[q.id] === val
                    return (
                      <label
                        key={opt}
                        className={`flex flex-1 cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-sm transition-all hover:border-indigo-200 hover:bg-slate-50 justify-center ${
                          isSelected ? "border-indigo-200 bg-indigo-50/20 text-indigo-900" : "border-slate-100 bg-slate-50/20 text-slate-700"
                        }`}
                      >
                        <input
                          type="radio"
                          name={`boolean-${q.id}`}
                          value={val}
                          checked={isSelected}
                          onChange={() => setAnswer(q.id, val)}
                          className="sr-only"
                        />
                        <div className={`flex size-4.5 shrink-0 items-center justify-center rounded-full border-2 transition-all ${
                          isSelected ? "border-indigo-600 bg-indigo-50" : "border-slate-300 bg-white"
                        }`}>
                          {isSelected && <div className="size-2 rounded-full bg-indigo-600" />}
                        </div>
                        <span className={isSelected ? "font-medium" : ""}>{opt}</span>
                      </label>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Navigation */}
        <div className="mt-6 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <ShieldCheck className="size-3.5" />
            <span>Your responses are confidential</span>
          </div>
          <div className="flex gap-2">
            {!isFirst && (
              <Button
                variant="outline"
                onClick={goPrev}
                className="h-10 gap-2 rounded-lg px-5 text-sm"
              >
                <ArrowLeft className="size-4" data-icon="inline-start" />
                Previous
              </Button>
            )}
            {!isLast ? (
              <Button
                onClick={goNext}
                className="h-10 gap-2 rounded-lg bg-indigo-600 px-6 text-sm font-medium text-white shadow-sm transition-all hover:bg-indigo-700 hover:shadow-md"
              >
                Next
                <ArrowRight className="size-4" data-icon="inline-end" />
              </Button>
            ) : (
              <Button
                onClick={onSubmitClick}
                disabled={submitting}
                className="h-10 gap-2 rounded-lg bg-emerald-600 px-6 text-sm font-medium text-white shadow-sm transition-all hover:bg-emerald-700 hover:shadow-md"
              >
                {submitting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <>
                    Submit
                    <ArrowRight className="size-4" data-icon="inline-end" />
                  </>
                )}
              </Button>
            )}
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-8 text-center">
          <p className="text-xs text-slate-400">
            Pasig Education Impact Index
          </p>
          <p className="mt-0.5 text-[11px] text-slate-300">
            Token&ensp;{token}
          </p>
        </footer>
      </div>

      <Dialog open={validationAlertOpen} onOpenChange={setValidationAlertOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-600">
              <AlertCircle className="size-5" />
              Missing Information
            </DialogTitle>
            <DialogDescription className="pt-2 text-[14.5px] leading-relaxed text-slate-600">
              Please complete all required questions before proceeding to the next section. Missing fields have been highlighted in red.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-2">
            <Button onClick={() => setValidationAlertOpen(false)} className="bg-indigo-600 hover:bg-indigo-700 text-white border-0 shadow-sm">
              Got it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
