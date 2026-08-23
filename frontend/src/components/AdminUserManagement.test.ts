import { describe, expect, it } from "vitest"

import { invitationStatus } from "./AdminUserManagement"
import type { UserRecord } from "@/lib/users"

const user: UserRecord = {
  user_id: "USER-1",
  email: "user@example.com",
  username: "user",
  first_name: "Test",
  last_name: "User",
  middle_name: null,
  contact: null,
  is_active: true,
  is_deleted: false,
  roles: [],
  invited_at: "2026-08-23T00:00:00",
  onboarding_completed_at: null,
  last_login_at: null,
  created_at: "2026-08-23T00:00:00",
}

describe("invitationStatus", () => {
  it("marks an invited account as setup pending", () => {
    expect(invitationStatus(user)).toBe("Setup pending")
  })

  it("prioritizes disabled and deleted account states", () => {
    expect(invitationStatus({ ...user, is_active: false })).toBe("Disabled")
    expect(invitationStatus({ ...user, is_deleted: true })).toBe("Deleted")
  })
})
