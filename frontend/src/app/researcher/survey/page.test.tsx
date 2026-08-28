import { render } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  requirePortalUser: vi.fn(),
  SurveyManagement: vi.fn((props: { permissions: string[]; csvExportEnabled: boolean }) => {
    void props
    return null
  }),
}))

vi.mock("@/lib/auth", () => ({ requirePortalUser: mocks.requirePortalUser }))
vi.mock("@/components/SurveyManagement", () => ({ SurveyManagement: mocks.SurveyManagement }))

import SurveyPage from "./page"

describe("Researcher survey page", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    mocks.requirePortalUser.mockResolvedValue({ permissions: ["surveys.read"] })
    mocks.SurveyManagement.mockClear()
  })

  it.each([
    { envValue: undefined, expected: false },
    { envValue: "false", expected: false },
    { envValue: "TRUE", expected: false },
  ])("passes csvExportEnabled=$expected when CSV_EXPORT_ENABLED is $envValue", async ({ envValue, expected }) => {
    if (envValue === undefined) {
      vi.stubEnv("CSV_EXPORT_ENABLED", undefined)
    } else {
      vi.stubEnv("CSV_EXPORT_ENABLED", envValue)
    }

    render(await SurveyPage())

    expect(mocks.SurveyManagement.mock.calls[0]?.[0]).toEqual({
      permissions: ["surveys.read"],
      csvExportEnabled: expected,
    })
  })

  it('passes csvExportEnabled=true only for the exact "true" value', async () => {
    vi.stubEnv("CSV_EXPORT_ENABLED", "true")

    render(await SurveyPage())

    expect(mocks.SurveyManagement.mock.calls[0]?.[0]).toEqual({
      permissions: ["surveys.read"],
      csvExportEnabled: true,
    })
  })
})
