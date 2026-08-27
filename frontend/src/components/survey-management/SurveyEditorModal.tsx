import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import type { useSurveyManagement } from "./useSurveyManagement"
import { SurveyEditorHeader } from "./editor/SurveyEditorHeader"
import { SurveyEditorSidebar } from "./editor/SurveyEditorSidebar"
import { SurveySectionCard } from "./editor/SurveySectionCard"

export interface SurveyEditorModalProps {
  store: ReturnType<typeof useSurveyManagement>
}

export function SurveyEditorModal({ store }: SurveyEditorModalProps) {
  const { state, actions } = store
  const {
    modalState,
    interactionLocked,
    saving,
    saveError,
    surveyTitle,
    targetCohort,
    cohortOpen,
    surveyStatus,
    statusOpen,
    surveyDescription,
    retentionEnabled,
    retentionDays,
    sections,
    structureEditable,
    editedSurvey,
    openQuestionSelectId,
  } = state

  const {
    handleCloseModal,
    handleSaveSurvey,
    setSurveyTitle,
    setTargetCohort,
    setCohortOpen,
    setSurveyStatus,
    setStatusOpen,
    setSurveyDescription,
    setRetentionEnabled,
    setRetentionDays,
    addSection,
  } = actions

  const isOpen = modalState !== null && (modalState.type === "create" || modalState.type === "edit")

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => !open && !interactionLocked && handleCloseModal()}
    >
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-6xl max-w-6xl w-[95vw] h-[90vh] p-0 overflow-hidden flex flex-col gap-0 border-0 rounded-2xl shadow-[0_16px_40px_-12px_rgba(0,0,0,0.1)] bg-white"
      >
        <SurveyEditorHeader
          modalState={modalState}
          interactionLocked={interactionLocked}
          saving={saving}
          surveyTitle={surveyTitle}
          handleCloseModal={handleCloseModal}
          handleSaveSurvey={handleSaveSurvey}
        />

        {saveError && (
          <div className="mx-6 mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {saveError}
          </div>
        )}

        <div
          className={cn("flex flex-1 overflow-hidden", interactionLocked && "pointer-events-none opacity-75")}
          aria-busy={interactionLocked}
          inert={interactionLocked ? true : undefined}
        >
          {/* Left Sidebar: Details */}
          <SurveyEditorSidebar
            surveyTitle={surveyTitle}
            setSurveyTitle={setSurveyTitle}
            targetCohort={targetCohort}
            setTargetCohort={setTargetCohort}
            cohortOpen={cohortOpen}
            setCohortOpen={setCohortOpen}
            surveyStatus={surveyStatus}
            setSurveyStatus={setSurveyStatus}
            statusOpen={statusOpen}
            setStatusOpen={setStatusOpen}
            surveyDescription={surveyDescription}
            setSurveyDescription={setSurveyDescription}
            retentionEnabled={retentionEnabled}
            setRetentionEnabled={setRetentionEnabled}
            retentionDays={retentionDays}
            setRetentionDays={setRetentionDays}
          />

          {/* Right Main Area: Sections & Questions */}
          <div className="flex-1 bg-white p-10 overflow-y-auto">
            <div className="max-w-3xl mx-auto pb-20">
              {!structureEditable && (
                <p className="mb-6 rounded-lg border border-amber-200/50 bg-amber-50/50 px-4 py-3 text-sm text-amber-800">
                  {editedSurvey?.status !== "Inactive"
                    ? "Set this survey to Inactive and save before changing its structure."
                    : "The backend will check for response conflicts when the structure is saved."}
                </p>
              )}
              <fieldset
                className={cn("space-y-6", !structureEditable && "pointer-events-none opacity-60")}
                disabled={!structureEditable}
                inert={!structureEditable ? true : undefined}
              >
                <legend className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">
                  Sections &amp; Questions
                </legend>

                {sections.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center bg-slate-50/50 rounded-xl border border-slate-100 border-dashed">
                    <div className="flex size-10 items-center justify-center rounded-full bg-white ring-1 ring-slate-200 shadow-sm mb-3">
                      <Plus className="size-5 text-slate-400" />
                    </div>
                    <p className="text-[14px] font-medium text-slate-700 mb-1">
                      Start building your survey
                    </p>
                    <p className="text-[13px] text-slate-500 mb-5">
                      Group related questions into sections
                    </p>
                    <Button
                      type="button"
                      onClick={addSection}
                      className="gap-2 bg-slate-900 text-white hover:bg-slate-800"
                    >
                      <Plus className="size-4" />
                      Add First Section
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {sections.map((sec, secIdx) => (
                      <SurveySectionCard
                        key={sec.id}
                        section={sec}
                        sectionIndex={secIdx}
                        totalSections={sections.length}
                        openQuestionSelectId={openQuestionSelectId}
                        actions={actions}
                      />
                    ))}

                    {/* Add section */}
                    <div className="pt-4">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={addSection}
                        className="w-full gap-2 py-6 border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 border-dashed"
                      >
                        <Plus className="size-4 text-slate-400" />
                        Add New Section
                      </Button>
                    </div>
                  </div>
                )}
              </fieldset>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
