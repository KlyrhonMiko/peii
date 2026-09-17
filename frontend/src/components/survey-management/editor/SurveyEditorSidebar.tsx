import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Check, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { SURVEY_STATUSES } from "../constants"
import type { SurveyStatus } from "@/lib/surveys"

interface SurveyEditorSidebarProps {
  contentLocked?: boolean
  surveyTitle: string
  setSurveyTitle: (val: string) => void
  surveyStatus: SurveyStatus
  setSurveyStatus: (val: SurveyStatus) => void
  statusOpen: boolean
  setStatusOpen: (open: boolean) => void
  surveyDescription: string
  setSurveyDescription: (val: string) => void
  retentionEnabled: boolean
  setRetentionEnabled: (val: boolean) => void
  retentionDays: number
  setRetentionDays: (val: number) => void
  isCta: boolean
  setIsCta: (val: boolean) => void
}

export function SurveyEditorSidebar({
  contentLocked = false,
  surveyTitle,
  setSurveyTitle,
  surveyStatus,
  setSurveyStatus,
  statusOpen,
  setStatusOpen,
  surveyDescription,
  setSurveyDescription,
  retentionEnabled,
  setRetentionEnabled,
  retentionDays,
  setRetentionDays,
  isCta,
  setIsCta,
}: SurveyEditorSidebarProps) {
  return (
    <div className="w-[340px] shrink-0 border-r border-slate-100 bg-white p-8 overflow-y-auto">
      <fieldset className="mb-6 flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50/50 p-3.5">
        <legend className="px-1 text-[13px] font-semibold text-slate-700">Collection status</legend>
        {contentLocked && <p className="text-xs leading-relaxed text-slate-500">You can activate, pause, or close collection. Changing status does not unlock the survey content.</p>}
        <Popover open={statusOpen} onOpenChange={setStatusOpen}>
          <PopoverTrigger
            render={
              <Button
                variant="outline"
                type="button"
                className="h-8 w-full justify-between font-normal text-sm border border-input bg-transparent hover:bg-slate-50/50 hover:border-slate-300 transition-colors cursor-pointer outline-none focus-visible:ring-3 focus-visible:ring-ring/50 select-none text-left"
              >
                <span>{surveyStatus}</span>
                <ChevronDown className="size-4 text-slate-400 shrink-0 opacity-60" />
              </Button>
            }
          />
          <PopoverContent
            align="start"
            style={{ width: "var(--anchor-width)" }}
            className="p-1 flex flex-col gap-0.5 bg-white border border-slate-200 rounded-lg shadow-md animate-in fade-in-0 zoom-in-95 duration-100"
          >
            {SURVEY_STATUSES.map((statusOption) => {
              const isSelected = surveyStatus === statusOption
              return (
                <button
                  type="button"
                  key={statusOption}
                  onClick={() => {
                    setSurveyStatus(statusOption)
                    setStatusOpen(false)
                  }}
                  className={cn(
                    "flex items-center justify-between w-full px-2.5 py-1.5 text-xs font-medium rounded-md text-left transition-colors cursor-pointer outline-none",
                    isSelected
                      ? "bg-indigo-50 text-indigo-700 font-semibold"
                      : "text-slate-650 hover:bg-slate-50 hover:text-slate-900"
                  )}
                >
                  <span>{statusOption}</span>
                  {isSelected && <Check className="size-3.5 text-indigo-600" />}
                </button>
              )
            })}
          </PopoverContent>
        </Popover>
      </fieldset>
      <fieldset className="space-y-5">
        <legend className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">
          Survey Details
        </legend>

        <div className="space-y-1.5">
          <label className="text-[13px] font-medium text-slate-700">Title</label>
          <Input
            disabled={contentLocked}
            aria-label="Title"
            placeholder="e.g. Class of 2025 Mid-Year Check-in"
            value={surveyTitle}
            onChange={(e) => setSurveyTitle(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[13px] font-medium text-slate-700">
            Description <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <div className="grid">
            <textarea
              disabled={contentLocked}
              aria-label="Description"
              className="w-full [grid-area:1/1] rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-none overflow-hidden min-h-[80px]"
              placeholder="Brief description of this survey's goals…"
              value={surveyDescription}
              onChange={(e) => setSurveyDescription(e.target.value)}
            />
            <div
              className="w-full [grid-area:1/1] px-2.5 py-2 text-sm border border-transparent whitespace-pre-wrap break-words invisible pointer-events-none min-h-[80px]"
              aria-hidden="true"
            >
              {surveyDescription + "\u200b"}
            </div>
          </div>
        </div>

        <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/50 p-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-slate-700">Response retention</p>
              <p id="retention-policy-help" className="mt-1 text-[11px] leading-relaxed text-slate-500">
                By default, responses are retained for five years from submission (1,825 days).
                This policy becomes immutable after responses are received.
              </p>
            </div>
            <div className="flex shrink-0 items-center pt-0.5">
              <label htmlFor="retention-enabled" className="sr-only">
                Automatically delete responses
              </label>
              <Switch
                disabled={contentLocked}
                id="retention-enabled"
                aria-label="Automatically delete responses"
                aria-describedby="retention-policy-help"
                checked={retentionEnabled}
                onCheckedChange={(checked) => setRetentionEnabled(checked)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="retention-days" className="text-[12px] font-medium text-slate-700">
              Retention period (days)
            </label>
            <Input
              id="retention-days"
              type="number"
              min={1}
              step={1}
              value={retentionDays}
              disabled={contentLocked || !retentionEnabled}
              onChange={(event) => setRetentionDays(Number(event.target.value))}
              aria-describedby="retention-policy-help"
            />
          </div>
        </div>

        <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/50 p-3.5 mt-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-slate-700">Set as Landing Page CTA</p>
              <p id="cta-help" className="mt-1 text-[11px] leading-relaxed text-slate-500">
                Show this survey on the main landing page. Only one survey can be the CTA at a time.
              </p>
            </div>
            <div className="flex shrink-0 items-center pt-0.5">
              <label htmlFor="is-cta-enabled" className="sr-only">
                Set as Landing Page CTA
              </label>
              <Switch
                id="is-cta-enabled"
                aria-label="Set as Landing Page CTA"
                aria-describedby="cta-help"
                checked={isCta}
                onCheckedChange={(checked) => setIsCta(checked)}
              />
            </div>
          </div>
        </div>
      </fieldset>
    </div>
  )
}
