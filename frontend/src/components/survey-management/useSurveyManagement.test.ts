import { act, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  fetchSurveys: vi.fn(),
  fetchSurvey: vi.fn(),
  fetchResponses: vi.fn(),
  fetchResponseAggregates: vi.fn(),
  eraseResponses: vi.fn(),
  updateSurvey: vi.fn(),
  createSurveyWithStructure: vi.fn(),
  replaceSurveyStructure: vi.fn(),
}))

vi.mock("@/lib/surveys", async () => {
  const actual = await vi.importActual<typeof import("@/lib/surveys")>("@/lib/surveys")
  return {
    ...actual,
    fetchSurveys: mocks.fetchSurveys,
    fetchSurvey: mocks.fetchSurvey,
    fetchResponses: mocks.fetchResponses,
    fetchResponseAggregates: mocks.fetchResponseAggregates,
    eraseResponses: mocks.eraseResponses,
    updateSurvey: mocks.updateSurvey,
    createSurveyWithStructure: mocks.createSurveyWithStructure,
    replaceSurveyStructure: mocks.replaceSurveyStructure,
  }
})

import { ApiError } from "@/lib/api"
import type { Survey, SurveyResponse, SurveyResponseAggregate } from "@/lib/surveys"
import { useSurveyManagement } from "./useSurveyManagement"
import { GRADUATE_TRACER_STUDY_SURVEY, GRADUATE_TRACER_STUDY_TEMPLATE_VERSION } from "./constants"

const survey: Survey = {
  id: "survey-uuid",
  surveyId: "SURV-001",
  title: "Alumni survey",
  status: "Inactive",
  responses: 1,
  dateCreated: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  isDeleted: false,
  retentionEnabled: true,
  retentionDays: 1825,
}

const aggregate: SurveyResponseAggregate = {
  question_id: "question-1",
  question_text: "How was it?",
  question_type: "single_choice",
  total: 1,
  cells: [{ value: "Good", count: 1, rank: null, row: null }],
}

const response: SurveyResponse = {
  id: "response-1",
  surveyId: survey.id,
  createdAt: "2026-02-01T00:00:00Z",
  answers: { "question-1": "Good" },
}

function listResult(currentSurvey: Survey) {
  return {
    surveys: [currentSurvey],
    pagination: {
      total: 1,
      count: 1,
      limit: 20,
      offset: 0,
      has_next: false,
      has_prev: false,
    },
  }
}

function conditionalSurvey(): Survey {
  return {
    ...survey,
    sections: [{
      id: "employment-section",
      title: "Employment",
      orderIndex: 0,
      questions: [
        {
          id: "industry-question",
          text: "Which industry do you work in?",
          type: "single_choice",
          options: ["Accounting", "Technology"],
          config: { question_key: "job_industry", survey_phase: 2 },
          isRequired: true,
        },
        {
          id: "category-question",
          text: "Which category best describes your work?",
          type: "single_choice",
          options: ["Audit", "Software"],
          config: {
            question_key: "job_category",
            survey_phase: 2,
            options_by_answer: {
              question_key: "job_industry",
              choices: { Accounting: ["Audit"], Technology: ["Software"] },
            },
          },
          isRequired: true,
        },
        {
          id: "conditional-text",
          text: "Accounting follow-up",
          type: "text",
          options: null,
          config: {
            survey_phase: 2,
            visible_when: { question_key: "job_industry", equals: "Accounting" },
          },
          isRequired: true,
        },
      ],
    }],
  }
}

function outdatedTemplate(): Survey {
  const sections = GRADUATE_TRACER_STUDY_SURVEY.sections
  const profile = sections[1]
  if (!profile) throw new Error("Profile section is missing")
  const oldSections = [
    sections[0],
    { ...profile, questions: profile.questions.slice(0, -1) },
    ...sections.slice(2, 7),
    ...sections.slice(9),
    sections[7],
  ]
  return {
    ...survey,
    title: GRADUATE_TRACER_STUDY_SURVEY.title,
    sections: oldSections.map((section, sectionIndex) => {
      if (!section) throw new Error("Questionnaire section is missing")
      return {
        id: `section-${sectionIndex}`,
        title: section.title,
        description: section.description,
        orderIndex: sectionIndex,
        questions: section.questions.map((question, questionIndex) => ({
          id: `question-${sectionIndex}-${questionIndex}`,
          text: question.question_text,
          type: question.question_type,
          options: question.options ? [...question.options] : null,
          config: question.config ? structuredClone(question.config) : null,
          isRequired: true,
        })),
      }
    }),
  }
}

