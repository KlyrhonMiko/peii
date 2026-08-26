import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ArrowDown, ArrowUp, Check, ChevronDown, GripVertical, Type, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { QUESTION_TYPES } from "../constants"
import { normalizeQuestionStructure } from "@/lib/survey-structure"
import type { SurveyQuestion } from "@/lib/surveys"
import type { useSurveyManagement } from "../useSurveyManagement"
import { QuestionOptionsEditor } from "./QuestionOptionsEditor"
import { MatrixConfigEditor } from "./MatrixConfigEditor"
import { ScaleConfigEditor } from "./ScaleConfigEditor"

interface SurveyQuestionCardProps {
  sectionId: string
  sectionIndex: number
  question: SurveyQuestion
  questionIndex: number
  totalQuestions: number
  openQuestionSelectId: string | null
  actions: ReturnType<typeof useSurveyManagement>["actions"]
}

export function SurveyQuestionCard({
  sectionId,
  sectionIndex,
  question,
  questionIndex,
  totalQuestions,
  openQuestionSelectId,
  actions,
}: SurveyQuestionCardProps) {
  const {
    handleDragStart,
    handleDrop,
    setDragItem,
    updateQuestion,
    setOpenQuestionSelectId,
    moveQuestionBy,
    removeQuestion,
  } = actions

  const questionTypeIcon = (type: string) => {
    const match = QUESTION_TYPES.find((t) => t.value === type)
    const Icon = match?.icon ?? Type
    return <Icon className="size-3.5" />
  }

  const isChoiceType = ["single_choice", "multiple_choice", "ranking"].includes(question.type)

  return (
    <div
      draggable
      onDragStart={(event) =>
        handleDragStart(event, {
          kind: "question",
          sectionId,
          id: question.id,
        })
      }
      onDragEnd={() => setDragItem(null)}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) =>
        handleDrop(event, {
          kind: "question",
          sectionId,
          id: question.id,
        })
      }
      className="group/q relative rounded-xl transition-colors hover:bg-slate-50 border border-transparent hover:border-slate-100"
    >
      <div className="flex items-start gap-2 p-3">
        <div className="flex items-center gap-1.5 pt-1">
          <GripVertical className="size-4 cursor-grab text-slate-300 active:cursor-grabbing" aria-label="Drag question" />
          <span className="flex size-5 items-center justify-center rounded-md bg-indigo-50 text-[10px] font-bold text-indigo-600">
            {questionIndex + 1}
          </span>
        </div>

        <div className="flex-1 min-w-0 space-y-2">
          <div className="relative">
            <Input
              placeholder={`Question ${questionIndex + 1}`}
              value={question.text}
              onChange={(e) =>
                updateQuestion(sectionIndex, questionIndex, {
                  text: e.target.value,
                })
              }
              className="bg-transparent hover:bg-white focus-visible:bg-white pr-6 border-transparent hover:border-slate-200 focus-visible:border-ring shadow-none"
            />
            {(question.isRequired ?? true) && (
              <span className="text-red-500 absolute right-2.5 top-1/2 -translate-y-1/2 font-medium">*</span>
            )}
          </div>

          {/* Type selector */}
          <div className="relative">
            <Popover
              open={openQuestionSelectId === question.id}
              onOpenChange={(isOpen) => setOpenQuestionSelectId(isOpen ? question.id : null)}
            >
              <PopoverTrigger
                render={
                  <Button
                    variant="outline"
                    type="button"
                    className="h-8 w-full justify-between font-normal text-xs border border-transparent bg-transparent hover:bg-white hover:border-slate-200 transition-colors cursor-pointer outline-none focus-visible:ring-3 focus-visible:ring-ring/50 select-none text-left pl-7.5 shadow-none"
                  >
                    <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400">
                      {questionTypeIcon(question.type)}
                    </span>
                    <span>{QUESTION_TYPES.find((t) => t.value === question.type)?.label || question.type}</span>
                    <ChevronDown className="size-3.5 text-slate-400 shrink-0 opacity-60" />
                  </Button>
                }
              />
              <PopoverContent
                align="start"
                style={{ width: "var(--anchor-width)" }}
                className="p-1 flex flex-col gap-0.5 bg-white border border-slate-200 rounded-lg shadow-md animate-in fade-in-0 zoom-in-95 duration-100"
              >
                {QUESTION_TYPES.map((t) => {
                  const isSelected = question.type === t.value
                  const Icon = t.icon
                  return (
                    <button
                      type="button"
                      key={t.value}
                      onClick={() => {
                        const newType = t.value
                        const patch: Partial<SurveyQuestion> = {
                          type: newType,
                        }
                        const normalized = normalizeQuestionStructure(newType, question.options, question.config)
                        patch.options = normalized.options
                        patch.config = normalized.config
                        updateQuestion(sectionIndex, questionIndex, patch)
                        setOpenQuestionSelectId(null)
                      }}
                      className={cn(
                        "flex items-center justify-between w-full px-2.5 py-1.5 text-xs font-normal rounded-md text-left transition-colors cursor-pointer outline-none",
                        isSelected
                          ? "bg-indigo-50 text-indigo-700 font-semibold"
                          : "text-slate-650 hover:bg-slate-50 hover:text-slate-900"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <Icon className="size-3.5 text-slate-400" />
                        <span>{t.label}</span>
                      </div>
                      {isSelected && <Check className="size-3.5 text-indigo-600" />}
                    </button>
                  )
                })}
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <div className="flex items-center gap-0.5 pt-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Move question up"
            title="Move question up"
            disabled={questionIndex === 0}
            onClick={() => moveQuestionBy(sectionId, question.id, -1)}
          >
            <ArrowUp />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Move question down"
            title="Move question down"
            disabled={questionIndex === totalQuestions - 1}
            onClick={() => moveQuestionBy(sectionId, question.id, 1)}
          >
            <ArrowDown />
          </Button>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={() => removeQuestion(sectionIndex, question.id)}
          className="mt-0.5 text-slate-400 opacity-0 transition-opacity group-hover/q:opacity-100 hover:text-red-600 hover:bg-slate-100"
        >
          <X className="size-3.5" />
        </Button>
      </div>

      <div className="px-3 pt-0 pb-1">
        <div
          className="flex items-center gap-2 mt-1 w-max cursor-pointer"
          onClick={() =>
            updateQuestion(sectionIndex, questionIndex, {
              isRequired: !(question.isRequired ?? true),
            })
          }
        >
          <button
            type="button"
            className={cn(
              "relative inline-flex h-4 w-7 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2",
              (question.isRequired ?? true) ? "bg-indigo-600" : "bg-slate-200"
            )}
          >
            <span
              className={cn(
                "pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                (question.isRequired ?? true) ? "translate-x-3" : "translate-x-0"
              )}
            />
          </button>
          <span className="text-[11px] font-medium text-slate-500 select-none">
            Required question
          </span>
        </div>
      </div>


      {/* Configurators */}
      {isChoiceType && (
        <QuestionOptionsEditor
          sectionId={sectionId}
          sectionIndex={sectionIndex}
          questionId={question.id}
          questionIndex={questionIndex}
          options={question.options}
          actions={actions}
        />
      )}

      {question.type === "matrix" && (
        <MatrixConfigEditor
          sectionId={sectionId}
          sectionIndex={sectionIndex}
          question={question}
          questionIndex={questionIndex}
          actions={actions}
        />
      )}

      {question.type === "scale" && (
        <ScaleConfigEditor
          sectionIndex={sectionIndex}
          question={question}
          questionIndex={questionIndex}
          actions={actions}
        />
      )}
    </div>
  )
}
