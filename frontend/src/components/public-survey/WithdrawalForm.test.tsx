import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { WithdrawalForm } from "./WithdrawalForm"

function response(status: number, data: unknown) {
  return new Response(JSON.stringify({ data, message: "message", errors: null, meta: {} }), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

describe("WithdrawalForm", () => {
  beforeEach(() => vi.restoreAllMocks())

  it.each([
    [404, /could not find a response/i],
    [422, /valid withdrawal code/i],
  ])("handles a generic %s response safely", async (status, message) => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(response(status, null))
    render(<WithdrawalForm />)

    fireEvent.change(screen.getByLabelText(/private withdrawal code/i), {
      target: { value: "private-code" },
    })
    fireEvent.click(screen.getByRole("button", { name: /withdraw response/i }))

    expect(await screen.findByRole("alert")).toHaveTextContent(message)
    expect(fetchMock).toHaveBeenCalledWith(
      "/survey/responses/withdraw",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ withdrawal_code: "private-code" }),
      }),
    )
    expect(fetchMock.mock.calls[0]?.[0]).not.toContain("private-code")
    expect(screen.queryByText("private-code")).not.toBeInTheDocument()
  })

  it("shows an idempotent success response without echoing the code", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(200, { withdrawn: true }),
    )
    render(<WithdrawalForm />)
    fireEvent.change(screen.getByLabelText(/private withdrawal code/i), {
      target: { value: "private-code" },
    })
    fireEvent.click(screen.getByRole("button", { name: /withdraw response/i }))

    await waitFor(() => expect(screen.getByRole("heading", { name: /response withdrawn/i })).toBeInTheDocument())
    expect(screen.getByRole("status")).toHaveTextContent(/safe to repeat/i)
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/survey/responses/withdraw")
    expect(screen.queryByText("private-code")).not.toBeInTheDocument()
  })
})
