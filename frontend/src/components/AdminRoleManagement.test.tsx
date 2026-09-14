import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { RoleDialog } from "./AdminRoleManagement"
import type { Permission, Role } from "@/lib/rbac"

const permissions: Permission[] = [
  { id: "read-id", code: "users.read", description: "Read users" },
  { id: "write-id", code: "users.write", description: "Write users" },
]

const role: Role = {
  id: "role-id",
  name: "researcher",
  description: "Research access",
  is_system: false,
  is_active: true,
  permissions: [permissions[0]!],
}

describe("RoleDialog", () => {
  it("retains selected permissions hidden by the search filter", () => {
    const onUpdate = vi.fn()
    render(
      <RoleDialog
        role={role}
        permissions={permissions}
        pending={false}
        onClose={vi.fn()}
        onCreate={vi.fn()}
        onUpdate={onUpdate}
      />,
    )

    fireEvent.change(screen.getByLabelText("Search permissions"), {
      target: { value: "write" },
    })
    fireEvent.click(screen.getByRole("checkbox", { name: /users\.write/i }))
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }))

    expect(onUpdate).toHaveBeenCalledWith(role, {
      permission_ids: ["read-id", "write-id"],
    })
  })
})
