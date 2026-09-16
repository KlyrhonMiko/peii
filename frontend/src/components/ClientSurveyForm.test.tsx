import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { PublicSurveyConsent, PublicSurveySection } from "@/lib/public-survey"

import { ClientSurveyForm } from "./ClientSurveyForm"

const consent: PublicSurveyConsent = {
  version: "2026-01",
  notice: "We collect alumni feedback.",
  purpose: "To improve education programs.",
  retention: "Responses are retained for five years.",
  contact: "research@example.test",
}

const sections: PublicSurveySection[] = [
  {
    id: "section-1",
    title: "Your experience",
    description: null,
    order_index: 0,
    questions: [
      {
        id: "question-1",
        question_text: "What did you enjoy?",
        question_type: "text",
        options: null,
        config: null,
        order_index: 0,
        is_required: true,
      },
    ],
  },
]

function renderSurvey(submissionPhase: 1 | 2 = 1, surveySections: PublicSurveySection[] = sections) {
  return render(
    <ClientSurveyForm
      title="Alumni outcomes"
      description="Tell us about your experience."
      consent={consent}
      sections={surveySections}
      submissionPhase={submissionPhase}
      token="visible-token-must-not-render"
    />,
  )
}

function successResponse(status = 201) {
  return new Response(
    JSON.stringify({
      data: { accepted: true },
      message: "Response submitted.",
      errors: null,
      meta: {},
    }),
    { status, headers: { "Content-Type": "application/json" } },
  )
}

