import { useState, useEffect, useRef, useCallback, useDeferredValue } from "react"
import type { DragEvent } from "react"
import { ApiError } from "@/lib/api"
import {
  fetchSurveys,
  fetchSurvey,
  createSurveyWithStructure,
  updateSurvey,
  deleteSurvey,
  replaceSurveyStructure,
  restoreSurvey,
  fetchResponses,
  fetchResponseAggregates,
  exportResponses,
  eraseResponses,
} from "@/lib/surveys"
import type { ApiPagination, Survey, SurveyStatus, SurveyResponse, SurveyResponseAggregate } from "@/lib/surveys"
import { validateSurveyStructure } from "@/lib/survey-structure"

import { ALUMNI_QUESTIONNAIRE } from "./constants"
import type { ModalState, DragItem, EditorSection, EditorQuestion, PendingAction } from "./types"
import {
  createClientId,
  toEditorSections,
  toStructurePayload,
  moveInArray,
  getSurveyCapabilities,
  canSortSurveysByResponseCount,
  buildEraseAllResponsesPayload,
  getSurveyResponseResourceId,
  getSurveyRetentionState,
} from "./utils"

const RAW_RESPONSE_PAGE_SIZE = 25

export interface UseSurveyManagementProps {
  permissions: string[]
  csvExportEnabled: boolean
}

