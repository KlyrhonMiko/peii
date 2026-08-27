import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { useState } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { Distribution, DistributionSecret } from "@/lib/surveys"

const mocks = vi.hoisted(() => ({
  createDistribution: vi.fn(),
  fetchDistributions: vi.fn(),
  revokeDistribution: vi.fn(),
  rotateDistribution: vi.fn(),
}))

vi.mock("@/lib/surveys", () => ({
  createDistribution: mocks.createDistribution,
  fetchDistributions: mocks.fetchDistributions,
  revokeDistribution: mocks.revokeDistribution,
  rotateDistribution: mocks.rotateDistribution,
}))

import { SurveyDistributionManager } from "./SurveyDistributionManager"

const surveyId = "survey-id"

function distribution(overrides: Partial<Distribution> = {}): Distribution {
  return {
    id: "distribution-id",
    surveyId,
    status: "active",
    isActive: true,
    expiresAt: "2030-01-02T03:04:05.000Z",
    revokedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  }
}

function secret(overrides: Partial<DistributionSecret> = {}): DistributionSecret {
  return {
    ...distribution(),
    token: "one-time-token",
    ...overrides,
  }
}

function renderManager(canManage = true) {
  return render(
    <SurveyDistributionManager
      surveyId={surveyId}
      open
      canManage={canManage}
      onOpenChange={vi.fn()}
    />,
  )
}

async function waitForLoaded() {
  await waitFor(() => expect(mocks.fetchDistributions).toHaveBeenCalledWith(surveyId))
  await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument())
}

