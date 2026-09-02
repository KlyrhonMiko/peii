import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import AccessDeniedPage from "./page"

describe("AccessDeniedPage", () => {
  it("renders return navigation as a native link without Base UI button warnings", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)

    render(<AccessDeniedPage />)

    expect(screen.getByRole("link", { name: "Return home" })).toHaveAttribute("href", "/")
    expect(consoleError).not.toHaveBeenCalledWith(
      expect.stringContaining("expected a native <button>")
    )
    consoleError.mockRestore()
  })
})
