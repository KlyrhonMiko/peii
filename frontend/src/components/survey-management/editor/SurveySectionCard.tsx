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
    handleDrop,
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
      onDrop={(event) => handleDrop(event, { kind: "section", id: section.id })}
      className="rounded-xl border border-slate-200/80 bg-white shadow-sm"
    >
      {/* Section header */}
      <div className="flex items-start gap-3 p-4 pb-3 border-b border-slate-100">
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
            className="bg-slate-50/60 focus-visible:bg-white font-medium"
          />
          <textarea
            rows={1}
            className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-xs outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-none overflow-hidden min-h-[32px]"
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
          className="mt-0.5 text-slate-300 hover:text-red-500 hover:bg-red-50"
          title="Remove section"
        >
          <X className="size-3.5" />
        </Button>
      </div>

      {/* Questions within section */}
      <div className="px-4 py-3 space-y-3">
        {section.questions.length === 0 ? (
          <button
            type="button"
            onClick={() => addQuestion(sectionIndex)}
            className="group flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-200 bg-slate-50/40 px-3 py-3 text-[12px] font-medium text-slate-500 transition-colors hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50/30"
          >
            <Plus className="size-3.5" />
            Add question to section
          </button>
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
            <button
              type="button"
              onClick={() => addQuestion(sectionIndex)}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-200 bg-white px-3 py-2 text-[12px] font-medium text-slate-500 transition-colors hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50/30"
            >
              <Plus className="size-3.5" />
              Add Question
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
