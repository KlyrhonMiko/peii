import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SurveyGoogleLoginButton } from "./SurveyGoogleLoginButton"

describe("SurveyGoogleLoginButton", () => {
  const providerUrl = "https://project.supabase.co/auth/v1/authorize?provider=google"
  const assignMock = vi.fn()
  const fetchMock = vi.fn<typeof fetch>()
  let originalLocation: Location

  beforeEach(() => {
    originalLocation = window.location
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { assign: assignMock, origin: "http://localhost:3000" },
    })
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    })
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it("posts same-origin form data, validates the provider URL, and navigates to it", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ url: providerUrl }), { status: 200 }))
    render(<SurveyGoogleLoginButton returnTo="/survey/secret-survey-token" />)

    fireEvent.click(screen.getByRole("button", { name: /continue with google/i }))

    expect(fetchMock).toHaveBeenCalledWith(
      "/auth/survey/google/start",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "returnTo=%2Fsurvey%2Fsecret-survey-token",
      }),
    )
    await waitFor(() => expect(assignMock).toHaveBeenCalledWith(providerUrl))
    expect(assignMock).not.toHaveBeenCalledWith(expect.stringContaining("secret-survey-token"))
  })

  it("guards double clicks while pending and exposes an accessible pending state", async () => {
    let resolveRequest: (response: Response) => void = () => undefined
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => {
      resolveRequest = resolve
    }))
    render(<SurveyGoogleLoginButton returnTo="/survey/secret-survey-token" />)
    const button = screen.getByRole("button", { name: /continue with google/i })

    fireEvent.click(button)
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute("aria-busy", "true")
    expect(screen.getByRole("status")).toHaveTextContent(/starting google sign-in/i)

    fireEvent.click(button)
    expect(fetchMock).toHaveBeenCalledOnce()

    resolveRequest(new Response(JSON.stringify({ url: providerUrl }), { status: 200 }))
    await waitFor(() => expect(assignMock).toHaveBeenCalledWith(providerUrl))
  })

  it.each([
    new Response(JSON.stringify({ url: "not-a-provider-url" }), { status: 200 }),
    new Response(JSON.stringify({ url: `${providerUrl}&token=secret-survey-token` }), { status: 200 }),
    new Response("upstream failure", { status: 502 }),
  ])("uses a generic error navigation for an unsafe or failed start response", async (response) => {
    fetchMock.mockResolvedValueOnce(response)
    render(<SurveyGoogleLoginButton returnTo="/survey/secret-survey-token" />)

    fireEvent.click(screen.getByRole("button", { name: /continue with google/i }))

    await waitFor(() => expect(assignMock).toHaveBeenCalledWith("http://localhost:3000/survey/auth-error"))
    expect(screen.getByRole("alert")).toHaveTextContent(/could not start google sign-in/i)
    expect(screen.getByRole("alert")).not.toHaveTextContent("secret-survey-token")
    expect(screen.getByRole("alert")).not.toHaveTextContent("upstream failure")
  })
})
