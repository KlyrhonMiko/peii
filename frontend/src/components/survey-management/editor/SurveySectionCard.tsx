import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ArrowDown, ArrowUp, GripVertical, Plus, X } from "lucide-react"
import type { SurveySection } from "@/lib/surveys"
import type { useSurveyManagement } from "../useSurveyManagement"
import { SurveyQuestionCard } from "./SurveyQuestionCard"

interface SurveySectionCardProps {
  section: SurveySection
  sectionIndex: number
  totalSections: number
  openQuestionSelectId: string | null
  actions: ReturnType<typeof useSurveyManagement>["actions"]
}

export function SurveySectionCard({
  section,
  sectionIndex,
  totalSections,
  openQuestionSelectId,
  actions,
}: SurveySectionCardProps) {
  const {
    handleDragStart,
    setDragItem,
    updateSection,
    moveSection,
    removeSection,
    addQuestion,
  } = actions

  return (
    <div
      draggable
      onDragStart={(event) => handleDragStart(event, { kind: "section", id: section.id })}
      onDragEnd={() => setDragItem(null)}
      onDragOver={(event) => event.preventDefault()}
      className="relative pb-10 mb-10 border-b border-slate-100 last:mb-0 last:border-0 last:pb-0"
    >
      {/* Section header */}
      <div className="flex items-start gap-3 mb-6 group/section">
        <div className="flex items-center gap-1.5 pt-1">
          <GripVertical className="size-4 cursor-grab text-slate-300 active:cursor-grabbing" aria-label="Drag section" />
          <span className="flex size-5 items-center justify-center rounded-md bg-violet-50 text-[10px] font-bold text-violet-600">
            {sectionIndex + 1}
          </span>
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <Input
            placeholder="Section title (e.g. Employment Outcomes)"
            value={section.title}
            onChange={(e) =>
              updateSection(sectionIndex, {
                title: e.target.value,
              })
            }
            className="bg-transparent hover:bg-slate-50 focus-visible:bg-white font-semibold text-xl border-transparent hover:border-slate-200 focus-visible:border-ring px-3 h-10 shadow-none rounded-md"
          />
          <textarea
            rows={1}
            className="w-full rounded-md border border-transparent bg-transparent hover:bg-slate-50 px-3 py-2 text-sm text-slate-600 outline-none transition-colors placeholder:text-slate-400 focus-visible:bg-white focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 resize-none overflow-hidden min-h-[36px]"
            placeholder="Section description (optional)"
            value={section.description ?? ""}
            onChange={(e) => {
              updateSection(sectionIndex, {
                description: e.target.value,
              })
              e.target.style.height = "auto"
              e.target.style.height = `${e.target.scrollHeight}px`
            }}
            ref={(el) => {
              if (el) {
                el.style.height = "auto"
                el.style.height = `${el.scrollHeight}px`
              }
            }}
          />
        </div>
        <div className="flex items-center gap-0.5 pt-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Move section up"
            title="Move section up"
            disabled={sectionIndex === 0}
            onClick={() => moveSection(section.id, -1)}
          >
            <ArrowUp />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Move section down"
            title="Move section down"
            disabled={sectionIndex === totalSections - 1}
            onClick={() => moveSection(section.id, 1)}
          >
            <ArrowDown />
          </Button>
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => removeSection(section.id)}
          className="mt-0.5 text-slate-400 hover:text-red-600 hover:bg-slate-100"
          title="Remove section"
        >
          <X className="size-3.5" />
        </Button>
      </div>

      {/* Questions within section */}
      <div className="space-y-1">
        {section.questions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 mt-2 text-center bg-slate-50/50 rounded-lg border border-slate-100 border-dashed">
            <p className="text-[13px] text-slate-500 mb-3">No questions in this section yet.</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => addQuestion(sectionIndex)}
              className="gap-1.5 text-slate-600 bg-white"
            >
              <Plus className="size-3.5" />
              Add Question
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {section.questions.map((q, qIdx) => (
              <SurveyQuestionCard
                key={q.id}
                sectionId={section.id}
                sectionIndex={sectionIndex}
                question={q}
                questionIndex={qIdx}
                totalQuestions={section.questions.length}
                openQuestionSelectId={openQuestionSelectId}
                actions={actions}
              />
            ))}

            {/* Add question to this section */}
            <div className="pt-2 pb-1 pl-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => addQuestion(sectionIndex)}
                className="gap-1.5 text-slate-500 hover:text-slate-900"
              >
                <Plus className="size-3.5" />
                Add Question
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