describe("Generate Questionnaire with a saved template", () => {
  beforeEach(() => {
    const old = outdatedTemplate()
    mocks.fetchSurveys.mockImplementation(async (params: { isTemplate?: boolean }) =>
      listResult(params.isTemplate ? old : survey),
    )
    mocks.fetchSurvey.mockResolvedValue(old)
    mocks.createSurveyWithStructure.mockResolvedValue(survey)
    mocks.replaceSurveyStructure.mockResolvedValue(survey)
    mocks.updateSurvey.mockResolvedValue(survey)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  it("updates an outdated saved template before previewing and generating it", async () => {
    const updated = outdatedTemplate()
    updated.sections = GRADUATE_TRACER_STUDY_SURVEY.sections.map((section, sectionIndex) => ({
      id: `updated-section-${sectionIndex}`,
      title: section.title,
      description: section.description,
      orderIndex: sectionIndex,
      questions: section.questions.map((question, questionIndex) => ({
        id: `updated-question-${sectionIndex}-${questionIndex}`,
        text: question.question_text,
        type: question.question_type,
        options: question.options ? [...question.options] : null,
        config: question.config ? structuredClone(question.config) : null,
        isRequired: true,
      })),
    }))
    if (!updated.sections?.[0]?.questions[0]) throw new Error("Consent question is missing")
    updated.sections[0].questions[0].config = {
      ...updated.sections[0].questions[0].config,
      template_definition_version: GRADUATE_TRACER_STUDY_TEMPLATE_VERSION,
    }
    mocks.fetchSurvey.mockResolvedValueOnce(outdatedTemplate()).mockResolvedValueOnce(updated)
    const { result } = renderHook(() => useSurveyManagement({ permissions: ["surveys.manage"], csvExportEnabled: false }))
    await waitFor(() => expect(result.current.state.loading).toBe(false))
    await act(async () => { await result.current.actions.handleShowGeneratePreview() })
    expect(result.current.state.showGeneratePreview).toBe(true)
    expect(result.current.state.previewSurvey).toEqual(updated)
    expect(mocks.replaceSurveyStructure).toHaveBeenCalledOnce()
    const replacement = mocks.replaceSurveyStructure.mock.calls[0]?.[1] as { sections: { questions: unknown[] }[]; cascade_section_ids: string[] }
    expect(replacement.sections).toHaveLength(14)
    expect(replacement.sections.flatMap((section) => section.questions)).toHaveLength(80)
    expect(replacement.cascade_section_ids).toHaveLength(13)
    expect(mocks.updateSurvey).toHaveBeenCalledOnce()

    await act(async () => { await result.current.actions.handleConfirmGenerate() })
    const payload = mocks.createSurveyWithStructure.mock.calls[0]?.[0] as { sections: { questions: unknown[] }[] }
    expect(payload.sections).toHaveLength(14)
    expect(payload.sections.flatMap((section) => section.questions)).toHaveLength(80)
  })

  it("preserves edits in an already updated template", async () => {
    const custom = outdatedTemplate()
    if (!custom.sections?.[0]?.questions[0]) throw new Error("Consent question is missing")
    custom.sections[0].questions[0].config = {
      ...custom.sections[0].questions[0].config,
      template_definition_version: GRADUATE_TRACER_STUDY_TEMPLATE_VERSION,
    }
    custom.sections[1]?.questions[4]?.options?.push("2027")
    mocks.fetchSurvey.mockResolvedValue(custom)
    const { result } = renderHook(() => useSurveyManagement({ permissions: ["surveys.manage"], csvExportEnabled: false }))
    await waitFor(() => expect(result.current.state.loading).toBe(false))
    await act(async () => { await result.current.actions.handleShowGeneratePreview() })
    expect(result.current.state.previewSurvey).toEqual(custom)
    expect(mocks.replaceSurveyStructure).not.toHaveBeenCalled()

    await act(async () => { await result.current.actions.handleConfirmGenerate() })
    const payload = mocks.createSurveyWithStructure.mock.calls[0]?.[0] as { sections: { questions: unknown[] }[] }
    expect(payload.sections).toHaveLength(13)
    expect(payload.sections.flatMap((section) => section.questions)).toHaveLength(64)
  })

  it("creates the current saved template when none exists", async () => {
    const created = outdatedTemplate()
    mocks.fetchSurveys.mockImplementation(async (params: { isTemplate?: boolean }) =>
      params.isTemplate ? { ...listResult(survey), surveys: [] } : listResult(survey),
    )
    mocks.createSurveyWithStructure.mockResolvedValue(created)
    const { result } = renderHook(() => useSurveyManagement({ permissions: ["surveys.manage"], csvExportEnabled: false }))
    await waitFor(() => expect(result.current.state.loading).toBe(false))
    expect(mocks.createSurveyWithStructure).not.toHaveBeenCalled()

    await act(async () => { await result.current.actions.handleShowGeneratePreview() })

    const payload = mocks.createSurveyWithStructure.mock.calls[0]?.[0] as { is_template: boolean; sections: { questions: { config: Record<string, unknown> }[] }[] }
    expect(payload.is_template).toBe(true)
    expect(payload.sections).toHaveLength(14)
    expect(payload.sections.flatMap((section) => section.questions)).toHaveLength(80)
    expect(payload.sections[0]?.questions[0]?.config.template_definition_version).toBe(GRADUATE_TRACER_STUDY_TEMPLATE_VERSION)
    expect(result.current.state.previewSurvey).toEqual(created)
    expect(mocks.replaceSurveyStructure).not.toHaveBeenCalled()
  })
})

describe("conditional question editor updates", () => {
  beforeEach(() => {
    const currentSurvey = conditionalSurvey()
    mocks.fetchSurveys.mockResolvedValue(listResult(currentSurvey))
    mocks.fetchSurvey.mockResolvedValue(currentSurvey)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  it("adds, renames, and removes branch choices while keeping the flat union synchronized", async () => {
    const currentSurvey = conditionalSurvey()
    mocks.fetchSurveys.mockResolvedValue(listResult(currentSurvey))
    mocks.fetchSurvey.mockResolvedValue(currentSurvey)
    const { result } = renderHook(() => useSurveyManagement({ permissions: ["surveys.manage"], csvExportEnabled: false }))
    await waitFor(() => expect(result.current.state.loading).toBe(false))
    await act(async () => { await result.current.actions.handleOpenEdit(currentSurvey.id) })

    act(() => {
      result.current.actions.updateDependentOption(0, 1, "Accounting", 0, "Audit and reporting")
      result.current.actions.addDependentOption(0, 1, "Technology")
    })
    expect(result.current.state.sections[0]?.questions[1]?.options).toEqual([
      "Audit and reporting",
      "Software",
    ])
    expect(result.current.state.sections[0]?.questions[1]?.config?.options_by_answer).toEqual({
      question_key: "job_industry",
      choices: {
        Accounting: ["Audit and reporting"],
        Technology: ["Software", ""],
      },
    })

    act(() => {
      result.current.actions.updateDependentOption(0, 1, "Technology", 1, "Cloud infrastructure")
    })
    expect(result.current.state.sections[0]?.questions[1]?.options).toEqual([
      "Audit and reporting",
      "Software",
      "Cloud infrastructure",
    ])

    act(() => {
      result.current.actions.removeDependentOption(0, 1, "Technology", 0)
      result.current.actions.removeDependentOption(0, 1, "Technology", 0)
    })
    expect(result.current.state.sections[0]?.questions[1]?.options).toEqual(["Audit and reporting"])
    expect(result.current.state.sections[0]?.questions[1]?.config?.options_by_answer).toEqual({
      question_key: "job_industry",
      choices: { Accounting: ["Audit and reporting"] },
    })
  })

  it("keeps branch keys and visibility conditions aligned when a source option is renamed", async () => {
    const currentSurvey = conditionalSurvey()
    mocks.fetchSurveys.mockResolvedValue(listResult(currentSurvey))
    mocks.fetchSurvey.mockResolvedValue(currentSurvey)
    const { result } = renderHook(() => useSurveyManagement({ permissions: ["surveys.manage"], csvExportEnabled: false }))
    await waitFor(() => expect(result.current.state.loading).toBe(false))
    await act(async () => { await result.current.actions.handleOpenEdit(currentSurvey.id) })

    act(() => {
      result.current.actions.updateOption(0, 0, 0, "Professional Services")
    })

    expect(result.current.state.sections[0]?.questions[0]?.options).toEqual(["Professional Services", "Technology"])
    expect(result.current.state.sections[0]?.questions[1]?.config?.options_by_answer).toEqual({
      question_key: "job_industry",
      choices: { "Professional Services": ["Audit"], Technology: ["Software"] },
    })
    expect(result.current.state.sections[0]?.questions[2]?.config?.visible_when).toEqual({
      question_key: "job_industry",
      equals: "Professional Services",
    })
  })

  it("blocks removing a source option that a visibility condition still references", async () => {
    const currentSurvey = conditionalSurvey()
    mocks.fetchSurveys.mockResolvedValue(listResult(currentSurvey))
    mocks.fetchSurvey.mockResolvedValue(currentSurvey)
    const { result } = renderHook(() => useSurveyManagement({ permissions: ["surveys.manage"], csvExportEnabled: false }))
    await waitFor(() => expect(result.current.state.loading).toBe(false))
    await act(async () => { await result.current.actions.handleOpenEdit(currentSurvey.id) })

    act(() => {
      result.current.actions.removeOption(0, 0, 0)
    })

    expect(result.current.state.sections[0]?.questions[0]?.options).toEqual(["Accounting", "Technology"])

    act(() => {
      result.current.actions.removeOption(0, 0, 1)
    })

    expect(result.current.state.sections[0]?.questions[0]?.options).toEqual(["Accounting"])
    expect(result.current.state.sections[0]?.questions[1]?.options).toEqual(["Audit"])
    expect(result.current.state.sections[0]?.questions[1]?.config?.options_by_answer).toEqual({
      question_key: "job_industry",
      choices: { Accounting: ["Audit"] },
    })
  })
})

describe("useSurveyManagement aggregate loading", () => {
  beforeEach(() => {
    mocks.fetchSurveys.mockResolvedValue(listResult(survey))
    mocks.fetchResponses.mockResolvedValue({
      responses: [response],
      pagination: {
        total: 1,
        count: 1,
        limit: 25,
        offset: 0,
        has_next: false,
        has_prev: false,
      },
    })
    mocks.fetchResponseAggregates.mockResolvedValue([aggregate])
    mocks.eraseResponses.mockResolvedValue({
      scope: "selected",
      requested_count: 1,
      erased_count: 1,
    })
    vi.spyOn(window, "confirm").mockReturnValue(true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  it.each(["Active", "Inactive"] as const)(
    "requests aggregate data when opening a %s survey",
    async (status) => {
      const currentSurvey = { ...survey, status }
      mocks.fetchSurveys.mockResolvedValueOnce(listResult(currentSurvey))

      const { result } = renderHook(() => useSurveyManagement({
        permissions: ["survey_responses.read_aggregates"],
        csvExportEnabled: false,
      }))

      await waitFor(() => expect(result.current.state.surveys).toEqual([currentSurvey]))

      act(() => {
        result.current.actions.handleViewResponses(currentSurvey)
      })

      await waitFor(() => expect(mocks.fetchResponseAggregates).toHaveBeenCalledWith(currentSurvey.id))
    },
  )

  it.each(["Active", "Inactive"] as const)(
    "refreshes aggregate data after erasing a selected response from a %s survey",
    async (status) => {
      const currentSurvey = { ...survey, status }
      mocks.fetchSurveys.mockResolvedValueOnce(listResult(currentSurvey))
      mocks.fetchSurvey.mockResolvedValue(currentSurvey)

      const { result } = renderHook(() => useSurveyManagement({
        permissions: [
          "survey_responses.read_aggregates",
          "survey_responses.read_raw",
          "survey_responses.erase",
        ],
        csvExportEnabled: false,
      }))

      await waitFor(() => expect(result.current.state.surveys).toEqual([currentSurvey]))
      await act(async () => {
        await result.current.actions.handleLoadRawResponses(currentSurvey)
      })
      act(() => {
        result.current.actions.setSelectedResponseIds([response.id])
      })

      await act(async () => {
        await result.current.actions.handleEraseResponses(currentSurvey, "selected")
      })

      await waitFor(() => expect(mocks.fetchResponseAggregates).toHaveBeenCalledWith(currentSurvey.id))
    },
  )
})


describe("survey response history locks", () => {
  it("keeps content locked after erasure and saves only a changed status", async () => {
    const locked = { ...survey, responses: 0, hasResponseHistory: true }
    mocks.fetchSurveys.mockResolvedValue(listResult(locked))
    mocks.fetchSurvey.mockResolvedValue(locked)
    mocks.updateSurvey.mockResolvedValue({ ...locked, status: "Closed" })
    const { result } = renderHook(() => useSurveyManagement({ permissions: ["surveys.manage"], csvExportEnabled: false }))
    await waitFor(() => expect(result.current.state.loading).toBe(false))
    await act(async () => { await result.current.actions.handleOpenEdit(locked.id) })
    expect(result.current.state.structureEditable).toBe(false)
    act(() => { result.current.actions.setSurveyStatus("Closed") })
    await act(async () => { await result.current.actions.handleSaveSurvey() })
    expect(mocks.updateSurvey).toHaveBeenCalledWith(locked.surveyId, { status: "Closed" })
  })
})

describe("survey response refresh guards", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  it("ignores an import refresh when the View Details modal closes mid-request", async () => {
    const currentSurvey = { ...survey, responses: 2 }
    mocks.fetchSurveys.mockReset()
    mocks.fetchSurvey.mockReset()
    mocks.fetchResponseAggregates.mockReset()
    mocks.fetchSurveys.mockResolvedValue(listResult(currentSurvey))
    let resolveRefresh: ((value: Survey) => void) | undefined
    mocks.fetchSurvey
      .mockResolvedValueOnce(currentSurvey)
      .mockImplementationOnce(() => new Promise<Survey>((resolve) => {
        resolveRefresh = resolve
      }))

    const { result } = renderHook(() => useSurveyManagement({
      permissions: ["survey_responses.read_aggregates"],
      csvExportEnabled: false,
    }))
    await waitFor(() => expect(result.current.state.surveys).toEqual([currentSurvey]))
    await act(async () => { await result.current.actions.handleOpenView(currentSurvey.id) })
    expect(result.current.state.modalState).toEqual({ type: "view", id: currentSurvey.id })

    const refreshPromise = result.current.actions.handleRefreshResponseState(currentSurvey)
    await waitFor(() => expect(mocks.fetchSurvey).toHaveBeenCalledTimes(2))
    act(() => { result.current.actions.handleCloseModal() })
    resolveRefresh?.(currentSurvey)
    await act(async () => { await refreshPromise })

    expect(result.current.state.modalState).toBeNull()
    expect(mocks.fetchResponseAggregates).not.toHaveBeenCalled()
  })

  it("does not refresh the previous survey after switching View Details", async () => {
    const first = { ...survey, responses: 2 }
    const second = { ...survey, id: "other-survey-uuid", surveyId: "SURV-002", responses: 1 }
    mocks.fetchSurveys.mockReset()
    mocks.fetchSurvey.mockReset()
    mocks.fetchResponseAggregates.mockReset()
    mocks.fetchSurveys.mockResolvedValue({
      ...listResult(first),
      surveys: [first, second],
      pagination: { ...listResult(first).pagination, total: 2, count: 2 },
    })
    let resolveFirstRefresh: ((value: Survey) => void) | undefined
    mocks.fetchSurvey
      .mockResolvedValueOnce(first)
      .mockImplementationOnce(() => new Promise<Survey>((resolve) => {
        resolveFirstRefresh = resolve
      }))
      .mockResolvedValueOnce(second)

    const { result } = renderHook(() => useSurveyManagement({
      permissions: ["survey_responses.read_aggregates"],
      csvExportEnabled: false,
    }))
    await waitFor(() => expect(result.current.state.surveys).toHaveLength(2))
    await act(async () => { await result.current.actions.handleOpenView(first.id) })
    const refreshPromise = result.current.actions.handleRefreshResponseState(first)
    await waitFor(() => expect(mocks.fetchSurvey).toHaveBeenCalledTimes(2))
    act(() => { result.current.actions.handleCloseModal() })
    await act(async () => { await result.current.actions.handleOpenView(second.id) })
    resolveFirstRefresh?.(first)
    await act(async () => { await refreshPromise })

    expect(result.current.state.modalState).toEqual({ type: "view", id: second.id })
    expect(mocks.fetchResponseAggregates).not.toHaveBeenCalledWith(first.id)
  })
})

it("refreshes an authoritative history lock after a concurrent-response 409", async () => {
  const editable = { ...survey, responses: null, hasResponseHistory: false }
  mocks.fetchSurveys.mockResolvedValue(listResult(editable))
  mocks.fetchSurvey.mockResolvedValueOnce(editable).mockResolvedValue({ ...editable, hasResponseHistory: true })
  mocks.updateSurvey.mockRejectedValueOnce(new ApiError("Survey content is locked", 409, null))
  const { result } = renderHook(() => useSurveyManagement({ permissions: ["surveys.manage"], csvExportEnabled: false }))
  await waitFor(() => expect(result.current.state.loading).toBe(false))
  await act(async () => { await result.current.actions.handleOpenEdit(editable.id) })
  act(() => { result.current.actions.setSurveyTitle("Changed title") })
  await act(async () => { await result.current.actions.handleSaveSurvey() })
  expect(result.current.state.contentLocked).toBe(true)
  expect(result.current.state.surveyTitle).toBe(survey.title)
  expect(result.current.state.editedSurvey?.responses).toBeNull()
  expect(result.current.state.saveError).toBe("Survey content is locked")
})
