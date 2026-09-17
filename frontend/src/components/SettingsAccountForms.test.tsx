import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import type { PortalUser } from "@/lib/auth"

vi.mock("@/app/settings/actions", () => ({
  changePasswordAction: vi.fn(),
  requestPasswordReauthenticationAction: vi.fn(),
  signOutEverywhereAction: vi.fn(),
  updateProfileAction: vi.fn(),
}))
vi.mock("@/components/MfaSettings", () => ({ MfaSettings: () => null }))

import { SettingsAccountForms } from "./SettingsAccountForms"

const user: PortalUser = {
  id: "user-id",
  user_id: "user-id",
  email: "alex@example.com",
  username: "alex",
  first_name: "Alex",
  last_name: "Cruz",
  middle_name: null,
  contact: null,
  permissions: ["portal.access"],
  roles: ["Admin"],
}

describe("SettingsAccountForms", () => {
  it("refreshes profile defaults without changing a mounted uncontrolled field", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {})
    const warnings = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      const { rerender } = render(<SettingsAccountForms mfaFactors={[]} user={user} />)
      rerender(<SettingsAccountForms mfaFactors={[]} user={{ ...user, first_name: "Maria", last_name: "Santos" }} />)

      expect(screen.getByRole("textbox", { name: "First name" })).toHaveValue("Maria")
      expect(screen.getByRole("textbox", { name: "Last name" })).toHaveValue("Santos")
      const messages = [...errors.mock.calls, ...warnings.mock.calls].flat().join(" ")
      expect(messages).not.toContain("changing the default value state of an uncontrolled FieldControl")
    } finally {
      errors.mockRestore()
      warnings.mockRestore()
    }
  })
})
