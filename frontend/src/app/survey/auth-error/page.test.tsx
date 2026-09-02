import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import SurveyAuthErrorPage from "./page"

describe("SurveyAuthErrorPage", () => {
  it("renders return navigation as a native link without Base UI button warnings", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)

    render(<SurveyAuthErrorPage />)

    expect(screen.getByRole("link", { name: "Return to PEII" })).toHaveAttribute("href", "/")
    expect(consoleError).not.toHaveBeenCalledWith(
      expect.stringContaining("expected a native <button>")
    )
    consoleError.mockRestore()
  })
})
