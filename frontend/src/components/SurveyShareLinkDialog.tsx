"use client"

import { useState } from "react"
import { CheckCircle2, Copy, Share2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { Survey } from "@/lib/surveys"

interface SurveyShareLinkDialogProps {
  survey: Survey | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SurveyShareLinkDialog({
  survey,
  open,
  onOpenChange,
}: SurveyShareLinkDialogProps) {
  const [copied, setCopied] = useState(false)

  const isSurveyActive = survey?.status === "Active" && !survey?.isDeleted
  const issuedUrl = survey && typeof window !== "undefined"
    ? `${window.location.origin}/survey/${survey.surveyId}`
    : null

  const copyLink = async () => {
    if (!issuedUrl) return
    try {
      await navigator.clipboard.writeText(issuedUrl)
      setCopied(true)
      toast.success("Survey link copied to clipboard.")
      window.setTimeout(() => setCopied(false), 2000)
    } catch (_) {
      toast.error("We could not copy the link.")
    }
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setCopied(false)
    }
    onOpenChange(nextOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-xl sm:max-w-xl p-0 overflow-hidden bg-white border-0 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.1)] sm:rounded-2xl">
        <DialogHeader className="px-8 pt-7 pb-5 border-b border-slate-100 pr-14 min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 min-w-0">
            <div className="flex items-center gap-4 flex-1 min-w-0">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-slate-50 border border-slate-100">
                <Share2 className="size-4.5 text-slate-700" />
              </div>
              <div className="flex-1 min-w-0">
                <DialogTitle className="text-lg font-medium text-slate-900 tracking-tight text-left">Shareable Link</DialogTitle>
                <DialogDescription className="text-sm text-slate-500 text-left mt-0.5 truncate pr-2">Manage your survey&apos;s shareable link.</DialogDescription>
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6 bg-slate-50/30 px-8 pb-8 pt-6 min-w-0">
          <div className="space-y-4 min-w-0">
            {!isSurveyActive ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-white p-6 text-center">
                <p className="text-sm font-medium text-slate-900 mb-1">
                  {survey?.isDeleted ? "Survey is archived" : "Survey is not active"}
                </p>
                <p className="text-xs text-slate-500 mb-6">
                  {survey?.isDeleted
                    ? "Archived surveys are unavailable to respondents. Restore the survey to share the link again."
                    : 'Change the survey status to "Active" in the editor to start collecting responses.'}
                </p>
                <div className="flex flex-col gap-4 max-w-[280px] mx-auto">
                  <Button onClick={() => onOpenChange(false)} variant="outline" className="w-full">
                    Close
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4 min-w-0">
                <div className="flex flex-col gap-3 min-w-0">
                  <label className="text-sm font-medium text-slate-700">Shareable Link</label>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2 pl-3 min-w-0">
                    <code className="min-w-0 flex-1 truncate text-sm text-emerald-900">{issuedUrl || "Loading link..."}</code>
                    <Button variant="outline" size="sm" onClick={() => void copyLink()} disabled={!issuedUrl} className="w-full sm:w-auto shrink-0 bg-white">
                      {copied ? <CheckCircle2 data-icon="inline-start" className="mr-1.5 size-4" /> : <Copy data-icon="inline-start" className="mr-1.5 size-4" />}
                      {copied ? "Copied" : "Copy"}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
