import { Input } from "@/components/ui/input"
import type { SurveyQuestion } from "@/lib/surveys"
import type { useSurveyManagement } from "../useSurveyManagement"

interface ScaleConfigEditorProps {
  sectionIndex: number
  question: SurveyQuestion
  questionIndex: number
  actions: ReturnType<typeof useSurveyManagement>["actions"]
}

export function ScaleConfigEditor({
  sectionIndex,
  question,
  questionIndex,
  actions,
}: ScaleConfigEditorProps) {
  const { updateQuestion } = actions

  return (
    <div className="mt-2 ml-9 pl-4 border-l-2 border-slate-100 py-1">
      <div className="space-y-3">

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase">Min Label (Optional)</label>
            <Input
              className="h-7 text-xs bg-white"
              placeholder="e.g. Strongly disagree"
              value={(question.config?.min_label as string) ?? ""}
              onChange={(e) =>
                updateQuestion(sectionIndex, questionIndex, {
                  config: { ...(question.config || {}), min_label: e.target.value },
                })
              }
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase">Max Label (Optional)</label>
            <Input
              className="h-7 text-xs bg-white"
              placeholder="e.g. Strongly agree"
              value={(question.config?.max_label as string) ?? ""}
              onChange={(e) =>
                updateQuestion(sectionIndex, questionIndex, {
                  config: { ...(question.config || {}), max_label: e.target.value },
                })
              }
            />
          </div>
        </div>
      </div>
    </div>
  )
}
