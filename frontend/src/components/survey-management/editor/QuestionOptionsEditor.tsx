import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ArrowDown, ArrowUp, GripVertical, Plus, Trash } from "lucide-react"
import { useState } from "react"
import type { useSurveyManagement } from "../useSurveyManagement"

interface QuestionOptionsEditorProps {
  sectionId: string
  sectionIndex: number
  questionId: string
  questionIndex: number
  options: string[] | null | undefined
  dependentChoices?: Readonly<Record<string, unknown>>
  sourceOptions?: readonly string[]
  actions: ReturnType<typeof useSurveyManagement>["actions"]
}

interface DependentOptionsEditorProps {
  sectionIndex: number
  questionIndex: number
  dependentChoices: Readonly<Record<string, unknown>>
  sourceOptions: readonly string[]
  actions: ReturnType<typeof useSurveyManagement>["actions"]
}

function DependentOptionsEditor({
  sectionIndex,
  questionIndex,
  dependentChoices,
  sourceOptions,
  actions,
}: DependentOptionsEditorProps) {
  const {
    updateDependentOption,
    moveDependentOption,
    removeDependentOption,
    addDependentOption,
    removeDependentBranch,
  } = actions

  const sourceAnswers = Array.from(new Set([
    ...sourceOptions,
    ...Object.keys(dependentChoices),
  ]))
  const [openBranches, setOpenBranches] = useState<Set<string>>(
    () => new Set(sourceAnswers.slice(0, 1)),
  )

  return (
    <div className="mt-2 ml-9 border-l-2 border-slate-100 py-1 pl-4">
      <div className="flex flex-col gap-1">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Options by answer
        </p>
        <p className="text-[11px] leading-relaxed text-slate-500">
          Add choices under the source answer that should reveal them. Source answers come from the earlier question.
        </p>
      </div>

      {sourceAnswers.length === 0 ? (
        <p className="mt-3 rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
          Add options to the source question before configuring these branches.
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {sourceAnswers.map((sourceAnswer, branchIndex) => {
            const rawOptions = dependentChoices[sourceAnswer]
            const branchOptions = Array.isArray(rawOptions) ? rawOptions : []
            const branchLabel = sourceAnswer.trim() || "Blank source answer"
            const isStaleBranch = sourceOptions.length > 0 && !sourceOptions.includes(sourceAnswer)

            return (
              <details
                key={`${sourceAnswer}-${branchIndex}`}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2"
                open={openBranches.has(sourceAnswer)}
                onToggle={(event) => {
                  const isOpen = event.currentTarget.open
                  setOpenBranches((current) => {
                    const next = new Set(current)
                    if (isOpen) next.add(sourceAnswer)
                    else next.delete(sourceAnswer)
                    return next
                  })
                }}
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-semibold text-slate-700">
                  <span className="min-w-0 truncate">
                    {branchLabel}
                    {isStaleBranch && <span className="ml-1 font-normal text-amber-600">(not in source options)</span>}
                  </span>
                  <span className="shrink-0 text-[10px] font-normal text-slate-400">
                    {branchOptions.length} {branchOptions.length === 1 ? "choice" : "choices"}
                  </span>
                </summary>

                <div className="mt-2 flex flex-col gap-1.5">
                  {branchOptions.map((option, optionIndex) => (
                    <div key={optionIndex} className="flex items-center gap-2">
                      <span className="flex size-4 shrink-0 items-center justify-center rounded-full border border-slate-300 text-[9px] font-semibold text-slate-400">
                        {String.fromCharCode(65 + optionIndex)}
                      </span>
                      <Input
                        className="h-7 min-w-0 flex-1 bg-white text-xs"
                        aria-label={`${branchLabel} choice ${optionIndex + 1}`}
                        placeholder={`Choice ${optionIndex + 1}`}
                        value={typeof option === "string" ? option : ""}
                        onChange={(event) => updateDependentOption(
                          sectionIndex,
                          questionIndex,
                          sourceAnswer,
                          optionIndex,
                          event.target.value,
                        )}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        className="text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        aria-label={`Move ${branchLabel} choice ${optionIndex + 1} up`}
                        disabled={optionIndex === 0}
                        onClick={() => moveDependentOption(
                          sectionIndex,
                          questionIndex,
                          sourceAnswer,
                          optionIndex,
                          optionIndex - 1,
                        )}
                      >
                        <ArrowUp />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        className="text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        aria-label={`Move ${branchLabel} choice ${optionIndex + 1} down`}
                        disabled={optionIndex === branchOptions.length - 1}
                        onClick={() => moveDependentOption(
                          sectionIndex,
                          questionIndex,
                          sourceAnswer,
                          optionIndex,
                          optionIndex + 1,
                        )}
                      >
                        <ArrowDown />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        className="text-slate-400 hover:bg-slate-100 hover:text-red-600"
                        aria-label={`Remove ${branchLabel} choice ${optionIndex + 1}`}
                        onClick={() => removeDependentOption(
                          sectionIndex,
                          questionIndex,
                          sourceAnswer,
                          optionIndex,
                        )}
                      >
                        <Trash />
                      </Button>
                    </div>
                  ))}

                  <div className="flex items-center justify-between gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      className="h-6 gap-1 px-1.5 text-[11px] text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700"
                      onClick={() => addDependentOption(sectionIndex, questionIndex, sourceAnswer)}
                    >
                      <Plus />
                      Add choice
                    </Button>
                    {Object.hasOwn(dependentChoices, sourceAnswer) && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        className="h-6 gap-1 px-1.5 text-[11px] text-slate-400 hover:bg-slate-100 hover:text-red-600"
                        aria-label={`Remove ${branchLabel} branch`}
                        onClick={() => removeDependentBranch(sectionIndex, questionIndex, sourceAnswer)}
                      >
                        <Trash />
                        Remove branch
                      </Button>
                    )}
                  </div>
                </div>
              </details>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function QuestionOptionsEditor({
  sectionId,
  sectionIndex,
  questionId,
  questionIndex,
  options,
  dependentChoices,
  sourceOptions = [],
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

  if (dependentChoices) {
    return (
      <DependentOptionsEditor
        sectionIndex={sectionIndex}
        questionIndex={questionIndex}
        dependentChoices={dependentChoices}
        sourceOptions={sourceOptions}
        actions={actions}
      />
    )
  }

  const optionList = options ?? []

  return (
    <div className="mt-2 ml-9 border-l-2 border-slate-100 py-1 pl-4">
      <div className="flex flex-col gap-1.5">
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
              className="h-7 min-w-0 flex-1 bg-white text-xs"
              placeholder={`Option ${optIdx + 1}`}
              value={opt}
              onChange={(event) => updateOption(sectionIndex, questionIndex, optIdx, event.target.value)}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="text-slate-400 hover:bg-slate-100 hover:text-red-600"
              aria-label={`Move option ${optIdx + 1} up`}
              disabled={optIdx === 0}
              onClick={() => moveOption(sectionId, questionId, optIdx, optIdx - 1)}
            >
              <ArrowUp />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="text-slate-400 hover:bg-slate-100 hover:text-red-600"
              aria-label={`Move option ${optIdx + 1} down`}
              disabled={optIdx === optionList.length - 1}
              onClick={() => moveOption(sectionId, questionId, optIdx, optIdx + 1)}
            >
              <ArrowDown />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="text-slate-400 hover:bg-slate-100 hover:text-red-600"
              aria-label={`Remove option ${optIdx + 1}`}
              onClick={() => removeOption(sectionIndex, questionIndex, optIdx)}
            >
              <Trash />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="mt-1 h-6 gap-1 px-1.5 text-[11px] text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700"
          onClick={() => addOption(sectionIndex, questionIndex)}
        >
          <Plus />
          Add Option
        </Button>
      </div>
    </div>
  )
}
