import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import SurveyPage, { metadata } from "./page"

describe("SurveyPage", () => {
  it("declares the tokenized survey route as noindex and nofollow", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false })
  })

  it("renders a rate-limit retry state with numeric Retry-After without exposing the token", async () => {
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
      `/survey/${encodeURIComponent(token)}`,
      { cache: "no-store" },
    )
  })

  it("distinguishes temporary unavailability from an unavailable survey", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(null, { status: 503, headers: { "Retry-After": "10" } }),
    ))

    render(await SurveyPage({ params: Promise.resolve({ alumniToken: "another-token" }) }))

    expect(screen.getByRole("alert")).toHaveTextContent(/temporarily unavailable/i)
    expect(screen.getByRole("alert")).toHaveTextContent(/try again in 10 seconds/i)
  })

  it("keeps ordinary non-retry responses unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })))

    render(await SurveyPage({ params: Promise.resolve({ alumniToken: "missing-token" }) }))

    expect(screen.getByRole("alert")).toHaveTextContent(/this survey is unavailable/i)
    expect(screen.getByRole("alert")).not.toHaveTextContent(/try again/i)
  })

  it("renders a successful survey response when question options and config are explicitly null", async () => {
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
