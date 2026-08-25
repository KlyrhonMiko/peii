import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import ForgotPasswordPage from "./page"

describe("ForgotPasswordPage", () => {
  it("shows a generic retry-later state without claiming delivery", async () => {
    render(
      await ForgotPasswordPage({
        searchParams: Promise.resolve({ error: "retry-later", retryAfter: "45" }),
      }),
    )

    expect(screen.getByRole("alert")).toHaveTextContent(/try again in 45 seconds/i)
    expect(screen.getByRole("alert")).not.toHaveTextContent(/sent|account exists/i)
  })

  it("keeps successful recovery messaging existence-neutral", async () => {
    render(
      await ForgotPasswordPage({
        searchParams: Promise.resolve({ sent: "1" }),
      }),
    )

    expect(screen.getByRole("status")).toHaveTextContent(/if the account exists/i)
  })
})
