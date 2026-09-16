import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ClipboardList, ListChecks, Check, ChevronDown, Loader2, X } from "lucide-react"
import { cn } from "@/lib/utils"

import {
  GRADUATE_TRACER_STUDY_SURVEY,
  GRADUATE_TRACER_STUDY_SURVEY_TITLE,
} from "./constants"
import type { useSurveyManagement } from "./useSurveyManagement"
import type { SurveyQuestion } from "@/lib/surveys"

type StaticPreviewQuestion = (typeof GRADUATE_TRACER_STUDY_SURVEY.sections)[number]["questions"][number]
type PreviewQuestion = StaticPreviewQuestion | SurveyQuestion

interface NormalizedPreviewQuestion {
  text: string
  type: string
  options: string[]
  isDropdown: boolean
  conditionNote: string | null
  hasDependentOptions: boolean
  min: number
  max: number
  minLabel: string | null
  maxLabel: string | null
}

function normalizePreviewQuestion(question: PreviewQuestion): NormalizedPreviewQuestion {
  const isStaticQuestion = "question_text" in question
  const config = question.config
  const min = typeof config?.min === "number" ? config.min : 1
  const max = typeof config?.max === "number" ? config.max : 5
  const visibility = config?.visible_when
  const conditionNote = typeof visibility === "object" && visibility !== null && "question_key" in visibility
    ? `Shown only when ${String(visibility.question_key).replaceAll("_", " ")} matches the selected answer.`
    : null

  return {
    text: isStaticQuestion ? question.question_text : question.text,
    type: isStaticQuestion ? question.question_type : question.type,
    options: question.options ?? [],
    isDropdown: config?.presentation === "dropdown" || config?.presentation === "searchable_dropdown",
    conditionNote,
    hasDependentOptions: config?.options_by_answer !== undefined,
    min,
    max,
    minLabel: typeof config?.min_label === "string" ? config.min_label : null,
    maxLabel: typeof config?.max_label === "string" ? config.max_label : null,
  }
}

export interface SurveyGeneratePreviewModalProps {
  store: ReturnType<typeof useSurveyManagement>
}

