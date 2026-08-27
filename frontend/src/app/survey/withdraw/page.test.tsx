import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import WithdrawalPage, { metadata } from "./page"

describe("WithdrawalPage", () => {
  it("is token-independent and discourages indexing", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false })
    render(<WithdrawalPage />)
    expect(screen.getByRole("heading", { name: /withdraw a response/i })).toBeInTheDocument()
    expect(window.location.pathname).toBe("/")
  })
})