describe("ClientSurveyForm", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("requires consent, displays the full privacy notice, and does not display the token", () => {
    renderSurvey()

    expect(screen.getByText(consent.notice)).toBeInTheDocument()
    expect(screen.getByText(consent.purpose)).toBeInTheDocument()
    expect(screen.getByText(consent.retention)).toBeInTheDocument()
    expect(screen.getByText(consent.contact)).toBeInTheDocument()

    const consentControl = screen.getByRole("checkbox", { name: /consent/i })
    expect(consentControl).not.toBeChecked()
    expect(consentControl).toBeRequired()
    expect(screen.getByRole("button", { name: /submit/i })).toBeDisabled()
    expect(screen.queryByText("visible-token-must-not-render")).not.toBeInTheDocument()
    expect(screen.queryByText(/confidential/i)).not.toBeInTheDocument()
  })

  it("submits answers without withdrawal controls or a withdrawal code", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(successResponse())
    renderSurvey()

    fireEvent.change(screen.getByLabelText("What did you enjoy?"), {
      target: { value: "The mentoring program" },
    })
    fireEvent.click(screen.getByRole("checkbox", { name: /consent/i }))
    fireEvent.click(screen.getByRole("button", { name: /submit/i }))

    await waitFor(() => expect(screen.getByText("Phase 1 submitted")).toBeInTheDocument())
    const request = fetchMock.mock.calls[0]
    expect(request).toBeDefined()
    expect(request?.[1]).toMatchObject({
      method: "POST",
      headers: expect.objectContaining({ "Idempotency-Key": expect.any(String) }),
    })
    const body = JSON.parse((request?.[1] as RequestInit).body as string) as Record<string, unknown>
    expect(body).toEqual({
      answers: { "question-1": "The mentoring program" },
      consent: { accepted: true, version: consent.version },
    })
    expect(screen.getByRole("heading", { name: "Phase 1 submitted" })).toBeInTheDocument()
    expect(screen.queryByLabelText("Private withdrawal code")).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: /withdraw a response/i })).not.toBeInTheDocument()
    expect(screen.queryByText("visible-token-must-not-render")).not.toBeInTheDocument()
    expect(screen.queryByText(/receipt|internal id|response id/i)).not.toBeInTheDocument()
  })

  it("preserves one idempotency key across retryable failures", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(successResponse())
    renderSurvey()
    fireEvent.change(screen.getByLabelText("What did you enjoy?"), {
      target: { value: "The mentoring program" },
    })
    fireEvent.click(screen.getByRole("checkbox", { name: /consent/i }))

    fireEvent.click(screen.getByRole("button", { name: /submit/i }))
    expect(await screen.findByRole("alert")).toHaveTextContent(/try again/i)
    fireEvent.click(screen.getByRole("button", { name: /submit/i }))
    await waitFor(() => expect(screen.getByText("Phase 1 submitted")).toBeInTheDocument())

    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: expect.objectContaining({ "Idempotency-Key": expect.any(String) }),
    })
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      headers: expect.objectContaining({
        "Idempotency-Key": (fetchMock.mock.calls[0]?.[1] as RequestInit).headers &&
          ((fetchMock.mock.calls[0]?.[1] as RequestInit).headers as Record<string, string>)["Idempotency-Key"],
      }),
    })
    const firstBody = JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string) as Record<string, string>
    const secondBody = JSON.parse((fetchMock.mock.calls[1]?.[1] as RequestInit).body as string) as Record<string, string>
    expect(secondBody).toEqual(firstBody)
  })

  it("shows and respects Retry-After for rate limits", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message: "slow down" }), {
        status: 429,
        headers: { "Retry-After": "30", "Content-Type": "application/json" },
      }),
    )
    renderSurvey()
    fireEvent.change(screen.getByLabelText("What did you enjoy?"), {
      target: { value: "The mentoring program" },
    })
    fireEvent.click(screen.getByRole("checkbox", { name: /consent/i }))
    fireEvent.click(screen.getByRole("button", { name: /submit/i }))

    expect(await screen.findByRole("alert")).toHaveTextContent(/30 seconds/i)
    expect(screen.getByRole("button", { name: /submit/i })).toBeDisabled()
  })

  it("stops after stale consent and instructs the respondent to reload and review", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: null,
          message: "consent is stale",
          errors: { code: "stale_consent" },
          meta: {},
        }),
        { status: 409 },
      ),
    )
    renderSurvey()
    fireEvent.change(screen.getByLabelText("What did you enjoy?"), {
      target: { value: "The mentoring program" },
    })
    fireEvent.click(screen.getByRole("checkbox", { name: /consent/i }))
    fireEvent.click(screen.getByRole("button", { name: /submit/i }))

    expect(await screen.findByRole("alert")).toHaveTextContent(/reload and review/i)
    expect(screen.getByRole("button", { name: /submit/i })).toBeDisabled()
    expect(screen.queryByText("visible-token-must-not-render")).not.toBeInTheDocument()
  })

  it("preserves the idempotency key and warns against duplicate submission on conflict", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: null,
          message: "already submitted",
          errors: { code: "idempotency_conflict" },
          meta: {},
        }),
        { status: 409 },
      ),
    )
    renderSurvey()
    fireEvent.change(screen.getByLabelText("What did you enjoy?"), {
      target: { value: "The mentoring program" },
    })
    fireEvent.click(screen.getByRole("checkbox", { name: /consent/i }))
    fireEvent.click(screen.getByRole("button", { name: /submit/i }))

    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent(/already|duplicate|do not submit/i)
    expect(screen.getByRole("button", { name: /submit/i })).not.toBeDisabled()

    const firstKey = (fetchMock.mock.calls[0]?.[1] as RequestInit).headers as Record<string, string>
    fireEvent.click(screen.getByRole("button", { name: /submit/i }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    const secondKey = (fetchMock.mock.calls[1]?.[1] as RequestInit).headers as Record<string, string>
    expect(secondKey["Idempotency-Key"]).toBe(firstKey["Idempotency-Key"])
    expect(screen.queryByText(/out of date|reload and review/i)).not.toBeInTheDocument()
  })

  it("shows a useful message when the response was already submitted", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: null,
          message: "already submitted",
          errors: { code: "already_submitted" },
          meta: {},
        }),
        { status: 409 },
      ),
    )
    renderSurvey()
    fireEvent.change(screen.getByLabelText("What did you enjoy?"), {
      target: { value: "The mentoring program" },
    })
    fireEvent.click(screen.getByRole("checkbox", { name: /consent/i }))
    fireEvent.click(screen.getByRole("button", { name: /submit/i }))

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /already recorded.*reload to continue with phase 2/i,
    )
  })

  it("marks touched invalid controls and describes their validation errors", async () => {
    renderSurvey()
    fireEvent.click(screen.getByRole("checkbox", { name: /consent/i }))
    fireEvent.click(screen.getByRole("button", { name: /submit/i }))

    const answer = screen.getByLabelText("What did you enjoy?")
    await waitFor(() => expect(answer).toHaveAttribute("aria-invalid", "true"))
    expect(answer).toHaveAttribute("aria-describedby", "question-1-error")
    expect(screen.getByText("This question is required")).toBeInTheDocument()
  })

  it("submits phase two answers with PATCH and does not create a withdrawal code", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(successResponse())
    renderSurvey(2)

    fireEvent.change(screen.getByLabelText("What did you enjoy?"), {
      target: { value: "The mentoring program" },
    })
    expect(screen.getByRole("button", { name: /submit/i })).toBeEnabled()
    fireEvent.click(screen.getByRole("button", { name: /submit/i }))

    await waitFor(() => expect(screen.getByRole("heading", { name: "Response Submitted" })).toBeInTheDocument())
    const request = fetchMock.mock.calls[0]
    expect(request).toBeDefined()
    expect(request?.[1]).toMatchObject({
      method: "PATCH",
      headers: expect.objectContaining({ "Idempotency-Key": expect.any(String) }),
    })
    const body = JSON.parse((request?.[1] as RequestInit).body as string) as Record<string, unknown>
    expect(body).toEqual({ answers: { "question-1": "The mentoring program" } })
    expect(screen.queryByLabelText("Private withdrawal code")).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: /withdraw a response/i })).not.toBeInTheDocument()
  })

  it("shows the barangay question only for Pasig residents and drops it when location changes", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(successResponse())
    const conditionalSections: PublicSurveySection[] = [{
      id: "profile",
      title: "Profile",
      description: null,
      order_index: 0,
      questions: [
        {
          id: "location", question_text: "Current Location:", question_type: "single_choice",
          options: ["Pasig City", "Outside NCR"], config: { question_key: "current_location" },
          order_index: 0, is_required: true,
        },
        {
          id: "barangay", question_text: "Which barangay?", question_type: "single_choice",
          options: ["Maybunga", "Ugong"],
          config: { visible_when: { question_key: "current_location", equals: "Pasig City" } },
          order_index: 1, is_required: true,
        },
      ],
    }]
    renderSurvey(2, conditionalSections)
    expect(screen.queryByRole("button", { name: "Which barangay?" })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Current Location:" }))
    fireEvent.click(screen.getByRole("button", { name: "Pasig City" }))
    expect(screen.getByRole("button", { name: "Which barangay?" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Which barangay?" }))
    fireEvent.click(screen.getByRole("button", { name: "Maybunga" }))
    fireEvent.click(screen.getByRole("button", { name: "Current Location:" }))
    fireEvent.click(screen.getByRole("button", { name: "Outside NCR" }))
    expect(screen.queryByRole("button", { name: "Which barangay?" })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /submit/i }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const body = JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string) as { answers: Record<string, unknown> }
    expect(body.answers).toEqual({ location: "Outside NCR" })
  })

  it("lets respondents search the unified job-title choices", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(successResponse())
    const roleSections: PublicSurveySection[] = [{
      id: "employment",
      title: "Employment",
      description: null,
      order_index: 0,
      questions: [{
        id: "role", question_text: "Which role or job title best describes your work?",
        question_type: "single_choice", options: ["Account Executive", "Nurse", "Software Developer"],
        config: { question_key: "job_role", presentation: "searchable_dropdown" },
        order_index: 0, is_required: true,
      }],
    }]
    renderSurvey(2, roleSections)
    fireEvent.click(screen.getByRole("button", { name: "Which role or job title best describes your work?" }))
    fireEvent.change(screen.getByRole("searchbox", { name: /search which role/i }), { target: { value: "nurs" } })
    expect(screen.getByRole("button", { name: "Nurse" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Account Executive" })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Nurse" }))
    fireEvent.click(screen.getByRole("button", { name: /submit/i }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const body = JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string) as { answers: Record<string, unknown> }
    expect(body.answers).toEqual({ role: "Nurse" })
  })
})


it("disables Next for No consent and enables it again for Yes", async () => {
  const questionText = "Consent Statement: I have read and understood the Data Privacy Statement and voluntarily agree to participate in this survey."
  const consentSection: PublicSurveySection = {
    id: "intro", title: "Intro", description: null, order_index: 0,
    questions: [{ id: "participation", question_text: questionText,
      question_type: "single_choice", options: ["Yes", "No"], config: null,
      order_index: 0, is_required: true }],
  }
  render(<ClientSurveyForm title="Survey" description={null} consent={consent}
    sections={[consentSection, ...sections]} submissionPhase={1} token="test" />)
  fireEvent.click(screen.getByRole("checkbox", { name: /consent to this data notice/i }))
  fireEvent.click(screen.getByRole("button", { name: questionText }))
  fireEvent.click(await screen.findByRole("button", { name: "No" }))
  const next = screen.getByRole("button", { name: "Next" })
  expect(next).toBeDisabled()
  fireEvent.click(next)
  expect(screen.getByRole("heading", { name: "Intro" })).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: questionText }))
  fireEvent.click(await screen.findByRole("button", { name: "Yes" }))
  expect(next).toBeEnabled()
})
