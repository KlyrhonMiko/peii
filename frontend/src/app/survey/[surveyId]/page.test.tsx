import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  createSurveySupabaseServerClient: vi.fn(),
  getClaims: vi.fn(),
  getSession: vi.fn(),
}))

vi.mock("@/lib/supabase/survey-server", () => ({
  createSurveySupabaseServerClient: mocks.createSurveySupabaseServerClient,
}))

import SurveyPage, { metadata } from "./page"

describe("SurveyPage", () => {
  const authenticateSurvey = () => {
    mocks.getClaims.mockResolvedValue({ data: { claims: { sub: "google-user" } } })
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: "survey-access-token" } } })
  }

  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    vi.stubEnv("APP_ORIGIN", "http://localhost:3000")
    vi.stubEnv("BACKEND_INTERNAL_URL", "http://backend:8000/api/v1")
    mocks.getClaims.mockResolvedValue({ data: { claims: null } })
    mocks.getSession.mockResolvedValue({ data: { session: null } })
    mocks.createSurveySupabaseServerClient.mockResolvedValue({
      auth: { getClaims: mocks.getClaims, getSession: mocks.getSession },
    })
  })

  it("declares the tokenized survey route as noindex and nofollow", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false })
  })

  it("shows an identity/privacy interstitial without fetching survey content before Google authentication", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    const { container } = render(
      await SurveyPage({ params: Promise.resolve({ alumniToken: "secret-survey-token" }) }),
    )

    expect(screen.getByRole("heading", { name: /continue with google/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /continue with google/i })).toBeInTheDocument()
    expect(screen.getByText(/verified email and display name will be stored/i)).toBeInTheDocument()
    expect(screen.getByText(/authorized researchers can identify you/i)).toBeInTheDocument()
    expect(screen.getByText(/one response per Google account/i)).toBeInTheDocument()
    expect(screen.getByText(/pseudonymous deduplication value/i)).toBeInTheDocument()
    expect(screen.getByText(/administrative erasure clears that value/i)).toBeInTheDocument()
    expect(screen.getByText(/does not promise anonymity or confidentiality/i)).toBeInTheDocument()
    expect(screen.queryByRole("form")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: /continue with google/i })).toHaveAttribute("type", "button")
    expect(container).not.toHaveTextContent("secret-survey-token")
    expect(fetchMock).not.toHaveBeenCalled()
    expect(container).not.toHaveTextContent("Alumni Survey")
  })

  it("loads survey content server-to-server only after the isolated survey session is verified", async () => {
    mocks.getClaims.mockResolvedValue({ data: { claims: { sub: "google-user" } } })
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: "survey-access-token" } } })
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        data: {
          survey_id: "survey-1",
          title: "Alumni Survey",
          description: null,
          questions: [{
            id: "question-1",
            question_text: "What did you enjoy?",
            question_type: "text",
            options: null,
            config: null,
            order_index: 0,
            is_required: false,
          }],
          sections: [{
            id: "section-1",
            title: "Feedback",
            description: null,
            order_index: 0,
            questions: [{
              id: "question-1",
              question_text: "What did you enjoy?",
              question_type: "text",
              options: null,
              config: null,
              order_index: 0,
              is_required: false,
            }],
          }],
          consent: {
            version: "1",
            notice: "Notice",
            purpose: "Purpose",
            retention: "Retention",
            contact: "Contact",
          },
          collection_state: "phase1",
          submission_phase: 1,
        },
        message: "Survey loaded",
        errors: null,
        meta: {},
      }), { status: 200, headers: { "Content-Type": "application/json" } }),
    )
    vi.stubGlobal("fetch", fetchMock)

    render(await SurveyPage({ params: Promise.resolve({ alumniToken: "valid-token" }) }))

    expect(screen.getByRole("heading", { name: "Alumni Survey" })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      "http://backend:8000/api/v1/survey/valid-token",
      expect.objectContaining({
        cache: "no-store",
        headers: { Authorization: "Bearer survey-access-token" },
      }),
    )
  })

  it.each([
    ["completed", "Survey complete", "already been recorded"],
    ["withdrawn", "Response withdrawn", "withdrawn"],
  ] as const)("does not render a form for a %s survey", async (state, heading, message) => {
    authenticateSurvey()
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        data: {
          survey_id: "survey-1",
          title: "Alumni Survey",
          description: null,
          questions: [],
          sections: [],
          consent: {
            version: "1",
            notice: "Notice",
            purpose: "Purpose",
            retention: "Retention",
            contact: "Contact",
          },
          collection_state: state,
          submission_phase: null,
        },
        message: "Survey loaded",
        errors: null,
        meta: {},
      }), { status: 200 }),
    ))

    render(await SurveyPage({ params: Promise.resolve({ alumniToken: "valid-token" }) }))

    expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument()
    expect(screen.getByRole("status")).toHaveTextContent(message)
    expect(screen.queryByRole("form")).not.toBeInTheDocument()
  })

  it("renders a rate-limit retry state with numeric Retry-After without exposing the token", async () => {
    authenticateSurvey()
    const token = "secret-survey-token"
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, { status: 429, headers: { "Retry-After": "45" } }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const { container } = render(
      await SurveyPage({ params: Promise.resolve({ alumniToken: token }) }),
    )

    expect(screen.getByRole("alert")).toHaveTextContent(/too many requests/i)
    expect(screen.getByRole("alert")).toHaveTextContent(/try again in 45 seconds/i)
    expect(container).not.toHaveTextContent(token)
    expect(fetchMock).toHaveBeenCalledWith(
      `http://backend:8000/api/v1/survey/${encodeURIComponent(token)}`,
      expect.objectContaining({ cache: "no-store" }),
    )
  })

  it("distinguishes temporary unavailability from an unavailable survey", async () => {
    authenticateSurvey()
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(null, { status: 503, headers: { "Retry-After": "10" } }),
    ))

    render(await SurveyPage({ params: Promise.resolve({ alumniToken: "another-token" }) }))

    expect(screen.getByRole("alert")).toHaveTextContent(/temporarily unavailable/i)
    expect(screen.getByRole("alert")).toHaveTextContent(/try again in 10 seconds/i)
  })

  it("keeps ordinary non-retry responses unavailable", async () => {
    authenticateSurvey()
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })))

    render(await SurveyPage({ params: Promise.resolve({ alumniToken: "missing-token" }) }))

    expect(screen.getByRole("alert")).toHaveTextContent(/this survey is unavailable/i)
    expect(screen.getByRole("alert")).not.toHaveTextContent(/try again/i)
  })

  it("renders a successful survey response when question options and config are explicitly null", async () => {
    authenticateSurvey()
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        data: {
          survey_id: "survey-1",
          title: "Alumni Survey",
          description: null,
          questions: [{
            id: "question-1",
            question_text: "What did you enjoy?",
            question_type: "text",
            options: null,
            config: null,
            order_index: 0,
            is_required: false,
          }],
          sections: [{
            id: "section-1",
            title: "Feedback",
            description: null,
            order_index: 0,
            questions: [{
              id: "question-1",
              question_text: "What did you enjoy?",
              question_type: "text",
              options: null,
              config: null,
              order_index: 0,
              is_required: false,
            }],
          }],
          consent: {
            version: "1",
            notice: "Notice",
            purpose: "Purpose",
            retention: "Retention",
            contact: "Contact",
          },
          collection_state: "phase1",
          submission_phase: 1,
        },
        message: "Survey loaded",
        errors: null,
        meta: {},
      }), { status: 200, headers: { "Content-Type": "application/json" } }),
    ))

    render(await SurveyPage({ params: Promise.resolve({ alumniToken: "valid-token" }) }))

    expect(screen.getByRole("heading", { name: "Alumni Survey" })).toBeInTheDocument()
    expect(screen.getByText("What did you enjoy?")).toBeInTheDocument()
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })
})
