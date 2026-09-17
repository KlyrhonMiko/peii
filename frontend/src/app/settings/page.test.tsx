import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ getPortalMfaStatus: vi.fn(), requirePortalUser: vi.fn() }))

vi.mock("@/lib/auth", () => ({ getPortalMfaStatus: mocks.getPortalMfaStatus, requirePortalUser: mocks.requirePortalUser }))
vi.mock("@/components/app-sidebar", () => ({ AppSidebar: () => null }))
vi.mock("@/components/nav-bar", () => ({ NavBar: () => null }))
vi.mock("@/components/SettingsAccountForms", () => ({ SettingsAccountForms: () => null }))
vi.mock("@/components/ui/sidebar", () => ({ SidebarProvider: ({ children }: { children: React.ReactNode }) => children }))

import SettingsPage from "./page"

function account(permissions: string[], roles: string[]) {
  return {
    id: "self", user_id: "USER-1", email: "user@example.com", username: "user",
    first_name: "Alex", last_name: "Cruz", middle_name: null, contact: null,
    permissions, roles,
  }
}

describe("settings page access", () => {
  beforeEach(() => {
    mocks.requirePortalUser.mockReset()
    mocks.getPortalMfaStatus.mockReset()
    mocks.getPortalMfaStatus.mockResolvedValue({ factors: [], currentLevel: "aal1", nextLevel: "aal1" })
  })

  it("shows staff only read-only workspace destinations", async () => {
    mocks.requirePortalUser.mockResolvedValue(account(
      ["portal.access", "surveys.read", "survey_responses.read_aggregates"], ["staff"],
    ))

    render(await SettingsPage())

    expect(mocks.requirePortalUser).toHaveBeenCalledWith("portal.access", "/settings")
    expect(screen.getByRole("link", { name: /Surveys/ })).toHaveAttribute("href", "/researcher/survey")
    expect(screen.queryByRole("link", { name: /Users/ })).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: /Roles & permissions/ })).not.toBeInTheDocument()
    expect(screen.getByText("View aggregate responses")).toBeInTheDocument()
    expect(screen.queryByText(/Respondent identity access/)).not.toBeInTheDocument()
  })

  it("uses capabilities, not the role name, for management destinations", async () => {
    mocks.requirePortalUser.mockResolvedValue(account(
      ["portal.access", "users.read", "roles.read", "audit_logs.read"], ["custom reviewer"],
    ))

    render(await SettingsPage())

    expect(screen.getByRole("link", { name: /Users/ })).toHaveAttribute("href", "/admin/users")
    expect(screen.getByRole("link", { name: /Roles & permissions/ })).toHaveAttribute("href", "/admin/roles")
    expect(screen.getByRole("link", { name: /Audit logs/ })).toHaveAttribute("href", "/admin/audit-logs")
    expect(screen.queryByRole("link", { name: /Surveys/ })).not.toBeInTheDocument()
  })

  it("explains compound and legacy permissions without offering unsafe actions", async () => {
    mocks.requirePortalUser.mockResolvedValue(account(
      ["portal.access", "survey_responses.read_identity", "survey_distributions.manage"], ["custom reviewer"],
    ))

    render(await SettingsPage())

    expect(screen.getByText("Respondent identity access (also requires raw-response access)")).toBeInTheDocument()
    expect(screen.getByText("Legacy distribution permission (no active control)")).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: /distribution/i })).not.toBeInTheDocument()
  })
})