export function useSurveyManagement({ permissions, csvExportEnabled }: UseSurveyManagementProps) {
  const capabilities = getSurveyCapabilities(permissions, csvExportEnabled)
  const canManage = capabilities.manage
  const canManageDistribution = capabilities.distributionManage
  const canReadAggregates = capabilities.readAggregates
  const canReadRaw = capabilities.readRaw
  const canExport = capabilities.export
  const canErase = capabilities.erase
  const canSortByResponseCount = canSortSurveysByResponseCount(capabilities)

  const [surveys, setSurveys] = useState<Survey[]>([])
  const [showArchived, setShowArchived] = useState(false)
  const [loading, setLoading] = useState(true)
  const [listLoading, setListLoading] = useState(false)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<SurveyStatus | "all">("all")
  const [cohortFilter, setCohortFilter] = useState("")
  const [sortBy, setSortBy] = useState<"created_at" | "title" | "status" | "responses_count">("created_at")
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc")
  const [statusFilterOpen, setStatusFilterOpen] = useState(false)
  const [cohortFilterOpen, setCohortFilterOpen] = useState(false)
  const [sortFilterOpen, setSortFilterOpen] = useState(false)
  const [offset, setOffset] = useState(0)
  const [listRevision, setListRevision] = useState(0)
  const [totalSurveys, setTotalSurveys] = useState(0)
  const [cohortOptions, setCohortOptions] = useState<string[]>([])
  const [pendingAction, setPendingAction] = useState<Exclude<PendingAction, null> | null>(null)
  const pendingActionRef = useRef<Exclude<PendingAction, null> | null>(null)
  const [requestError, setRequestError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [modalState, setModalState] = useState<ModalState>(null)
  const [viewTab, setViewTab] = useState<"questions" | "responses">("questions")
  const [sections, setSections] = useState<EditorSection[]>([])
  const [originalSections, setOriginalSections] = useState<EditorSection[]>([])
  const [targetCohort, setTargetCohort] = useState("Class of 2024")
  const [cohortOpen, setCohortOpen] = useState(false)
  const [openQuestionSelectId, setOpenQuestionSelectId] = useState<string | null>(null)
  const [statusOpen, setStatusOpen] = useState(false)
  const [surveyStatus, setSurveyStatus] = useState<SurveyStatus>("Inactive")
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [surveyTitle, setSurveyTitle] = useState("")
  const [surveyDescription, setSurveyDescription] = useState("")
  const [retentionEnabled, setRetentionEnabled] = useState(
    () => getSurveyRetentionState().retentionEnabled,
  )
  const [retentionDays, setRetentionDays] = useState(
    () => getSurveyRetentionState().retentionDays,
  )
  const [showGeneratePreview, setShowGeneratePreview] = useState(false)
  const [distributeSurveyId, setDistributeSurveyId] = useState<string | null>(null)
  const [surveyResponses, setSurveyResponses] = useState<SurveyResponse[]>([])
  const [responseAggregates, setResponseAggregates] = useState<SurveyResponseAggregate[]>([])
  const [responseSurveyId, setResponseSurveyId] = useState<string | null>(null)
  const [responsePagination, setResponsePagination] = useState<ApiPagination | null>(null)
  const [aggregateLoading, setAggregateLoading] = useState(false)
  const [rawLoading, setRawLoading] = useState(false)
  const [aggregateError, setAggregateError] = useState<string | null>(null)
  const [rawError, setRawError] = useState<string | null>(null)
  const [aggregateLoaded, setAggregateLoaded] = useState(false)
  const [rawResponsesLoaded, setRawResponsesLoaded] = useState(false)
  const [selectedResponseIds, setSelectedResponseIdsState] = useState<string[]>([])
  const [responseAction, setResponseAction] = useState<"export" | "erase" | null>(null)
  const responseRequestRef = useRef(0)
  const [dragItem, setDragItem] = useState<DragItem | null>(null)
  const deferredSearch = useDeferredValue(search)

  const editedSurvey = modalState?.type === "edit"
    ? surveys.find((survey) => survey.id === modalState.id)
    : undefined
  const structureEditable = modalState?.type !== "edit" || editedSurvey?.status === "Inactive"

  const interactionLocked = loading || pendingAction !== null
  const pendingLabel = pendingAction?.type === "view"
      ? "Loading survey..."
      : pendingAction?.type === "edit"
        ? "Opening editor..."
        : pendingAction?.type === "generate"
          ? "Generating questionnaire..."
          : pendingAction?.type === "save"
            ? "Saving survey..."
                : pendingAction?.type === "delete"
                  ? "Archiving survey..."
                  : pendingAction?.type === "restore"
                    ? "Restoring survey..."
      : pendingAction?.type === "distribute"
        ? "Loading distribution..."
        : pendingAction?.type === "responses"
          ? "Updating responses..."
        : null

  const runExclusive = async <T,>(
    action: Exclude<PendingAction, null>,
    operation: () => Promise<T>,
  ): Promise<T | undefined> => {
    if (pendingActionRef.current !== null) return undefined
    pendingActionRef.current = action
    setPendingAction(action)
    try {
      return await operation()
    } finally {
      pendingActionRef.current = null
      setPendingAction(null)
    }
  }

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setListLoading(true)
      try {
        const result = await fetchSurveys({
          includeArchived: showArchived,
          ...(deferredSearch ? { search: deferredSearch } : {}),
          ...(statusFilter !== "all" ? { status: statusFilter } : {}),
          ...(cohortFilter ? { targetCohort: cohortFilter } : {}),
          sortBy: canSortByResponseCount || sortBy !== "responses_count" ? sortBy : "created_at",
          sortOrder,
          limit: 20,
          offset,
        })
        if (!cancelled) {
          setSurveys(result.surveys)
          setTotalSurveys(result.pagination.total)
          setCohortOptions((current) => Array.from(new Set([
            ...current,
            ...result.surveys.flatMap((survey) => survey.targetCohort ? [survey.targetCohort] : []),
          ])).sort())
        }
      } catch (error) {
        if (!cancelled) setRequestError(error instanceof Error ? error.message : "We could not load surveys.")
      } finally {
        if (!cancelled) {
          setLoading(false)
          setListLoading(false)
        }
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [showArchived, deferredSearch, statusFilter, cohortFilter, sortBy, sortOrder, offset, listRevision, canSortByResponseCount])

  const refreshListAfterCountChange = (nextTotal: number) => {
    setTotalSurveys(nextTotal)
    if (offset > 0 && offset >= nextTotal) {
      setOffset(Math.max(0, offset - 20))
    } else {
      setListRevision((revision) => revision + 1)
    }
  }

  const handleDelete = async (surveyId: string) => {
    if (!canManage) return
    setRequestError(null)
    await runExclusive({ type: "delete", surveyId }, async () => {
      try {
        await deleteSurvey(surveyId)
        setSurveys((prev) => prev.filter((s) => s.surveyId !== surveyId))
        refreshListAfterCountChange(Math.max(0, totalSurveys - 1))
      } catch (error) {
        setRequestError(error instanceof Error ? error.message : "We could not archive the survey.")
        throw error
      }
    })
  }

  const handleRestore = async (survey: Survey) => {
    if (!canManage) return
    setRequestError(null)
    await runExclusive({ type: "restore", surveyId: survey.id }, async () => {
      try {
        const restored = await restoreSurvey(survey.surveyId)
        if (showArchived) {
          setSurveys((previous) => previous.filter((item) => item.id !== survey.id))
          refreshListAfterCountChange(Math.max(0, totalSurveys - 1))
        } else {
          setSurveys((previous) => previous.map((item) => item.id === survey.id ? restored : item))
          setListRevision((revision) => revision + 1)
        }
      } catch (error) {
        setRequestError(error instanceof Error ? error.message : "We could not restore the survey.")
      }
    })
  }

  const clearResponseState = useCallback(() => {
    responseRequestRef.current += 1
    setSurveyResponses([])
    setResponseAggregates([])
    setResponsePagination(null)
    setResponseSurveyId(null)
    setAggregateLoading(false)
    setRawLoading(false)
    setAggregateError(null)
    setRawError(null)
    setAggregateLoaded(false)
    setRawResponsesLoaded(false)
    setSelectedResponseIdsState([])
    setResponseAction(null)
  }, [])

  useEffect(() => () => {
    clearResponseState()
  }, [clearResponseState])

  const handleCloseModal = () => {
    clearResponseState()
    setModalState(null)
    setDragItem(null)
    setSections([])
    setOriginalSections([])
    setSurveyTitle("")
    setSurveyDescription("")
    const retention = getSurveyRetentionState()
    setRetentionEnabled(retention.retentionEnabled)
    setRetentionDays(retention.retentionDays)
    setTargetCohort("Class of 2024")
    setSurveyStatus("Inactive")
    setViewTab("questions")
  }

  const handleOpenCreate = () => {
    if (!canManage || interactionLocked) return
    setSurveyTitle("")
    setSurveyDescription("")
    const retention = getSurveyRetentionState()
    setRetentionEnabled(retention.retentionEnabled)
    setRetentionDays(retention.retentionDays)
    setTargetCohort("Class of 2024")
    setSurveyStatus("Inactive")
    setSections([{
      id: createClientId(),
      title: "",
      description: "",
      orderIndex: 0,
      questions: [],
    }])
    setModalState({ type: "create" })
  }

  const handleOpenView = async (id: string) => {
    const survey = surveys.find((s) => s.id === id)
    if (!survey) return
    setRequestError(null)
    await runExclusive({ type: "view", surveyId: id }, async () => {
      try {
        const full = await fetchSurvey(survey.surveyId)
        setSurveys((prev) => prev.map((s) => (s.id === id ? { ...s, ...full } : s)))
        const retention = getSurveyRetentionState(full)
        setRetentionEnabled(retention.retentionEnabled)
        setRetentionDays(retention.retentionDays)
        clearResponseState()
        setModalState({ type: "view", id })
      } catch (error) {
        setRequestError(error instanceof Error ? error.message : "We could not load the survey.")
      }
    })
  }

  const loadAggregateData = async (surveyUuid: string) => {
    const requestId = ++responseRequestRef.current
    setAggregateLoading(true)
    setAggregateError(null)
    try {
      const aggregates = await fetchResponseAggregates(surveyUuid)
      if (requestId !== responseRequestRef.current) return
      setResponseAggregates(aggregates)
      setAggregateLoaded(true)
    } catch (error) {
      if (requestId !== responseRequestRef.current) return
      const message = error instanceof Error ? error.message : "We could not load aggregate responses."
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        clearResponseState()
        setAggregateError(message)
      } else {
        setAggregateError(message)
      }
    } finally {
      if (requestId === responseRequestRef.current) setAggregateLoading(false)
    }
  }

  const handleLoadRawResponses = async (survey: Survey, requestedOffset = 0) => {
    if (!canReadRaw || rawLoading) return
    const surveyUuid = getSurveyResponseResourceId(survey)
    if (responseSurveyId !== surveyUuid) {
      clearResponseState()
      setResponseSurveyId(surveyUuid)
    }
    const requestId = ++responseRequestRef.current
    setRawLoading(true)
    setRawError(null)
    setSelectedResponseIdsState([])
    try {
      const result = await fetchResponses(surveyUuid, {
        limit: RAW_RESPONSE_PAGE_SIZE,
        offset: Math.max(0, requestedOffset),
      })
      if (requestId !== responseRequestRef.current) return
      setSurveyResponses(result.responses)
      setResponsePagination(result.pagination)
      setRawResponsesLoaded(true)
    } catch (error) {
      if (requestId !== responseRequestRef.current) return
      const message = error instanceof Error ? error.message : "We could not load survey responses."
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        clearResponseState()
        setRawError(message)
      } else {
        setRawError(message)
      }
    } finally {
      if (requestId === responseRequestRef.current) setRawLoading(false)
    }
  }

  const handleViewResponses = (survey: Survey) => {
    const surveyUuid = getSurveyResponseResourceId(survey)
    const surveyChanged = responseSurveyId !== surveyUuid
    setViewTab("responses")
    if (surveyChanged) {
      clearResponseState()
      setResponseSurveyId(surveyUuid)
    }
    if (canReadAggregates && (surveyChanged || !aggregateLoaded) && !aggregateLoading) {
      void loadAggregateData(surveyUuid)
    }
  }

  const refreshResponseState = async (survey: Survey) => {
    const shouldReloadRaw = rawResponsesLoaded
    const currentOffset = responsePagination?.offset ?? 0
    const refreshed = await fetchSurvey(survey.surveyId)
    setSurveys((previous) => previous.map((item) => item.id === refreshed.id ? refreshed : item))
    clearResponseState()
    setResponseSurveyId(getSurveyResponseResourceId(refreshed))
    if (canReadAggregates) await loadAggregateData(getSurveyResponseResourceId(refreshed))
    if (shouldReloadRaw) await handleLoadRawResponses(refreshed, currentOffset)
  }

  const handleExportResponses = async (surveyUuid: string) => {
    if (!canExport || responseAction !== null) return
    setResponseAction("export")
    setAggregateError(null)
    setRawError(null)
    try {
      await exportResponses(surveyUuid)
    } catch (error) {
      const message = error instanceof Error ? error.message : "We could not export survey responses."
      setAggregateError(message)
      setRawError(message)
    } finally {
      setResponseAction(null)
    }
  }

  const handleEraseResponses = async (
    survey: Survey,
    scope: "selected" | "all",
  ) => {
    if (!canErase || responseAction !== null) return
    if (scope === "selected" && (!canReadRaw || selectedResponseIds.length === 0)) return
    if (scope === "all" && !survey.isDeleted) return
    const allPayload = scope === "all"
      ? buildEraseAllResponsesPayload(survey.responses)
      : null
    if (scope === "all" && allPayload === null) {
      const message = "The exact response count is unavailable. Refresh the survey before erasing all responses."
      setAggregateError(message)
      setRawError(message)
      setRequestError(message)
      return
    }
    const erasePayload = allPayload ?? {
      scope: "selected" as const,
      response_ids: selectedResponseIds,
      confirmation: "ERASE_SELECTED_RESPONSES" as const,
    }
    const confirmed = window.confirm(
      erasePayload.scope === "all"
        ? `Erase all ${erasePayload.expected_response_count} responses from ${survey.title}? This cannot be undone.`
        : `Erase ${selectedResponseIds.length} selected response${selectedResponseIds.length === 1 ? "" : "s"}? This cannot be undone.`,
    )
    if (!confirmed) return

    setResponseAction("erase")
    setAggregateError(null)
    setRawError(null)
    await runExclusive({ type: "responses", surveyId: survey.id }, async () => {
      try {
        await eraseResponses(
          getSurveyResponseResourceId(survey),
          erasePayload,
          createClientId(),
        )
        if (scope === "all") {
          setSurveys((previous) => previous.map((item) => (
            item.id === survey.id ? { ...item, responses: 0 } : item
          )))
          clearResponseState()
          setListRevision((current) => current + 1)
        } else {
          await refreshResponseState(survey)
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "We could not erase survey responses."
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          clearResponseState()
        }
        setAggregateError(message)
        setRawError(message)
        if (scope === "all") setRequestError(message)
      }
    })
    setResponseAction(null)
  }

  const handleOpenEdit = async (id: string) => {
    if (!canManage) return
    const survey = surveys.find((s) => s.id === id)
    if (!survey) return
    setRequestError(null)
    await runExclusive({ type: "edit", surveyId: id }, async () => {
      try {
        const full = await fetchSurvey(survey.surveyId)
        setSurveys((prev) => prev.map((item) => (item.id === full.id ? full : item)))
        setSurveyTitle(full.title)
        setSurveyDescription(full.description ?? "")
        const retention = getSurveyRetentionState(full)
        setRetentionEnabled(retention.retentionEnabled)
        setRetentionDays(retention.retentionDays)
        setTargetCohort(full.targetCohort ?? "Class of 2024")
        setSurveyStatus(full.status)
        const loaded = toEditorSections(full.sections ?? [])
        setOriginalSections(loaded)
        setSections(loaded)
        setModalState({ type: "edit", id })
      } catch (error) {
        setRequestError(error instanceof Error ? error.message : "We could not open the editor.")
      }
    })
  }

  const handleShowGeneratePreview = () => {
    if (!canManage || interactionLocked) return
    setShowGeneratePreview(true)
  }

  const handleConfirmGenerate = async () => {
    if (!canManage || generating || interactionLocked) return
    setRequestError(null)
    await runExclusive({ type: "generate" }, async () => {
      setGenerating(true)
      try {
        const created = await createSurveyWithStructure({
          title: "Alumni Survey Questionnaire",
          description: "This comprehensive survey helps us understand your post-graduation journey — from employment outcomes and degree-to-career alignment to socioeconomic impact and personal growth.",
          target_cohort: "All Alumni",
          status: "Inactive",
          sections: ALUMNI_QUESTIONNAIRE.map((section) => ({
            client_id: createClientId(),
            title: section.title,
            description: section.description,
            questions: section.questions.map((question) => ({
              client_id: createClientId(),
              question_text: question.question_text,
              question_type: question.question_type,
              options: question.options,
              config: question.config,
              is_required: true,
            })),
          })),
        })
        setSurveys((prev) => [created, ...prev])
        setShowGeneratePreview(false)
      } catch (error) {
        setRequestError(error instanceof Error ? error.message : "We could not generate the questionnaire.")
      } finally {
        setGenerating(false)
      }
    })
  }

  const performSaveSurvey = async () => {
    if (!canManage || !surveyTitle.trim() || saving) return
    setSaving(true)
    setSaveError(null)
    try {
      const structureError = validateSurveyStructure(sections)
      if (structureError) {
        setSaveError(structureError)
        return
      }
      if (!Number.isInteger(retentionDays) || retentionDays < 1) {
        setSaveError("Retention period must be a positive whole number of days.")
        return
      }
      if (surveyStatus === "Active") {
        if (sections.length === 0) {
          setSaveError("Add at least one section before activating the survey.")
          return
        }
        const emptySection = sections.find((section) => section.questions.length === 0)
        if (emptySection) {
          setSaveError(
            `Section "${emptySection.title || "Untitled Section"}" must contain at least one question before activating.`,
          )
          return
        }
      }

      if (modalState?.type === "create") {
        const created = await createSurveyWithStructure({
          title: surveyTitle,
          description: surveyDescription || null,
          target_cohort: targetCohort,
          status: surveyStatus,
          retention_enabled: retentionEnabled,
          retention_days: retentionDays,
          ...toStructurePayload(sections),
        })
        setSurveys((prev) => [created, ...prev.filter((survey) => survey.id !== created.id)])
      } else if (modalState?.type === "edit") {
        const target = surveys.find((s) => s.id === modalState.id)
        if (!target) return

        const structureChanged = JSON.stringify(sections) !== JSON.stringify(originalSections)
        const structureEditable = target.status === "Inactive"
        if (structureChanged && !structureEditable) {
          setSaveError("Only inactive surveys can have their structure edited. The backend will check for response conflicts when saving.")
          return
        }

        if (structureChanged) {
          const removedSectionIds = originalSections
            .filter((original) => !sections.some((section) => section.id === original.id))
            .flatMap((section) => section.persistedId ? [section.persistedId] : [])
          const saved = await replaceSurveyStructure(target.id, {
            ...toStructurePayload(sections),
            cascade_section_ids: removedSectionIds,
            expected_updated_at: target.updatedAt,
          })
          const savedSections = toEditorSections(saved.sections ?? [])
          setSections(savedSections)
          setOriginalSections(savedSections)
          setSurveys((prev) => prev.map((survey) => survey.id === saved.id ? saved : survey))
        }
        await updateSurvey(target.surveyId, {
          title: surveyTitle,
          description: surveyDescription || null,
          target_cohort: targetCohort,
          status: surveyStatus,
          retention_enabled: retentionEnabled,
          retention_days: retentionDays,
        })
        const refreshed = await fetchSurvey(target.surveyId)
        setSurveys((prev) => prev.map((s) => (s.id === refreshed.id ? refreshed : s)))
      }
      handleCloseModal()
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : "We could not save the survey. Please try again.",
      )
    } finally {
      setSaving(false)
    }
  }

  const handleSaveSurvey = async () => {
    if (!canManage || !surveyTitle.trim() || saving || interactionLocked) return
    const action: Exclude<PendingAction, null> = modalState?.type === "edit"
      ? { type: "save", surveyId: modalState.id }
      : { type: "save" }
    await runExclusive(action, performSaveSurvey)
  }

  const handleOpenDistribute = (surveyId: string) => {
    if (!canManageDistribution || interactionLocked) return
    setRequestError(null)
    setDistributeSurveyId(surveyId)
  }

  const setSelectedResponseIds = (responseIds: string[]) => {
    setSelectedResponseIdsState((current) => {
      const next = Array.from(new Set(responseIds)).slice(0, 100)
      return next.length === current.length && next.every((id, index) => id === current[index])
        ? current
        : next
    })
  }

  const addSection = () => {
    setSections((prev) => [
      ...prev,
      {
        id: createClientId(),
        title: "",
        description: "",
        orderIndex: prev.length,
        questions: [],
      },
    ])
  }

  const moveSection = (id: string, delta: number) => {
    setSections((prev) => {
      const from = prev.findIndex((section) => section.id === id)
      const to = from + delta
      const next = moveInArray(prev, from, to)
      return next.map((section, index) => ({ ...section, orderIndex: index }))
    })
  }

  const moveQuestion = (
    sourceSectionId: string,
    questionId: string,
    targetSectionId: string,
    targetIndex: number,
  ) => {
    setSections((prev) => {
      const sourceSectionIndex = prev.findIndex((section) => section.id === sourceSectionId)
      const targetSectionIndex = prev.findIndex((section) => section.id === targetSectionId)
      if (sourceSectionIndex < 0 || targetSectionIndex < 0) return prev

      const sourceSection = prev[sourceSectionIndex]!
      const sourceIndex = sourceSection.questions.findIndex((question) => question.id === questionId)
      if (sourceIndex < 0) return prev

      const next = prev.map((section) => ({ ...section, questions: [...section.questions] }))
      const [question] = next[sourceSectionIndex]!.questions.splice(sourceIndex, 1)
      if (!question) return prev

      const adjustedTargetIndex =
        sourceSectionIndex === targetSectionIndex && sourceIndex < targetIndex
          ? targetIndex - 1
          : targetIndex
      const movedQuestion = { ...question, sectionId: targetSectionId }
      next[targetSectionIndex]!.questions.splice(
        Math.max(0, Math.min(adjustedTargetIndex, next[targetSectionIndex]!.questions.length)),
        0,
        movedQuestion,
      )
      return next
    })
  }

  const moveQuestionBy = (sectionId: string, questionId: string, delta: number) => {
    setSections((prev) => {
      const section = prev.find((item) => item.id === sectionId)
      if (!section) return prev
      const from = section.questions.findIndex((question) => question.id === questionId)
      const to = from + delta
      if (from < 0 || to < 0 || to >= section.questions.length) return prev
      return prev.map((item) =>
        item.id === sectionId
          ? { ...item, questions: moveInArray(item.questions, from, to) }
          : item,
      )
    })
  }

  const moveOption = (
    sectionId: string,
    questionId: string,
    from: number,
    to: number,
  ) => {
    setSections((prev) => prev.map((section) => {
      if (section.id !== sectionId) return section
      return {
        ...section,
        questions: section.questions.map((question) =>
          question.id === questionId
            ? { ...question, options: moveInArray(question.options ?? [], from, to) }
            : question,
        ),
      }
    }))
  }

  const moveColumn = (
    sectionId: string,
    questionId: string,
    from: number,
    to: number,
  ) => {
    setSections((prev) => prev.map((section) => {
      if (section.id !== sectionId) return section
      return {
        ...section,
        questions: section.questions.map((question) => {
          if (question.id !== questionId) return question
          const columns = (question.config?.columns as string[] | undefined) ?? []
          return {
            ...question,
            config: { ...(question.config ?? {}), columns: moveInArray(columns, from, to) },
          }
        }),
      }
    }))
  }

  const handleDragStart = (event: DragEvent, item: DragItem) => {
    event.stopPropagation()
    setDragItem(item)
    event.dataTransfer.effectAllowed = "move"
    event.dataTransfer.setData("text/plain", item.kind)
  }

  const handleDrop = (event: DragEvent, target: DragItem) => {
    event.preventDefault()
    event.stopPropagation()
    const source = dragItem
    setDragItem(null)
    if (!source) return

    if (source.kind === "section" && target.kind === "section") {
      setSections((prev) => {
        const from = prev.findIndex((section) => section.id === source.id)
        const to = prev.findIndex((section) => section.id === target.id)
        return moveInArray(prev, from, to).map((section, index) => ({ ...section, orderIndex: index }))
      })
    } else if (source.kind === "question" && target.kind === "section") {
      moveQuestion(source.sectionId, source.id, target.id, Number.MAX_SAFE_INTEGER)
    } else if (source.kind === "question" && target.kind === "question") {
      const targetSection = sections.find((section) => section.id === target.sectionId)
      const targetIndex = targetSection?.questions.findIndex((question) => question.id === target.id) ?? -1
      if (targetIndex >= 0) moveQuestion(source.sectionId, source.id, target.sectionId, targetIndex)
    } else if (source.kind === "option" && target.kind === "option" && source.questionId === target.questionId) {
      moveOption(source.sectionId, source.questionId, source.index, target.index)
    } else if (source.kind === "column" && target.kind === "column" && source.questionId === target.questionId) {
      moveColumn(source.sectionId, source.questionId, source.index, target.index)
    }
  }

  const updateSection = (secIdx: number, patch: Partial<EditorSection>) => {
    setSections((prev) => {
      const next = [...prev]
      next[secIdx] = { ...next[secIdx]!, ...patch }
      return next
    })
  }

  const removeSection = (id: string) => {
    const section = sections.find((item) => item.id === id)
    if (section && section.questions.length > 0) {
      const confirmed = window.confirm(
        `Delete this section and its ${section.questions.length} question${section.questions.length === 1 ? "" : "s"}?`,
      )
      if (!confirmed) return
    }
    setSections((prev) => prev.filter((s) => s.id !== id))
  }

  const addQuestion = (secIdx: number) => {
    setSections((prev) => {
      const next = [...prev]
      const sec = { ...next[secIdx]! }
      sec.questions = [
        ...sec.questions,
        { id: createClientId(), text: "", type: "text", options: null, config: null, isRequired: true },
      ]
      next[secIdx] = sec
      return next
    })
  }

  const updateQuestion = (secIdx: number, qIdx: number, patch: Partial<EditorQuestion>) => {
    setSections((prev) => {
      const next = [...prev]
      const sec = { ...next[secIdx]! }
      const qs = [...sec.questions]
      qs[qIdx] = { ...qs[qIdx]!, ...patch }
      sec.questions = qs
      next[secIdx] = sec
      return next
    })
  }

  const removeQuestion = (secIdx: number, qId: string) => {
    setSections((prev) => {
      const next = [...prev]
      const sec = { ...next[secIdx]! }
      sec.questions = sec.questions.filter((q) => q.id !== qId)
      next[secIdx] = sec
      return next
    })
  }

  const updateOption = (secIdx: number, qIdx: number, optIdx: number, value: string) => {
    setSections((prev) => {
      const next = [...prev]
      const sec = { ...next[secIdx]! }
      const qs = [...sec.questions]
      const q = { ...qs[qIdx]! }
      const opts = [...(q.options ?? [])]
      opts[optIdx] = value
      q.options = opts
      qs[qIdx] = q
      sec.questions = qs
      next[secIdx] = sec
      return next
    })
  }

  const removeOption = (secIdx: number, qIdx: number, optIdx: number) => {
    setSections((prev) => {
      const next = [...prev]
      const sec = { ...next[secIdx]! }
      const qs = [...sec.questions]
      const q = { ...qs[qIdx]! }
      const opts = [...(q.options ?? [])]
      opts.splice(optIdx, 1)
      q.options = opts
      qs[qIdx] = q
      sec.questions = qs
      next[secIdx] = sec
      return next
    })
  }

  const addOption = (secIdx: number, qIdx: number) => {
    setSections((prev) => {
      const next = [...prev]
      const sec = { ...next[secIdx]! }
      const qs = [...sec.questions]
      const q = { ...qs[qIdx]! }
      const opts = [...(q.options ?? [])]
      opts.push("")
      q.options = opts
      qs[qIdx] = q
      sec.questions = qs
      next[secIdx] = sec
      return next
    })
  }

  return {
      state: {
      surveys,
      showArchived,
      loading,
      listLoading,
      search,
      statusFilter,
      cohortFilter,
      sortBy,
      sortOrder,
      statusFilterOpen,
      cohortFilterOpen,
      sortFilterOpen,
      offset,
      totalSurveys,
      cohortOptions,
      pendingAction,
      requestError,
      saving,
      saveError,
      generating,
      modalState,
      viewTab,
      sections,
      targetCohort,
      cohortOpen,
      openQuestionSelectId,
      statusOpen,
      surveyStatus,
      deleteConfirmId,
      surveyTitle,
      surveyDescription,
      retentionEnabled,
      retentionDays,
      showGeneratePreview,
      distributeSurveyId,
        surveyResponses,
        responseAggregates,
        responseSurveyId,
        responsePagination,
        aggregateLoading,
        rawLoading,
        aggregateError,
        rawError,
        aggregateLoaded,
        rawResponsesLoaded,
        selectedResponseIds,
        responseAction,
      dragItem,
      editedSurvey,
      structureEditable,
      interactionLocked,
      pendingLabel,
        capabilities,
    },
    actions: {
      setShowArchived,
      setSearch,
      setStatusFilter,
      setCohortFilter,
      setSortBy,
      setSortOrder,
      setStatusFilterOpen,
      setCohortFilterOpen,
      setSortFilterOpen,
      setOffset,
      handleDelete,
      handleRestore,
      handleCloseModal,
      handleOpenCreate,
      handleOpenView,
      handleViewResponses,
      handleLoadRawResponses,
      handleExportResponses,
      handleEraseResponses,
      handleOpenEdit,
      handleShowGeneratePreview,
      handleConfirmGenerate,
      handleSaveSurvey,
      handleOpenDistribute,
      addSection,
      moveSection,
      moveQuestion,
      moveQuestionBy,
      moveOption,
      moveColumn,
      handleDragStart,
      handleDrop,
      updateSection,
      removeSection,
      addQuestion,
      updateQuestion,
      removeQuestion,
      updateOption,
      removeOption,
      addOption,
      setSurveyTitle,
      setSurveyDescription,
      setRetentionEnabled,
      setRetentionDays,
      setTargetCohort,
      setCohortOpen,
      setSurveyStatus,
      setStatusOpen,
      setOpenQuestionSelectId,
      setDeleteConfirmId,
      setShowGeneratePreview,
      setDistributeSurveyId,
      setViewTab,
      setSelectedResponseIds,
      setDragItem,
    }
  }
}
