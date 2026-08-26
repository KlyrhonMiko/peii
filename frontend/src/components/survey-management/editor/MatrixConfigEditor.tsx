import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ArrowDown, ArrowUp, GripVertical, Plus, Trash } from "lucide-react"
import type { useSurveyManagement } from "../useSurveyManagement"
import type { SurveyQuestion } from "@/lib/surveys"

interface MatrixConfigEditorProps {
  sectionId: string
  sectionIndex: number
  question: SurveyQuestion
  questionIndex: number
  actions: ReturnType<typeof useSurveyManagement>["actions"]
}

export function MatrixConfigEditor({
  sectionId,
  sectionIndex,
  question,
  questionIndex,
  actions,
}: MatrixConfigEditorProps) {
  const {
    handleDragStart,
    handleDrop,
    setDragItem,
    updateOption,
    moveOption,
    removeOption,
    addOption,
    moveColumn,
    updateQuestion,
  } = actions

  const rows = question.options ?? []
  const columns = ((question.config?.columns as string[]) ?? [])

  return (
    <div className="mt-2 ml-9 pl-4 border-l-2 border-slate-100 py-1">
      <div className="space-y-4">
        {/* Rows */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Rows</label>
          {rows.map((opt, optIdx) => (
            <div
              key={optIdx}
              draggable
              onDragStart={(event) =>
                handleDragStart(event, {
                  kind: "option",
                  sectionId,
                  questionId: question.id,
                  index: optIdx,
                })
              }
              onDragEnd={() => setDragItem(null)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) =>
                handleDrop(event, {
                  kind: "option",
                  sectionId,
                  questionId: question.id,
                  index: optIdx,
                })
              }
              className="flex items-center gap-2"
            >
              <GripVertical className="size-3.5 cursor-grab text-slate-300" aria-label="Drag row" />
              <Input
                className="h-7 flex-1 bg-white text-xs"
                placeholder={`Row ${optIdx + 1}`}
                value={opt}
                onChange={(e) => updateOption(sectionIndex, questionIndex, optIdx, e.target.value)}
              />
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-slate-400 hover:text-red-600 hover:bg-slate-100"
                aria-label={`Move row ${optIdx + 1} up`}
                disabled={optIdx === 0}
                onClick={() => moveOption(sectionId, question.id, optIdx, optIdx - 1)}
              >
                <ArrowUp />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-slate-400 hover:text-red-600 hover:bg-slate-100"
                aria-label={`Move row ${optIdx + 1} down`}
                disabled={optIdx === rows.length - 1}
                onClick={() => moveOption(sectionId, question.id, optIdx, optIdx + 1)}
              >
                <ArrowDown />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-slate-400 hover:text-red-600 hover:bg-slate-100"
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
            Add Row
          </Button>
        </div>

        {/* Columns */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Columns</label>
          {columns.map((col, colIdx) => (
            <div
              key={colIdx}
              draggable
              onDragStart={(event) =>
                handleDragStart(event, {
                  kind: "column",
                  sectionId,
                  questionId: question.id,
                  index: colIdx,
                })
              }
              onDragEnd={() => setDragItem(null)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) =>
                handleDrop(event, {
                  kind: "column",
                  sectionId,
                  questionId: question.id,
                  index: colIdx,
                })
              }
              className="flex items-center gap-2"
            >
              <GripVertical className="size-3.5 cursor-grab text-slate-300" aria-label="Drag column" />
              <Input
                className="h-7 flex-1 bg-white text-xs"
                placeholder={`Column ${colIdx + 1}`}
                value={col}
                onChange={(e) => {
                  const newCols = [...columns]
                  newCols[colIdx] = e.target.value
                  updateQuestion(sectionIndex, questionIndex, {
                    config: { ...(question.config || {}), columns: newCols },
                  })
                }}
              />
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-slate-400 hover:text-red-600 hover:bg-slate-100"
                aria-label={`Move column ${colIdx + 1} up`}
                disabled={colIdx === 0}
                onClick={() => moveColumn(sectionId, question.id, colIdx, colIdx - 1)}
              >
                <ArrowUp />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-slate-400 hover:text-red-600 hover:bg-slate-100"
                aria-label={`Move column ${colIdx + 1} down`}
                disabled={colIdx === columns.length - 1}
                onClick={() => moveColumn(sectionId, question.id, colIdx, colIdx + 1)}
              >
                <ArrowDown />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-slate-400 hover:text-red-600 hover:bg-slate-100"
                onClick={() => {
                  const newCols = [...columns]
                  newCols.splice(colIdx, 1)
                  updateQuestion(sectionIndex, questionIndex, {
                    config: { ...(question.config || {}), columns: newCols },
                  })
                }}
              >
                <Trash className="size-3" />
              </Button>
            </div>
          ))}
          <Button
            variant="ghost"
            size="xs"
            className="mt-1 h-6 gap-1 px-1.5 text-[11px] text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
            onClick={() => {
              const newCols = [...columns, ""]
              updateQuestion(sectionIndex, questionIndex, {
                config: { ...(question.config || {}), columns: newCols },
              })
            }}
          >
            <Plus className="size-3" />
            Add Column
          </Button>
        </div>
      </div>
    </div>
  )
}
