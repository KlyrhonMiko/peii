import { beforeEach, describe, expect, it, vi } from "vitest"

const mockApi = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }))

vi.mock("@/lib/api", () => ({ api: mockApi }))

import { createRole, listPermissions, listRoles, updateRole } from "./rbac"

describe("rbac API client", () => {
  beforeEach(() => {
    mockApi.get.mockReset()
    mockApi.post.mockReset()
    mockApi.patch.mockReset()
  })

  it("loads the role and permission catalogs", async () => {
    mockApi.get.mockResolvedValueOnce({ data: [{ id: "permission-1", code: "users.read", description: "View users" }] })
    mockApi.get.mockResolvedValueOnce({ data: [{ id: "role-1", name: "viewer", description: null, is_system: false, is_active: true, permissions: [] }] })

    await expect(listPermissions()).resolves.toHaveLength(1)
    await expect(listRoles()).resolves.toHaveLength(1)
    expect(mockApi.get).toHaveBeenNthCalledWith(1, "/rbac/permissions")
    expect(mockApi.get).toHaveBeenNthCalledWith(2, "/rbac/roles")
  })

  it("sends role create and update payloads to the RBAC endpoints", async () => {
    const role = { id: "role-1", name: "viewer", description: null, is_system: false, is_active: true, permissions: [] }
    mockApi.post.mockResolvedValue({ data: role })
    mockApi.patch.mockResolvedValue({ data: { ...role, is_active: false } })

    await createRole({ name: "viewer", description: null, permission_ids: ["permission-1"] })
    await updateRole("role-1", { is_active: false })

    expect(mockApi.post).toHaveBeenCalledWith("/rbac/roles", { name: "viewer", description: null, permission_ids: ["permission-1"] })
    expect(mockApi.patch).toHaveBeenCalledWith("/rbac/roles/role-1", { is_active: false })
  })
})
