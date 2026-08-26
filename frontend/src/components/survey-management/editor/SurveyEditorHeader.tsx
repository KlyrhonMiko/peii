import { Button } from "@/components/ui/button"
import { DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Check, ClipboardList, Loader2, Pencil } from "lucide-react"
import type { useSurveyManagement } from "../useSurveyManagement"

interface SurveyEditorHeaderProps {
  modalState: ReturnType<typeof useSurveyManagement>["state"]["modalState"]
  interactionLocked: boolean
  saving: boolean
  surveyTitle: string
  handleCloseModal: () => void
  handleSaveSurvey: () => void
}

export function SurveyEditorHeader({
  modalState,
  interactionLocked,
  saving,
  surveyTitle,
  handleCloseModal,
  handleSaveSurvey,
}: SurveyEditorHeaderProps) {
  const isCreate = modalState?.type === "create"

  return (
    <div className="flex items-center justify-between px-8 py-5 border-b border-slate-100 bg-white shrink-0">
      <div className="flex items-center gap-3.5">
        <div className="flex size-9 items-center justify-center rounded-lg bg-slate-50 border border-slate-100">
          <ClipboardList className="size-4.5 text-slate-700" />
        </div>
        <div className="flex-1 min-w-0">
          <DialogTitle className="text-base font-medium text-slate-900 tracking-tight">
            {isCreate ? "Create New Survey" : "Edit Survey"}
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500 mt-0.5">
            {isCreate
              ? "Define a new survey for the PEII system."
              : "Modify the title, target cohort, description, and questions for this survey."}
          </DialogDescription>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button variant="outline" onClick={handleCloseModal} disabled={interactionLocked} className="h-9">
          Cancel
        </Button>
        <Button
          onClick={handleSaveSurvey}
          disabled={!surveyTitle.trim() || interactionLocked}
          className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white h-9"
        >
          {saving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : isCreate ? (
            <Check className="size-4" />
          ) : (
            <Pencil className="size-4" />
          )}
          {isCreate ? "Create Survey" : "Save Changes"}
        </Button>
      </div>
    </div>
  )
}
