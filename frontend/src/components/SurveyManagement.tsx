"use client"

import { SurveyList } from "./survey-management/SurveyList"
import { SurveyEditorModal } from "./survey-management/SurveyEditorModal"
import { SurveyViewModal } from "./survey-management/SurveyViewModal"
import { SurveyGeneratePreviewModal } from "./survey-management/SurveyGeneratePreviewModal"
import { SurveyDeleteConfirmModal } from "./survey-management/SurveyDeleteConfirmModal"
import { SurveyDistributionManager } from "./SurveyDistributionManager"
import { useSurveyManagement } from "./survey-management/useSurveyManagement"
export * from "./survey-management/utils"

export interface SurveyManagementProps {
  permissions?: string[]
}

export function SurveyManagement({ permissions }: SurveyManagementProps) {
  const store = useSurveyManagement({ permissions: permissions ?? [] })
  const { state, actions } = store
  const { distributeSurveyId } = state
  const { setDistributeSurveyId } = actions
  const canManageDistribution = state.capabilities.distributionManage

  return (
    <>
      <SurveyList store={store} />
      <SurveyEditorModal store={store} />
      <SurveyViewModal store={store} />
      <SurveyGeneratePreviewModal store={store} />
      <SurveyDeleteConfirmModal store={store} />

      <SurveyDistributionManager
        surveyId={distributeSurveyId ?? ""}
        open={distributeSurveyId !== null}
        canManage={canManageDistribution}
        onOpenChange={(open) => {
          if (!open) setDistributeSurveyId(null)
        }}
      />
    </>
  )
}