export function SurveyGeneratePreviewModal({ store }: SurveyGeneratePreviewModalProps) {
  const { state, actions } = store
  const {
    showGeneratePreview, previewSurvey,
    generating, interactionLocked,
  } = state
  const { setShowGeneratePreview, handleConfirmGenerate } = actions

  const title = previewSurvey?.title || GRADUATE_TRACER_STUDY_SURVEY_TITLE
  const sections = previewSurvey?.sections || GRADUATE_TRACER_STUDY_SURVEY.sections

  return (
    <Dialog
      open={showGeneratePreview}
      onOpenChange={(open) => !open && !interactionLocked && setShowGeneratePreview(false)}
    >
      <DialogContent className="sm:max-w-3xl max-w-[95vw] max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden border-0 rounded-2xl shadow-[0_16px_40px_-12px_rgba(0,0,0,0.1)] bg-white" showCloseButton={false}>
        {/* Header */}
        <div className="flex items-center justify-between px-10 py-6 border-b border-slate-100 bg-white shrink-0">
          <div className="flex items-center gap-4">
            <div className="flex size-12 items-center justify-center rounded-xl bg-slate-50 border border-slate-100">
              <ClipboardList className="size-5 text-slate-700" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-medium tracking-tight text-slate-900 flex items-center gap-3">
                {title}
                <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-600 uppercase tracking-widest">Preview</span>
              </h2>
              <p className="text-sm text-slate-500 mt-1 max-w-xl leading-relaxed">
                Review the predefined sections and questions before generating the survey structure.
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowGeneratePreview(false)}
            disabled={interactionLocked}
            className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full"
          >
            <X className="size-5" />
          </Button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-10 py-8 bg-slate-50/30">
          <div className="grid gap-12 max-w-2xl mx-auto pb-12">
            {sections.map((sec, secIdx) => (
              <div key={secIdx} className="space-y-6">
                <div className="border-b border-slate-200 pb-4">
                  <h3 className="text-base font-semibold text-slate-900 tracking-tight flex items-center gap-3">
                    <span className="text-slate-400 font-normal">Part {secIdx + 1}</span>
                    {sec.title}
                  </h3>
                  {sec.description && (
                    <p className="mt-2 text-sm leading-relaxed text-slate-500">
                      {sec.description}
                    </p>
                  )}
                </div>
                
                <div className="space-y-8">
                  {sec.questions.map((q, qIdx) => {
                    const question = normalizePreviewQuestion(q)

                    return (
                      <div key={qIdx} className="flex items-start gap-4">
                       <span className="mt-0.5 text-sm font-medium text-slate-400 w-6 shrink-0">
                          {qIdx + 1}.
                        </span>
                       <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-800 leading-snug">
                            {question.text}
                          </p>
                          {question.conditionNote && <p className="mt-1 text-xs text-slate-500">{question.conditionNote}</p>}
                          {question.hasDependentOptions && <p className="mt-1 text-xs text-slate-500">Choices depend on the selected job industry.</p>}
                          {question.isDropdown ? (
                           <Button
                             type="button"
                             variant="outline"
                             disabled
                             className="mt-4 h-9 w-full max-w-xs justify-between text-sm font-normal text-slate-500"
                           >
                             Select an option…
                             <ChevronDown className="size-4 text-slate-400" />
                           </Button>
                          ) : question.type === "single_choice" && question.options.length > 20 ? (
                            <p className="mt-4 text-sm text-slate-500">{question.options.length} choices available.</p>
                          ) : question.type !== "scale" && question.options.length > 0 && (
                            <div className="mt-4 flex flex-col gap-3">
                              {question.options.map((opt, optIdx) => (
                                <label key={optIdx} className="flex items-center gap-3 cursor-pointer">
                                  <div className={cn("size-4 border border-slate-300 bg-white shadow-sm", question.type === "multiple_choice" ? "rounded-[4px]" : "rounded-full")} />
                                  <span className="text-sm text-slate-600">{opt}</span>
                                </label>
                              ))}
                            </div>
                          )}
                          {question.type === "text" && (
                           <div className="mt-4 h-10 w-full max-w-lg rounded-none border-b border-slate-300 bg-transparent flex items-center text-slate-400 text-sm">
                             Your answer...
                           </div>
                         )}
                          {question.type === "scale" && (
                            <div className="mt-5 flex flex-wrap gap-x-8 gap-y-4">
                              {Array.from({ length: question.max - question.min + 1 }, (_, i) => {
                                const rating = question.min + i;
                                const optText = question.options[i] ?? null;
                                const isMinMax = i === 0 ? question.minLabel : (i === question.max - question.min ? question.maxLabel : null);
                                const labelText = optText || isMinMax;
                                return (
                                  <label key={rating} className="flex flex-col items-center gap-2 cursor-pointer w-20 text-center">
                                   <div className="size-4 rounded-full border border-slate-300 bg-white shadow-sm" />
                                   <span className="text-sm font-medium text-slate-700">{rating}</span>
                                   {labelText && (
                                     <span className="text-[11px] text-slate-500 leading-tight">{labelText}</span>
                                   )}
                                 </label>
                               );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between border-t border-slate-100 bg-white px-10 py-5">
          <div className="flex items-center gap-3 text-sm text-slate-500 font-medium">
            <span className="flex items-center gap-2"><ClipboardList className="size-4 text-slate-400" /> {sections.length} Sections</span>
            <span className="text-slate-300">&bull;</span>
            <span className="flex items-center gap-2"><ListChecks className="size-4 text-slate-400" /> {sections.reduce((acc, s) => acc + s.questions.length, 0)} Questions</span>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => setShowGeneratePreview(false)}
              disabled={interactionLocked}
              className="h-9 px-4 text-sm font-medium"
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmGenerate}
              disabled={interactionLocked}
              className="h-9 px-5 text-sm font-medium gap-2 bg-slate-900 hover:bg-slate-800 text-white transition-all"
            >
              {generating ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
              Generate Survey
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
