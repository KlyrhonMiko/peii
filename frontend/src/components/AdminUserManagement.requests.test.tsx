import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  listUsers: vi.fn(),
  listRoles: vi.fn().mockResolvedValue([]),
}))

vi.mock("@/lib/users", () => ({
  assignUserRoles: vi.fn(),
  createUser: vi.fn(),
  createUsers: vi.fn(),
  deleteUser: vi.fn(),
  listRoles: mocks.listRoles,
  listUsers: mocks.listUsers,
  resendInvitation: vi.fn(),
  restoreUser: vi.fn(),
  revokeUserSessions: vi.fn(),
  updateUser: vi.fn(),
}))

import { AdminUserManagement } from "./AdminUserManagement"
import type { UserRecord } from "@/lib/users"

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => { resolve = next })
  return { promise, resolve }
}

function user(firstName: string): UserRecord {
  return {
    id: `${firstName}-id`,
    user_id: `${firstName}-user-id`,
    email: `${firstName.toLowerCase()}@example.com`,
    username: firstName.toLowerCase(),
    first_name: firstName,
    last_name: "User",
    middle_name: null,
    contact: null,
    is_active: true,
    is_deleted: false,
    roles: [],
    invited_at: null,
    onboarding_completed_at: "2026-09-01T00:00:00",
    last_login_at: null,
    created_at: "2026-09-01T00:00:00",
  }
}

describe("AdminUserManagement requests", () => {
  beforeEach(() => mocks.listUsers.mockReset())

  it("does not let an older search response replace newer results", async () => {
    const older = deferred<{ users: UserRecord[]; total: number }>()
    const newer = deferred<{ users: UserRecord[]; total: number }>()
    mocks.listUsers.mockImplementationOnce(() => older.promise)
    mocks.listUsers.mockImplementationOnce(() => newer.promise)

    render(
      <AdminUserManagement
        permissions={{
          canInvite: false,
          canUpdate: false,
          canChangeStatus: false,
          canAssignRoles: false,
          canReadRoles: false,
          canRevokeSessions: false,
          canDelete: false,
          canRestore: false,
        }}
      />,
    )
    await waitFor(() => expect(mocks.listUsers).toHaveBeenCalledTimes(1))
    fireEvent.change(screen.getByLabelText("Search users"), { target: { value: "latest" } })
    await waitFor(() => expect(mocks.listUsers).toHaveBeenCalledTimes(2))

    await act(async () => newer.resolve({ users: [user("Latest")], total: 1 }))
    expect(await screen.findByText("Latest User")).toBeInTheDocument()
    await act(async () => older.resolve({ users: [user("Older")], total: 1 }))

    expect(screen.getByText("Latest User")).toBeInTheDocument()
    expect(screen.queryByText("Older User")).not.toBeInTheDocument()
  })
})
