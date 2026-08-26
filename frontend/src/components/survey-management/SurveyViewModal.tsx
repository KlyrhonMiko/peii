import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { FileText, Users, X } from "lucide-react"
import { cn, formatDate } from "@/lib/utils"
import type { useSurveyManagement } from "./useSurveyManagement"
import { formatSurveyResponseCount } from "./utils"
import { SurveyPreviewTab } from "./view/SurveyPreviewTab"
import { SurveyResponsesTab } from "./view/SurveyResponsesTab"

export interface SurveyViewModalProps {
  store: ReturnType<typeof useSurveyManagement>
}

export function SurveyViewModal({ store }: SurveyViewModalProps) {
  const { state, actions } = store
  const {
    modalState,
    surveys,
    viewTab,
    capabilities,
  } = state

  const { handleCloseModal, handleViewResponses, setViewTab } = actions

  const { readAggregates: canReadAggregates } = capabilities

  const survey = modalState?.type === "view" ? surveys.find((s) => s.id === modalState.id) : undefined

  return (
    <Dialog
      open={modalState !== null && modalState.type === "view"}
      onOpenChange={(open) => !open && handleCloseModal()}
    >
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-4xl max-w-4xl w-[95vw] h-[90vh] p-0 overflow-hidden flex flex-col gap-0 border-0 rounded-2xl shadow-[0_16px_40px_-12px_rgba(0,0,0,0.1)] bg-white"
      >
        {survey && (
          <>
            {/* Header */}
            <div className="flex items-center justify-between px-10 py-6 border-b border-slate-100 bg-white shrink-0">
              <div className="flex items-center gap-4">
                <div className="flex size-12 items-center justify-center rounded-xl bg-slate-50 border border-slate-100">
                  <FileText className="size-5 text-slate-700" />
                </div>
                <div className="flex-1 min-w-0">
                  <DialogTitle className="text-xl font-medium text-slate-900 tracking-tight">
                    {survey.title}
                  </DialogTitle>
                  <DialogDescription className="text-sm text-slate-500 mt-1">
                    Created {formatDate(survey.dateCreated)}
                  </DialogDescription>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleCloseModal}
                className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full"
              >
                <X className="size-5" />
              </Button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-10 py-8 space-y-10 bg-slate-50/30">
              <div className="max-w-3xl mx-auto space-y-10 pb-12">
                {/* Analytics Overview */}
                <div className="flex items-center gap-16 pb-10">
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2 text-slate-500 mb-2">
                      <Users className="size-4" />
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                        Responses
                      </span>
                    </div>
                    <div className="text-4xl font-semibold tracking-tight text-slate-900">
                      {formatSurveyResponseCount(survey.responses, canReadAggregates)}
                    </div>
                  </div>
                  <div className="w-px h-12 bg-slate-200/60" />
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2 text-slate-500 mb-2">
                      <FileText className="size-4" />
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                        Status
                      </span>
                    </div>
                    <div
                      className={cn(
                        "text-4xl font-semibold tracking-tight",
                        survey.status === "Active" ? "text-slate-900" : "text-slate-400"
                      )}
                    >
                      {survey.status}
                    </div>
                  </div>
                </div>

                {/* Tabs */}
                <div className="flex items-center gap-6 border-b border-slate-200 w-full">
                  <button
                    onClick={() => setViewTab("questions")}
                    className={cn(
                      "pb-3 text-sm font-medium transition-colors border-b-2 relative top-[1px]",
                      viewTab === "questions"
                        ? "text-slate-900 border-slate-900"
                        : "text-slate-500 border-transparent hover:text-slate-700"
                    )}
                  >
                    Questions
                  </button>
                  <button
                    onClick={() => handleViewResponses(survey)}
                    className={cn(
                      "pb-3 text-sm font-medium transition-colors border-b-2 relative top-[1px] flex items-center gap-2",
                      viewTab === "responses"
                        ? "text-slate-900 border-slate-900"
                        : "text-slate-500 border-transparent hover:text-slate-700"
                    )}
                  >
                    Responses
                    {(survey.responses === null || survey.responses > 0) && (
                      <span
                        className={cn(
                          "py-0.5 px-2 rounded-full text-[10px] font-bold leading-none",
                          viewTab === "responses" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"
                        )}
                      >
                        {formatSurveyResponseCount(survey.responses, canReadAggregates)}
                      </span>
                    )}
                  </button>
                </div>

                {/* Tab content */}
                {viewTab === "questions" ? (
                  <SurveyPreviewTab sections={survey.sections} />
                ) : (
                  <SurveyResponsesTab survey={survey} store={store} />
                )}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
