import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogHeader,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Archive, Loader2 } from "lucide-react"

import type { useSurveyManagement } from "./useSurveyManagement"

export interface SurveyDeleteConfirmModalProps {
  store: ReturnType<typeof useSurveyManagement>
}

export function SurveyDeleteConfirmModal({ store }: SurveyDeleteConfirmModalProps) {
  const { state, actions } = store
  const { deleteConfirmId, interactionLocked, pendingAction, surveys } = state
  const { setDeleteConfirmId, handleDelete } = actions

  return (
    <Dialog
      open={deleteConfirmId !== null}
      onOpenChange={(open) => !open && !interactionLocked && setDeleteConfirmId(null)}
    >
      <DialogContent className="max-w-md border-0 rounded-2xl shadow-[0_16px_40px_-12px_rgba(0,0,0,0.1)] p-6" showCloseButton={true}>
        <div className="flex flex-col items-center gap-4 text-center pb-2">
          <div className="flex size-12 items-center justify-center rounded-full bg-red-100 ring-[6px] ring-red-50 text-red-600 mb-1">
            <Archive className="size-5" />
          </div>
          <DialogHeader className="flex flex-col items-center">
            <DialogTitle className="text-xl font-semibold text-slate-900 tracking-tight">Archive Survey</DialogTitle>
            <DialogDescription className="text-[15px] text-slate-500 mt-2 leading-relaxed max-w-[95%] text-center">
              Are you sure you want to archive this survey? It will be hidden and all distribution links will be revoked. Collected responses will be retained.
            </DialogDescription>
          </DialogHeader>
        </div>
        <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-center gap-3 sm:space-x-0 w-full mt-4">
          <Button
            variant="outline"
            onClick={() => setDeleteConfirmId(null)}
            disabled={interactionLocked}
            className="font-medium w-full sm:w-auto h-11 px-8 rounded-xl active:scale-[0.97] transition-all duration-200 ease-out"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            className="font-medium w-full sm:w-auto h-11 px-8 rounded-xl active:scale-[0.97] transition-all duration-200 ease-out"
            onClick={async () => {
              if (!deleteConfirmId) return
              const survey = surveys.find((s) => s.id === deleteConfirmId)
              if (survey) {
                try {
                  await handleDelete(survey.surveyId)
                } catch {
                  // silently fail
                }
              }
              setDeleteConfirmId(null)
            }}
            disabled={interactionLocked}
          >
            {pendingAction?.type === "delete" ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
            Archive Survey
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
