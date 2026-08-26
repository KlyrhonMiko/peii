import type { DragEvent } from "react"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  ClipboardList,
  Check,
  Pencil,
  Loader2,
  ChevronDown,
  Plus,
  GripVertical,
  X,
  ArrowUp,
  ArrowDown,
  Trash,
} from "lucide-react"
import { cn } from "@/lib/utils"

import { QUESTION_TYPES, SURVEY_STATUSES } from "./constants"
import type { SurveyStatus, SurveyQuestion } from "@/lib/surveys"
import { normalizeQuestionStructure } from "@/lib/survey-structure"

import type { useSurveyManagement } from "./useSurveyManagement"
import { Type } from "lucide-react"

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
    addSection,
    handleDragStart,
    handleDrop,
    updateSection,
    moveSection,
    removeSection,
    addQuestion,
    updateQuestion,
    setOpenQuestionSelectId,
    moveQuestionBy,
    removeQuestion,
    moveOption,
    removeOption,
    addOption,
    moveColumn,
    setDragItem,
    updateOption,
  } = actions

  const questionTypeIcon = (type: string) => {
    const match = QUESTION_TYPES.find((t) => t.value === type)
    const Icon = match?.icon ?? Type
    return <Icon className="size-3.5" />
  }

  return (
    <Dialog
      open={modalState !== null && (modalState.type === "create" || modalState.type === "edit")}
      onOpenChange={(open) => !open && !interactionLocked && handleCloseModal()}
    >
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-6xl max-w-6xl w-[95vw] h-[90vh] p-0 overflow-hidden flex flex-col gap-0 border-0 rounded-2xl shadow-[0_16px_40px_-12px_rgba(0,0,0,0.1)] bg-white"
      >
        <div className="flex items-center justify-between px-8 py-5 border-b border-slate-100 bg-white shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-slate-50 border border-slate-100">
              <ClipboardList className="size-4.5 text-slate-700" />
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-base font-medium text-slate-900 tracking-tight">
                {modalState?.type === "create" ? "Create New Survey" : "Edit Survey"}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500 mt-0.5">
                {modalState?.type === "create"
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
              ) : modalState?.type === "create" ? (
                <Check className="size-4" />
              ) : (
                <Pencil className="size-4" />
              )}
              {modalState?.type === "create" ? "Create Survey" : "Save Changes"}
            </Button>
          </div>
        </div>

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
          <div className="w-[340px] shrink-0 border-r border-slate-100 bg-white p-8 overflow-y-auto">
            <fieldset className="space-y-5">
              <legend className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">
                Survey Details
              </legend>

              <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-slate-700">
                  Title
                </label>
                <Input
                  placeholder="e.g. Class of 2025 Mid-Year Check-in"
                  value={surveyTitle}
                  onChange={(e) => setSurveyTitle(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-slate-700">
                  Target Cohort
                </label>
                <Popover open={cohortOpen} onOpenChange={setCohortOpen}>
                  <PopoverTrigger
                    render={
                    <Button
                      variant="outline"
                      type="button"
                      className="h-8 w-full justify-between font-normal text-sm border border-input bg-transparent hover:bg-slate-50/50 hover:border-slate-300 transition-colors cursor-pointer outline-none focus-visible:ring-3 focus-visible:ring-ring/50 select-none text-left"
                    >
                      <span>{targetCohort}</span>
                      <ChevronDown className="size-4 text-slate-400 shrink-0 opacity-60" />
                    </Button>
                    }
                  />
                  <PopoverContent
                    align="start"
                    style={{ width: "var(--anchor-width)" }}
                    className="p-1 flex flex-col gap-0.5 bg-white border border-slate-200 rounded-lg shadow-md animate-in fade-in-0 zoom-in-95 duration-100"
                  >
                    {["Class of 2024", "Class of 2025", "All Alumni"].map((cohortOption) => {
                      const isSelected = targetCohort === cohortOption
                      return (
                        <button
                          type="button"
                          key={cohortOption}
                          onClick={() => {
                            setTargetCohort(cohortOption)
                            setCohortOpen(false)
                          }}
                          className={cn(
                            "flex items-center justify-between w-full px-2.5 py-1.5 text-xs font-medium rounded-md text-left transition-colors cursor-pointer outline-none",
                            isSelected
                              ? "bg-indigo-50 text-indigo-700 font-semibold"
                              : "text-slate-650 hover:bg-slate-50 hover:text-slate-900"
                          )}
                        >
                          <span>{cohortOption}</span>
                          {isSelected && <Check className="size-3.5 text-indigo-600" />}
                        </button>
                      )
                    })}
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-slate-700">
                  Status
                </label>
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
              </div>

              <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-slate-700">
                  Description{" "}
                  <span className="font-normal text-slate-400">
                    (optional)
                  </span>
                </label>
                <textarea
                  rows={3}
                  className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-none overflow-hidden min-h-[80px]"
                  placeholder="Brief description of this survey's goals…"
                  value={surveyDescription}
                  onChange={(e) => {
                    setSurveyDescription(e.target.value)
                    e.target.style.height = "auto"
                    e.target.style.height = `${e.target.scrollHeight}px`
                  }}
                  ref={(el) => {
                    if (el) {
                      el.style.height = "auto"
                      el.style.height = `${el.scrollHeight}px`
                    }
                  }}
                />
              </div>
            </fieldset>
          </div>

          {/* Right Main Area: Questions */}
          <div className="flex-1 bg-slate-50/30 p-10 overflow-y-auto">
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
                  <button
                    type="button"
                    onClick={addSection}
                    className="group flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/40 px-4 py-8 text-center transition-colors hover:border-indigo-300 hover:bg-indigo-50/30"
                  >
                    <div className="flex size-10 items-center justify-center rounded-full bg-white ring-1 ring-slate-200 transition-shadow group-hover:ring-indigo-200 group-hover:shadow-sm">
                      <Plus className="size-5 text-slate-400 group-hover:text-indigo-500 transition-colors" />
                    </div>
                    <div>
                      <p className="text-[13px] font-medium text-slate-600 group-hover:text-indigo-600 transition-colors">
                        Add your first section
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Group related questions into sections
                      </p>
                    </div>
                  </button>
                ) : (
                  <div className="space-y-4">
                    {sections.map((sec, secIdx) => (
                      <div
                        key={sec.id}
                        draggable
                        onDragStart={(event) => handleDragStart(event, { kind: "section", id: sec.id })}
                        onDragEnd={() => setDragItem(null)}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => handleDrop(event, { kind: "section", id: sec.id })}
                        className="rounded-xl border border-slate-200/80 bg-white shadow-sm"
                      >
                        {/* Section header */}
                        <div className="flex items-start gap-3 p-4 pb-3 border-b border-slate-100">
                          <div className="flex items-center gap-1.5 pt-1">
                            <GripVertical
                              className="size-4 cursor-grab text-slate-300 active:cursor-grabbing"
                              aria-label="Drag section"
                            />
                            <span className="flex size-5 items-center justify-center rounded-md bg-violet-50 text-[10px] font-bold text-violet-600">
                              {secIdx + 1}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0 space-y-2">
                            <Input
                              placeholder="Section title (e.g. Employment Outcomes)"
                              value={sec.title}
                              onChange={(e) =>
                                updateSection(secIdx, {
                                  title: e.target.value,
                                })
                              }
                              className="bg-slate-50/60 focus-visible:bg-white font-medium"
                            />
                            <textarea
                              rows={1}
                              className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-xs outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-none overflow-hidden min-h-[32px]"
                              placeholder="Section description (optional)"
                              value={sec.description ?? ""}
                              onChange={(e) => {
                                updateSection(secIdx, {
                                  description: e.target.value,
                                })
                                e.target.style.height = "auto"
                                e.target.style.height = `${e.target.scrollHeight}px`
                              }}
                              ref={(el) => {
                                if (el) {
                                  el.style.height = "auto"
                                  el.style.height = `${el.scrollHeight}px`
                                }
                              }}
                            />
                          </div>
                          <div className="flex items-center gap-0.5 pt-0.5">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-xs"
                              aria-label="Move section up"
                              title="Move section up"
                              disabled={secIdx === 0}
                              onClick={() => moveSection(sec.id, -1)}
                            >
                              <ArrowUp />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-xs"
                              aria-label="Move section down"
                              title="Move section down"
                              disabled={secIdx === sections.length - 1}
                              onClick={() => moveSection(sec.id, 1)}
                            >
                              <ArrowDown />
                            </Button>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => removeSection(sec.id)}
                            className="mt-0.5 text-slate-300 hover:text-red-500 hover:bg-red-50"
                            title="Remove section"
                          >
                            <X className="size-3.5" />
                          </Button>
                        </div>

                        {/* Questions within section */}
                        <div className="px-4 py-3 space-y-3">
                          {sec.questions.length === 0 ? (
                            <button
                              type="button"
                              onClick={() => addQuestion(secIdx)}
                              className="group flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-200 bg-slate-50/40 px-3 py-3 text-[12px] font-medium text-slate-500 transition-colors hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50/30"
                            >
                              <Plus className="size-3.5" />
                              Add question to section
                            </button>
                          ) : (
                            <div className="space-y-2">
                              {sec.questions.map((q, qIdx) => (
                                <div
                                  key={q.id}
                                  draggable
                                  onDragStart={(event) => handleDragStart(event, {
                                    kind: "question",
                                    sectionId: sec.id,
                                    id: q.id,
                                  })}
                                  onDragEnd={() => setDragItem(null)}
                                  onDragOver={(event) => event.preventDefault()}
                                  onDrop={(event) => handleDrop(event, {
                                    kind: "question",
                                    sectionId: sec.id,
                                    id: q.id,
                                  })}
                                  className="group/q rounded-lg border border-slate-200/70 bg-white shadow-sm transition-shadow hover:shadow-md"
                                >
                                  <div className="flex items-start gap-2 p-3">
                                    <div className="flex items-center gap-1.5 pt-1">
                                      <GripVertical className="size-4 cursor-grab text-slate-300 active:cursor-grabbing" aria-label="Drag question" />
                                      <span className="flex size-5 items-center justify-center rounded-md bg-indigo-50 text-[10px] font-bold text-indigo-600">
                                        {qIdx + 1}
                                      </span>
                                    </div>

                                    <div className="flex-1 min-w-0 space-y-2">
                                      <div className="relative">
                                        <Input
                                          placeholder={`Question ${qIdx + 1}`}
                                          value={q.text}
                                          onChange={(e) =>
                                            updateQuestion(secIdx, qIdx, {
                                              text: e.target.value,
                                            })
                                          }
                                          className="bg-slate-50/60 focus-visible:bg-white pr-6"
                                        />
                                        {(q.isRequired ?? true) && (
                                          <span className="text-red-500 absolute right-2.5 top-1/2 -translate-y-1/2 font-medium">*</span>
                                        )}
                                      </div>

                                      {/* Type selector */}
                                      <div className="relative">
                                        <Popover
                                          open={openQuestionSelectId === q.id}
                                          onOpenChange={(isOpen) =>
                                            setOpenQuestionSelectId(isOpen ? q.id : null)
                                          }
                                        >
                                          <PopoverTrigger>
                                            <Button
                                              variant="outline"
                                              type="button"
                                              className="h-8 w-full justify-between font-normal text-xs border border-input bg-slate-50/60 hover:bg-slate-100 hover:border-slate-300 transition-colors cursor-pointer outline-none focus-visible:ring-3 focus-visible:ring-ring/50 select-none text-left pl-7.5"
                                            >
                                              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400">
                                                {questionTypeIcon(q.type)}
                                              </span>
                                              <span>
                                                {QUESTION_TYPES.find((t) => t.value === q.type)?.label || q.type}
                                              </span>
                                              <ChevronDown className="size-3.5 text-slate-400 shrink-0 opacity-60" />
                                            </Button>
                                          </PopoverTrigger>
                                          <PopoverContent
                                            align="start"
                                            style={{ width: "var(--anchor-width)" }}
                                            className="p-1 flex flex-col gap-0.5 bg-white border border-slate-200 rounded-lg shadow-md animate-in fade-in-0 zoom-in-95 duration-100"
                                          >
                                            {QUESTION_TYPES.map((t) => {
                                              const isSelected = q.type === t.value
                                              const Icon = t.icon
                                              return (
                                                <button
                                                  type="button"
                                                  key={t.value}
                                                  onClick={() => {
                                                    const newType = t.value
                                                    const patch: Partial<SurveyQuestion> = {
                                                      type: newType,
                                                    }
                                                    const normalized = normalizeQuestionStructure(newType, q.options, q.config)
                                                    patch.options = normalized.options
                                                    patch.config = normalized.config
                                                    updateQuestion(secIdx, qIdx, patch)
                                                    setOpenQuestionSelectId(null)
                                                  }}
                                                  className={cn(
                                                    "flex items-center justify-between w-full px-2.5 py-1.5 text-xs font-normal rounded-md text-left transition-colors cursor-pointer outline-none",
                                                    isSelected
                                                      ? "bg-indigo-50 text-indigo-700 font-semibold"
                                                      : "text-slate-650 hover:bg-slate-50 hover:text-slate-900"
                                                  )}
                                                >
                                                  <div className="flex items-center gap-2">
                                                    <Icon className="size-3.5 text-slate-400" />
                                                    <span>{t.label}</span>
                                                  </div>
                                                  {isSelected && <Check className="size-3.5 text-indigo-600" />}
                                                </button>
                                              )
                                            })}
                                          </PopoverContent>
                                        </Popover>
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-0.5 pt-0.5">
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon-xs"
                                        aria-label="Move question up"
                                        title="Move question up"
                                        disabled={qIdx === 0}
                                        onClick={() => moveQuestionBy(sec.id, q.id, -1)}
                                      >
                                        <ArrowUp />
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon-xs"
                                        aria-label="Move question down"
                                        title="Move question down"
                                        disabled={qIdx === sec.questions.length - 1}
                                        onClick={() => moveQuestionBy(sec.id, q.id, 1)}
                                      >
                                        <ArrowDown />
                                      </Button>
                                    </div>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon-xs"
                                      onClick={() => removeQuestion(secIdx, q.id)}
                                      className="mt-0.5 text-slate-300 opacity-0 transition-opacity group-hover/q:opacity-100 hover:text-red-500 hover:bg-red-50"
                                    >
                                      <X className="size-3.5" />
                                    </Button>
                                  </div>

                                  <div className="px-3 pt-0 pb-1">
                                    <div
                                      className="flex items-center gap-2 mt-1 w-max cursor-pointer"
                                      onClick={() => updateQuestion(secIdx, qIdx, { isRequired: !(q.isRequired ?? true) })}
                                    >
                                      <button
                                        type="button"
                                        className={cn(
                                          "relative inline-flex h-4 w-7 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2",
                                          (q.isRequired ?? true) ? "bg-indigo-600" : "bg-slate-200"
                                        )}
                                      >
                                        <span
                                          className={cn(
                                            "pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                                            (q.isRequired ?? true) ? "translate-x-3" : "translate-x-0"
                                          )}
                                        />
                                      </button>
                                      <span className="text-[11px] font-medium text-slate-500 select-none">
                                        Required question
                                      </span>
                                    </div>
                                  </div>

                                  {q.type === "scale" && (
                                    <div className="mt-2 space-y-1 p-3 pt-0">
                                      {!!(q.config?.min_label || q.config?.max_label) && (
                                        <div className="flex items-center gap-1.5 text-xs text-slate-400">
                                          {!!q.config?.min_label && <span>{String(q.config.min_label)}</span>}
                                          <span>({(q.config?.min as number) ?? 1} to {(q.config?.max as number) ?? (q.options?.length ?? 4)})</span>
                                          {!!q.config?.max_label && <span>{String(q.config.max_label)}</span>}
                                        </div>
                                      )}
                                      <div className="flex gap-2">
                                        {Array.from(
                                          { length: ((q.config?.max as number) ?? (q.options?.length ?? 4)) - ((q.config?.min as number) ?? 1) + 1 },
                                          (_, i) => ((q.config?.min as number) ?? 1) + i
                                        ).map((rating) => (
                                          <div key={rating} className="size-8 rounded-md border border-slate-200 bg-slate-50 flex items-center justify-center text-slate-500 text-xs">
                                            {rating}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  {q.type === "text" && (
                                    <div className="h-16 rounded-md border border-slate-200 bg-slate-50 mt-2 p-2 text-slate-400 text-xs mx-3 mb-3">
                                      Text response area...
                                    </div>
                                  )}
                                  {["single_choice", "multiple_choice", "ranking"].includes(q.type) && (
                                    <div className="space-y-1.5 mt-2 p-3 pt-0">
                                      {(q.options ?? []).map((opt, optIdx) => (
                                        <div key={optIdx} className="flex items-center gap-2 text-xs">
                                          <span className="flex size-4 shrink-0 items-center justify-center rounded-full border border-slate-300 text-[9px] font-semibold text-slate-400">
                                            {String.fromCharCode(65 + optIdx)}
                                          </span>
                                          <span className="text-slate-700">{opt || `Option ${optIdx + 1}`}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  {q.type === "matrix" && (
                                    <div className="mt-2 space-y-2 p-3 pt-0">
                                      <div className="text-[10px] text-slate-400 font-semibold uppercase">Rows:</div>
                                      <div className="space-y-1 pl-2">
                                        {(q.options ?? []).map((opt, optIdx) => (
                                          <div key={optIdx} className="text-xs text-slate-600">• {opt || `Row ${optIdx + 1}`}</div>
                                        ))}
                                      </div>
                                      <div className="text-[10px] text-slate-400 font-semibold uppercase mt-1">Columns:</div>
                                      <div className="flex flex-wrap gap-1.5 pl-2">
                                        {((q.config?.columns as string[]) ?? []).map((col, colIdx) => (
                                          <span key={colIdx} className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-100 text-[10px] font-medium text-slate-600">
                                            {col || `Col ${colIdx + 1}`}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {/* Options Configuration */}
                                  {["single_choice", "multiple_choice", "ranking"].includes(q.type) && (
                                    <div className="border-t border-slate-100 bg-slate-50/30 px-3 py-3 rounded-b-xl">
                                      <div className="space-y-1.5 pl-7">
                                        {q.options?.map((opt, optIdx) => (
                                          <div
                                            key={optIdx}
                                            draggable
                                            onDragStart={(event) => handleDragStart(event, {
                                              kind: "option",
                                              sectionId: sec.id,
                                              questionId: q.id,
                                              index: optIdx,
                                            })}
                                            onDragEnd={() => setDragItem(null)}
                                            onDragOver={(event) => event.preventDefault()}
                                            onDrop={(event) => handleDrop(event, {
                                              kind: "option",
                                              sectionId: sec.id,
                                              questionId: q.id,
                                              index: optIdx,
                                            })}
                                            className="flex items-center gap-2"
                                          >
                                            <GripVertical className="size-3.5 cursor-grab text-slate-300" aria-label="Drag option" />
                                            <span className="flex size-4 shrink-0 items-center justify-center rounded-full border border-slate-300 text-[9px] font-semibold text-slate-400">
                                              {String.fromCharCode(65 + optIdx)}
                                            </span>
                                            <Input
                                              className="h-7 flex-1 bg-white text-xs"
                                              placeholder={`Option ${optIdx + 1}`}
                                              value={opt}
                                              onChange={(e) =>
                                                updateOption(secIdx, qIdx, optIdx, e.target.value)
                                              }
                                            />
                                            <Button
                                              variant="ghost"
                                              size="icon-xs"
                                              className="text-slate-300 hover:text-red-500 hover:bg-red-50"
                                              aria-label={`Move option ${optIdx + 1} up`}
                                              disabled={optIdx === 0}
                                              onClick={() => moveOption(sec.id, q.id, optIdx, optIdx - 1)}
                                            >
                                              <ArrowUp />
                                            </Button>
                                            <Button
                                              variant="ghost"
                                              size="icon-xs"
                                              className="text-slate-300 hover:text-red-500 hover:bg-red-50"
                                              aria-label={`Move option ${optIdx + 1} down`}
                                              disabled={optIdx === (q.options?.length ?? 0) - 1}
                                              onClick={() => moveOption(sec.id, q.id, optIdx, optIdx + 1)}
                                            >
                                              <ArrowDown />
                                            </Button>
                                            <Button
                                              variant="ghost"
                                              size="icon-xs"
                                              className="text-slate-300 hover:text-red-500 hover:bg-red-50"
                                              onClick={() => removeOption(secIdx, qIdx, optIdx)}
                                            >
                                              <Trash className="size-3" />
                                            </Button>
                                          </div>
                                        ))}
                                        <Button
                                          variant="ghost"
                                          size="xs"
                                          className="mt-1 h-6 gap-1 px-1.5 text-[11px] text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                                          onClick={() => addOption(secIdx, qIdx)}
                                        >
                                          <Plus className="size-3" />
                                          Add Option
                                        </Button>
                                      </div>
                                    </div>
                                  )}

                                  {/* Matrix Configuration */}
                                  {q.type === "matrix" && (
                                    <div className="border-t border-slate-100 bg-slate-50/30 px-3 py-3 rounded-b-xl">
                                      <div className="space-y-4 pl-7">
                                        <div className="space-y-1.5">
                                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Rows</label>
                                          {q.options?.map((opt, optIdx) => (
                                            <div
                                              key={optIdx}
                                              draggable
                                              onDragStart={(event) => handleDragStart(event, {
                                                kind: "option",
                                                sectionId: sec.id,
                                                questionId: q.id,
                                                index: optIdx,
                                              })}
                                              onDragEnd={() => setDragItem(null)}
                                              onDragOver={(event) => event.preventDefault()}
                                              onDrop={(event) => handleDrop(event, {
                                                kind: "option",
                                                sectionId: sec.id,
                                                questionId: q.id,
                                                index: optIdx,
                                              })}
                                              className="flex items-center gap-2"
                                            >
                                              <GripVertical className="size-3.5 cursor-grab text-slate-300" aria-label="Drag row" />
                                              <Input
                                                className="h-7 flex-1 bg-white text-xs"
                                                placeholder={`Row ${optIdx + 1}`}
                                                value={opt}
                                                onChange={(e) =>
                                                  updateOption(secIdx, qIdx, optIdx, e.target.value)
                                                }
                                              />
                                              <Button
                                                variant="ghost"
                                                size="icon-xs"
                                                className="text-slate-300 hover:text-red-500 hover:bg-red-50"
                                                aria-label={`Move row ${optIdx + 1} up`}
                                                disabled={optIdx === 0}
                                                onClick={() => moveOption(sec.id, q.id, optIdx, optIdx - 1)}
                                              >
                                                <ArrowUp />
                                              </Button>
                                              <Button
                                                variant="ghost"
                                                size="icon-xs"
                                                className="text-slate-300 hover:text-red-500 hover:bg-red-50"
                                                aria-label={`Move row ${optIdx + 1} down`}
                                                disabled={optIdx === (q.options?.length ?? 0) - 1}
                                                onClick={() => moveOption(sec.id, q.id, optIdx, optIdx + 1)}
                                              >
                                                <ArrowDown />
                                              </Button>
                                              <Button
                                                variant="ghost"
                                                size="icon-xs"
                                                className="text-slate-300 hover:text-red-500 hover:bg-red-50"
                                                onClick={() => removeOption(secIdx, qIdx, optIdx)}
                                              >
                                                <Trash className="size-3" />
                                              </Button>
                                            </div>
                                          ))}
                                          <Button
                                            variant="ghost"
                                            size="xs"
                                            className="mt-1 h-6 gap-1 px-1.5 text-[11px] text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                                            onClick={() => addOption(secIdx, qIdx)}
                                          >
                                            <Plus className="size-3" />
                                            Add Row
                                          </Button>
                                        </div>

                                        <div className="space-y-1.5">
                                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Columns</label>
                                          {((q.config?.columns as string[]) ?? []).map((col, colIdx) => (
                                            <div
                                              key={colIdx}
                                              draggable
                                              onDragStart={(event) => handleDragStart(event, {
                                                kind: "column",
                                                sectionId: sec.id,
                                                questionId: q.id,
                                                index: colIdx,
                                              })}
                                              onDragEnd={() => setDragItem(null)}
                                              onDragOver={(event) => event.preventDefault()}
                                              onDrop={(event) => handleDrop(event, {
                                                kind: "column",
                                                sectionId: sec.id,
                                                questionId: q.id,
                                                index: colIdx,
                                              })}
                                              className="flex items-center gap-2"
                                            >
                                              <GripVertical className="size-3.5 cursor-grab text-slate-300" aria-label="Drag column" />
                                              <Input
                                                className="h-7 flex-1 bg-white text-xs"
                                                placeholder={`Column ${colIdx + 1}`}
                                                value={col}
                                                onChange={(e) => {
                                                  const newCols = [...((q.config?.columns as string[]) ?? [])]
                                                  newCols[colIdx] = e.target.value
                                                  updateQuestion(secIdx, qIdx, {
                                                    config: { ...(q.config || {}), columns: newCols }
                                                  })
                                                }}
                                              />
                                              <Button
                                                variant="ghost"
                                                size="icon-xs"
                                                className="text-slate-300 hover:text-red-500 hover:bg-red-50"
                                                aria-label={`Move column ${colIdx + 1} up`}
                                                disabled={colIdx === 0}
                                                onClick={() => moveColumn(sec.id, q.id, colIdx, colIdx - 1)}
                                              >
                                                <ArrowUp />
                                              </Button>
                                              <Button
                                                variant="ghost"
                                                size="icon-xs"
                                                className="text-slate-300 hover:text-red-500 hover:bg-red-50"
                                                aria-label={`Move column ${colIdx + 1} down`}
                                                disabled={colIdx === (((q.config?.columns as string[]) ?? []).length - 1)}
                                                onClick={() => moveColumn(sec.id, q.id, colIdx, colIdx + 1)}
                                              >
                                                <ArrowDown />
                                              </Button>
                                              <Button
                                                variant="ghost"
                                                size="icon-xs"
                                                className="text-slate-300 hover:text-red-500 hover:bg-red-50"
                                                onClick={() => {
                                                  const newCols = [...((q.config?.columns as string[]) ?? [])]
                                                  newCols.splice(colIdx, 1)
                                                  updateQuestion(secIdx, qIdx, {
                                                    config: { ...(q.config || {}), columns: newCols }
                                                  })
                                                }}
                                              >
                                                <Trash className="size-3" />
                                              </Button>
                                            </div>
                                          ))}
                                          <Button
                                            variant="ghost"
                                            size="xs"
                                            className="mt-1 h-6 gap-1 px-1.5 text-[11px] text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                                            onClick={() => {
                                              const newCols = [...((q.config?.columns as string[]) ?? []), ""]
                                              updateQuestion(secIdx, qIdx, {
                                                config: { ...(q.config || {}), columns: newCols }
                                              })
                                            }}
                                          >
                                            <Plus className="size-3" />
                                            Add Column
                                          </Button>
                                        </div>
                                      </div>
                                    </div>
                                  )}

                                  {/* Scale Configuration */}
                                  {q.type === "scale" && (
                                    <div className="border-t border-slate-100 bg-slate-50/30 px-3 py-3 rounded-b-xl">
                                      <div className="space-y-3 pl-7">
                                        <div className="flex items-center gap-4">
                                          <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-slate-400 uppercase">Min Value</label>
                                            <select
                                              value={(q.config?.min as number) ?? 1}
                                              onChange={(e) => updateQuestion(secIdx, qIdx, {
                                                config: { ...(q.config || {}), min: Number(e.target.value) }
                                              })}
                                              className="h-8 w-16 rounded border border-slate-200 bg-white px-2 text-xs"
                                            >
                                              <option value={0}>0</option>
                                              <option value={1}>1</option>
                                            </select>
                                          </div>
                                          <span className="text-slate-400 text-xs mt-4">to</span>
                                          <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-slate-400 uppercase">Max Value</label>
                                            <select
                                              value={(q.config?.max as number) ?? 5}
                                              onChange={(e) => updateQuestion(secIdx, qIdx, {
                                                config: { ...(q.config || {}), max: Number(e.target.value) }
                                              })}
                                              className="h-8 w-16 rounded border border-slate-200 bg-white px-2 text-xs"
                                            >
                                              {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((val) => (
                                                <option key={val} value={val}>{val}</option>
                                              ))}
                                            </select>
                                          </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                          <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-slate-400 uppercase">Min Label (Optional)</label>
                                            <Input
                                              className="h-7 text-xs bg-white"
                                              placeholder="e.g. Strongly disagree"
                                              value={(q.config?.min_label as string) ?? ""}
                                              onChange={(e) => updateQuestion(secIdx, qIdx, {
                                                config: { ...(q.config || {}), min_label: e.target.value }
                                              })}
                                            />
                                          </div>
                                          <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-slate-400 uppercase">Max Label (Optional)</label>
                                            <Input
                                              className="h-7 text-xs bg-white"
                                              placeholder="e.g. Strongly agree"
                                              value={(q.config?.max_label as string) ?? ""}
                                              onChange={(e) => updateQuestion(secIdx, qIdx, {
                                                config: { ...(q.config || {}), max_label: e.target.value }
                                              })}
                                            />
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ))}

                              {/* Add question to this section */}
                              <button
                                type="button"
                                onClick={() => addQuestion(secIdx)}
                                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-200 bg-white px-3 py-2 text-[12px] font-medium text-slate-500 transition-colors hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50/30"
                              >
                                <Plus className="size-3.5" />
                                Add Question
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}

                    {/* Add section */}
                    <button
                      type="button"
                      onClick={addSection}
                      className="flex w-full items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-violet-200 bg-violet-50/30 px-3 py-3 text-[12px] font-medium text-violet-600 transition-colors hover:border-violet-300 hover:bg-violet-50/60"
                    >
                      <Plus className="size-3.5" />
                      Add Section
                    </button>
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
