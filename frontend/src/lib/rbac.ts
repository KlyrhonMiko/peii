import { api } from "@/lib/api"

export interface Permission {
  id: string
  code: string
  description: string
}

export interface Role {
  id: string
  name: string
  description: string | null
  is_system: boolean
  is_active: boolean
  permissions: Permission[]
}

export interface RoleInput {
  name: string
  description: string | null
  permission_ids: string[]
}

export interface RoleUpdateInput {
  description?: string | null
  is_active?: boolean
  permission_ids?: string[]
}

export async function listPermissions(): Promise<Permission[]> {
  const response = await api.get<Permission[]>("/rbac/permissions")
  return response.data ?? []
}

export async function listRoles(): Promise<Role[]> {
  const response = await api.get<Role[]>("/rbac/roles")
  return response.data ?? []
}

export async function createRole(input: RoleInput): Promise<Role> {
  const response = await api.post<Role>("/rbac/roles", input)
  if (!response.data) throw new Error("Backend did not return the created role")
  return response.data
}

export async function updateRole(roleId: string, input: RoleUpdateInput): Promise<Role> {
  const response = await api.patch<Role>(`/rbac/roles/${roleId}`, input)
  if (!response.data) throw new Error("Backend did not return the updated role")
  return response.data
}
