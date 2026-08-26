import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ArrowDown, ArrowUp, GripVertical, Plus, Trash } from "lucide-react"
import type { useSurveyManagement } from "../useSurveyManagement"

interface QuestionOptionsEditorProps {
  sectionId: string
  sectionIndex: number
  questionId: string
  questionIndex: number
  options: string[] | null | undefined
  actions: ReturnType<typeof useSurveyManagement>["actions"]
}

export function QuestionOptionsEditor({
  sectionId,
  sectionIndex,
  questionId,
  questionIndex,
  options,
  actions,
}: QuestionOptionsEditorProps) {
  const {
    handleDragStart,
    handleDrop,
    setDragItem,
    updateOption,
    moveOption,
    removeOption,
    addOption,
  } = actions

  const optionList = options ?? []

  return (
    <div className="border-t border-slate-100 bg-slate-50/30 px-3 py-3 rounded-b-xl">
      <div className="space-y-1.5 pl-7">
        {optionList.map((opt, optIdx) => (
          <div
            key={optIdx}
            draggable
            onDragStart={(event) =>
              handleDragStart(event, {
                kind: "option",
                sectionId,
                questionId,
                index: optIdx,
              })
            }
            onDragEnd={() => setDragItem(null)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) =>
              handleDrop(event, {
                kind: "option",
                sectionId,
                questionId,
                index: optIdx,
              })
            }
            className="flex items-center gap-2"
          >
            <GripVertical className="size-3.5 cursor-grab text-slate-300" aria-label="Drag option" />
            <span className="flex size-4 shrink-0 items-center justify-center rounded-full border border-slate-300 text-[9px] font-semibold text-slate-400">
              {String.fromCharCode(65 + optIdx)}
            </span>
            <Input
              className="h-7 flex-1 bg-white text-xs"
              placeholder={`Option ${optIdx + 1}`}
              value={opt}
              onChange={(e) => updateOption(sectionIndex, questionIndex, optIdx, e.target.value)}
            />
            <Button
              variant="ghost"
              size="icon-xs"
              className="text-slate-300 hover:text-red-500 hover:bg-red-50"
              aria-label={`Move option ${optIdx + 1} up`}
              disabled={optIdx === 0}
              onClick={() => moveOption(sectionId, questionId, optIdx, optIdx - 1)}
            >
              <ArrowUp />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              className="text-slate-300 hover:text-red-500 hover:bg-red-50"
              aria-label={`Move option ${optIdx + 1} down`}
              disabled={optIdx === optionList.length - 1}
              onClick={() => moveOption(sectionId, questionId, optIdx, optIdx + 1)}
            >
              <ArrowDown />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              className="text-slate-300 hover:text-red-500 hover:bg-red-50"
              onClick={() => removeOption(sectionIndex, questionIndex, optIdx)}
            >
              <Trash className="size-3" />
            </Button>
          </div>
        ))}
        <Button
          variant="ghost"
          size="xs"
          className="mt-1 h-6 gap-1 px-1.5 text-[11px] text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
          onClick={() => addOption(sectionIndex, questionIndex)}
        >
          <Plus className="size-3" />
          Add Option
        </Button>
      </div>
    </div>
  )
}
