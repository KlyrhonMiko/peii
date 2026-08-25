import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}))

import LoginPage from "./page"

describe("LoginPage", () => {
  it("shows a generic rate-limit message and useful retry timing", async () => {
    render(
      await LoginPage({
        searchParams: Promise.resolve({ error: "rate-limited", retryAfter: "30" }),
      }),
    )

    expect(screen.getByRole("alert")).toHaveTextContent(/try again in 30 seconds/i)
    expect(screen.getByRole("alert")).not.toHaveTextContent(/account|email|username/i)
  })

  it("shows a generic temporary-unavailability message", async () => {
    render(
      await LoginPage({
        searchParams: Promise.resolve({ error: "unavailable" }),
      }),
    )

    expect(screen.getByRole("alert")).toHaveTextContent(/temporarily unavailable/i)
  })
})
