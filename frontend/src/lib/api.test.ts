import { afterEach, describe, expect, it, vi } from "vitest"

import { api } from "./api"

describe("api native downloads", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("clicks a same-origin download link without issuing a fetch", () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    let href = ""
    let download = "not-set"
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      href = this.href
      download = this.download
    })

    api.download("/surveys/survey-id/responses/export")

    expect(fetchMock).not.toHaveBeenCalled()
    expect(click).toHaveBeenCalledOnce()
    expect(href).toBe(`${window.location.origin}/api/backend/surveys/survey-id/responses/export`)
    expect(download).toBe("")
  })
})