describe("SurveyDistributionManager", () => {
  beforeEach(() => {
    mocks.createDistribution.mockReset()
    mocks.fetchDistributions.mockReset()
    mocks.revokeDistribution.mockReset()
    mocks.rotateDistribution.mockReset()
    mocks.fetchDistributions.mockResolvedValue([])
    mocks.revokeDistribution.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("loads token-free metadata and renders every lifecycle state", async () => {
    mocks.fetchDistributions.mockResolvedValue([
      distribution({ id: "active", status: "active" }),
      distribution({ id: "suspended", status: "suspended", isActive: false }),
      distribution({ id: "expired", status: "expired", isActive: false }),
      distribution({ id: "revoked", status: "revoked", isActive: false }),
    ])

    renderManager(false)
    await waitForLoaded()

    expect(mocks.fetchDistributions).toHaveBeenCalledTimes(1)
    expect(mocks.createDistribution).not.toHaveBeenCalled()
    expect(screen.getByText("Active")).toBeInTheDocument()
    expect(screen.getByText("Suspended")).toBeInTheDocument()
    expect(screen.getByText("Expired")).toBeInTheDocument()
    expect(screen.getByText("Revoked")).toBeInTheDocument()
    expect(screen.getByText("This link can accept responses until it expires.")).toBeInTheDocument()
    expect(screen.getByText("This link is suspended and cannot accept responses until it is restored by the backend.")).toBeInTheDocument()
    expect(screen.getByText("This link has expired. Issue a new link with a new expiry date.")).toBeInTheDocument()
    expect(screen.getByText("This link was revoked and cannot accept responses. Issue a new link to continue.")).toBeInTheDocument()
    expect(screen.queryByText(/one-time-token|\/survey\//)).not.toBeInTheDocument()
  })

  it("uses the server-owned 30-day default and displays its one-time secret", async () => {
    const created = secret({ token: "created-token" })
    mocks.createDistribution.mockResolvedValue(created)
    renderManager()
    await waitForLoaded()

    fireEvent.click(screen.getByRole("button", { name: "Enable Link" }))

    await waitFor(() => expect(mocks.createDistribution).toHaveBeenCalledWith(surveyId, null))
    expect(screen.getByText(`${window.location.origin}/survey/created-token`)).toBeInTheDocument()
  })

  it("keeps the replacement secret when the metadata reload omits the token", async () => {
    const current = distribution()
    const replacement = secret({ id: "replacement-id", token: "replacement-token" })
    const replacementMetadata = distribution({ id: "replacement-id" })
    mocks.fetchDistributions
      .mockResolvedValueOnce([current])
      .mockResolvedValueOnce([replacementMetadata])
    mocks.rotateDistribution.mockResolvedValue(replacement)

    renderManager()
    await waitForLoaded()
    fireEvent.click(screen.getByRole("button", { name: "Generate new link" }))

    await waitFor(() => expect(mocks.rotateDistribution).toHaveBeenCalledWith(surveyId, current.id, null))
    expect(screen.getByText(`${window.location.origin}/survey/replacement-token`)).toBeInTheDocument()
    expect(mocks.fetchDistributions).toHaveBeenCalledTimes(2)
  })

  it("revokes an active link and reloads its lifecycle state", async () => {
    mocks.fetchDistributions
      .mockResolvedValueOnce([distribution()])
      .mockResolvedValueOnce([distribution({ status: "revoked", isActive: false, revokedAt: "2026-02-01T00:00:00Z" })])

    renderManager()
    await waitForLoaded()
    fireEvent.click(screen.getByRole("button", { name: "Revoke" }))

    await waitFor(() => expect(mocks.revokeDistribution).toHaveBeenCalledWith(surveyId, "distribution-id"))
    expect(await screen.findByText("Revoked")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Revoke" })).not.toBeInTheDocument()
  })

  it("does not offer the unsupported 90-day expiry", async () => {
    renderManager()
    await waitForLoaded()

    fireEvent.click(screen.getByRole("button", { name: "30 days (Default)" }))
    expect(screen.queryByText("90 days")).not.toBeInTheDocument()
  })

  it("clears a one-time secret when the manager is closed", async () => {
    mocks.createDistribution.mockResolvedValue(secret({ token: "close-token" }))

    function ControlledManager() {
      const [open, setOpen] = useState(true)
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Reopen manager</button>
          <SurveyDistributionManager
            surveyId={surveyId}
            open={open}
            canManage
            onOpenChange={setOpen}
          />
        </>
      )
    }

    render(<ControlledManager />)
    await waitForLoaded()
    fireEvent.click(screen.getByRole("button", { name: "Enable Link" }))
    expect(await screen.findByText(`${window.location.origin}/survey/close-token`)).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Close" }))
    fireEvent.click(screen.getByRole("button", { name: "Reopen manager" }))

    expect(screen.queryByText(`${window.location.origin}/survey/close-token`)).not.toBeInTheDocument()
  })

  it("shows load errors", async () => {
    mocks.fetchDistributions.mockRejectedValue(new Error("load failed"))

    renderManager()

    expect(await screen.findByRole("alert")).toHaveTextContent("load failed")
  })

  it("shows create errors", async () => {
    mocks.createDistribution.mockRejectedValue(new Error("create failed"))
    renderManager()
    await waitForLoaded()

    fireEvent.click(screen.getByRole("button", { name: "Enable Link" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("create failed")
  })

  it("shows rotate errors", async () => {
    mocks.fetchDistributions.mockResolvedValue([distribution()])
    mocks.rotateDistribution.mockRejectedValue(new Error("rotate failed"))
    renderManager()
    await waitForLoaded()

    fireEvent.click(screen.getByRole("button", { name: "Generate new link" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("rotate failed")
  })

  it("shows revoke errors", async () => {
    mocks.fetchDistributions.mockResolvedValue([distribution()])
    mocks.revokeDistribution.mockRejectedValue(new Error("revoke failed"))
    renderManager()
    await waitForLoaded()

    fireEvent.click(screen.getByRole("button", { name: "Revoke" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("revoke failed")
  })

  it("copies an issued link and reports clipboard failures", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    })
    mocks.createDistribution.mockResolvedValue(secret({ token: "copy-token" }))
    renderManager()
    await waitForLoaded()
    fireEvent.click(screen.getByRole("button", { name: "Enable Link" }))
    const copyButton = await screen.findByRole("button", { name: "Copy" })

    fireEvent.click(copyButton)
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument()
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/survey/copy-token`)

    writeText.mockRejectedValueOnce(new Error("clipboard denied"))
    fireEvent.click(screen.getByRole("button", { name: "Copied" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Clipboard error: clipboard denied")
  })
})
