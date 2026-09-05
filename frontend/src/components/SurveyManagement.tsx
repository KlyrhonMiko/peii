"use client"

import { SurveyList } from "./survey-management/SurveyList"
import { SurveyEditorModal } from "./survey-management/SurveyEditorModal"
import { SurveyViewModal } from "./survey-management/SurveyViewModal"
import { SurveyGeneratePreviewModal } from "./survey-management/SurveyGeneratePreviewModal"
import { SurveyDeleteConfirmModal } from "./survey-management/SurveyDeleteConfirmModal"
import { SurveyShareLinkDialog } from "./SurveyShareLinkDialog"
import { useSurveyManagement } from "./survey-management/useSurveyManagement"
export * from "./survey-management/utils"

export interface SurveyManagementProps {
  permissions?: string[]
  csvExportEnabled: boolean
}

export function SurveyManagement({ permissions, csvExportEnabled }: SurveyManagementProps) {
  const store = useSurveyManagement({ permissions: permissions ?? [], csvExportEnabled })
  const { state, actions } = store
  const { shareLinkSurveyId } = state
  const { setShareLinkSurveyId } = actions

  return (
    <>
      <SurveyList store={store} />
      <SurveyEditorModal store={store} />
      <SurveyViewModal store={store} />
      <SurveyGeneratePreviewModal store={store} />
      <SurveyDeleteConfirmModal store={store} />

      <SurveyShareLinkDialog
        survey={state.surveys.find((s) => s.id === shareLinkSurveyId) ?? null}
        open={shareLinkSurveyId !== null}
        onOpenChange={(open) => {
          if (!open) setShareLinkSurveyId(null)
        }}
      />
    </>
  )
}
