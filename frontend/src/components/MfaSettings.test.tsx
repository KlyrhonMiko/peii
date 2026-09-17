import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  enrollTotpAction: vi.fn(),
  refresh: vi.fn(),
  unenrollTotpAction: vi.fn(),
  useRouter: vi.fn(),
  verifyTotpEnrollmentAction: vi.fn(),
}))

vi.mock("next/navigation", () => ({ useRouter: mocks.useRouter }))
vi.mock("@/app/mfa/actions", () => ({
  enrollTotpAction: mocks.enrollTotpAction,
  unenrollTotpAction: mocks.unenrollTotpAction,
  verifyTotpEnrollmentAction: mocks.verifyTotpEnrollmentAction,
}))

import { MfaSettings } from "./MfaSettings"

describe("MfaSettings", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    mocks.useRouter.mockReturnValue({ refresh: mocks.refresh })
  })

  it("shows verified factor status and offers a backup factor without exposing setup secrets", () => {
    render(<MfaSettings factors={[{
      id: "11111111-1111-4111-8111-111111111111",
      friendlyName: "Laptop authenticator",
      createdAt: "2026-09-17T00:00:00Z",
      updatedAt: "2026-09-17T00:00:00Z",
    }]} />)

    expect(screen.getByText("Laptop authenticator")).toBeInTheDocument()
    expect(screen.getByText("Verified Sep 17, 2026")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Add backup authenticator" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument()
    expect(screen.queryByText("setup-secret")).not.toBeInTheDocument()
    expect(screen.getByText(/does not display recovery codes/i)).toBeInTheDocument()
  })

  it("explains first-factor setup when no factors are verified", () => {
    render(<MfaSettings factors={[]} />)

    expect(screen.getByText("No authenticator app is enrolled yet.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Set up authenticator" })).toBeInTheDocument()
  })

  it("lets the user cancel an unfinished setup", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true)
    mocks.enrollTotpAction.mockImplementation(async (_state: unknown, formData: FormData) =>
      formData.get("intent") === "cancel"
        ? { status: "idle", message: "" }
        : {
            status: "success",
            message: "Scan the QR code, then verify.",
            enrollment: {
              factorId: "11111111-1111-4111-8111-111111111111",
              friendlyName: "PEII Authenticator",
              qrCode: "data:image/svg+xml;utf-8,%3Csvg%3E%3C/svg%3E",
              secret: "setup-secret",
            },
          },
    )

    render(<MfaSettings factors={[]} />)
    fireEvent.click(screen.getByRole("button", { name: "Set up authenticator" }))
    expect(await screen.findByRole("button", { name: "Cancel setup" })).toBeInTheDocument()
    expect(screen.getByText("setup-secret")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Cancel setup" }))
    await waitFor(() => expect(mocks.enrollTotpAction).toHaveBeenCalledTimes(2))
    expect((mocks.enrollTotpAction.mock.calls[1]?.[1] as FormData).get("intent")).toBe("cancel")
    await waitFor(() => expect(screen.queryByText("setup-secret")).not.toBeInTheDocument())
    await waitFor(() => expect(screen.getByRole("button", { name: "Set up authenticator" })).toBeInTheDocument())
  })
})
