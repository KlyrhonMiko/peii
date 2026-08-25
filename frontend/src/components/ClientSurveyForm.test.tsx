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

function renderSurvey() {
  return render(
    <ClientSurveyForm
      title="Alumni outcomes"
      description="Tell us about your experience."
      consent={consent}
      sections={sections}
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

  it("submits accepted consent and answers, then shows only a generic success", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(successResponse())
    renderSurvey()

    fireEvent.change(screen.getByLabelText("What did you enjoy?"), {
      target: { value: "The mentoring program" },
    })
    fireEvent.click(screen.getByRole("checkbox", { name: /consent/i }))
    fireEvent.click(screen.getByRole("button", { name: /submit/i }))

    await waitFor(() => expect(screen.getByText("Response Submitted")).toBeInTheDocument())
    const request = fetchMock.mock.calls[0]
    expect(request).toBeDefined()
    expect(request?.[1]).toMatchObject({
      method: "POST",
      headers: expect.objectContaining({ "Idempotency-Key": expect.any(String) }),
      body: JSON.stringify({
        answers: { "question-1": "The mentoring program" },
        consent: { accepted: true, version: consent.version },
      }),
    })
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
    await waitFor(() => expect(screen.getByText("Response Submitted")).toBeInTheDocument())

    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: expect.objectContaining({ "Idempotency-Key": expect.any(String) }),
    })
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      headers: expect.objectContaining({
        "Idempotency-Key": (fetchMock.mock.calls[0]?.[1] as RequestInit).headers &&
          ((fetchMock.mock.calls[0]?.[1] as RequestInit).headers as Record<string, string>)["Idempotency-Key"],
      }),
    })
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

  it("marks touched invalid controls and describes their validation errors", async () => {
    renderSurvey()
    fireEvent.click(screen.getByRole("checkbox", { name: /consent/i }))
    fireEvent.click(screen.getByRole("button", { name: /submit/i }))

    const answer = screen.getByLabelText("What did you enjoy?")
    await waitFor(() => expect(answer).toHaveAttribute("aria-invalid", "true"))
    expect(answer).toHaveAttribute("aria-describedby", "question-1-error")
    expect(screen.getByText("This question is required")).toBeInTheDocument()
  })
})
