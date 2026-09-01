import { SurveyResponsesPanel } from "@/components/SurveyResponsesPanel"
import type { Survey } from "@/lib/surveys"
import type { useSurveyManagement } from "../useSurveyManagement"
import { getSurveyResponseResourceId } from "../utils"

interface SurveyResponsesTabProps {
  survey: Survey
  store: ReturnType<typeof useSurveyManagement>
}

export function SurveyResponsesTab({ survey, store }: SurveyResponsesTabProps) {
  const { state, actions } = store

  return (
    <SurveyResponsesPanel
      survey={survey}
      capabilities={state.capabilities}
      aggregates={state.responseAggregates}
      responses={state.surveyResponses}
      identities={state.surveyResponseIdentities}
      responsePagination={state.responsePagination}
      aggregateLoading={state.aggregateLoading}
      rawLoading={state.rawLoading}
      aggregateError={state.aggregateError}
      rawError={state.rawError}
      rawLoaded={state.rawResponsesLoaded}
      identityLoading={state.identityLoading}
      identityError={state.identityError}
      identityLoaded={state.identityLoaded}
      selectedResponseIds={state.selectedResponseIds}
      responseAction={state.responseAction}
      onLoadRaw={(offset = 0) => void actions.handleLoadRawResponses(survey, offset)}
      onLoadIdentity={(offset = 0) => void actions.handleLoadIdentityResponses(survey, offset)}
      onPageChange={(offset) => void actions.handleLoadRawResponses(survey, offset)}
      onExport={() => void actions.handleExportResponses(getSurveyResponseResourceId(survey))}
      onErase={(scope) => void actions.handleEraseResponses(survey, scope)}
      onToggleSelection={(responseId, selected) => {
        actions.setSelectedResponseIds(
          selected
            ? [...state.selectedResponseIds, responseId]
            : state.selectedResponseIds.filter((id) => id !== responseId),
        )
      }}
    />
  )
}
