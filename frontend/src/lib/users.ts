import { api } from "@/lib/api"

export interface UserRecord {
  user_id: string
  email: string
  username: string
  first_name: string
  last_name: string
  middle_name: string | null
  contact: string | null
  is_active: boolean
  is_deleted: boolean
  roles: string[]
  invited_at: string | null
  onboarding_completed_at: string | null
  last_login_at: string | null
  created_at: string
}

export interface UserRole {
  id: string
  name: string
  description: string | null
  is_active: boolean
}

export interface UserInput {
  email: string
  username: string
  first_name: string
  last_name: string
  middle_name?: string | null
  contact?: string | null
  is_active: boolean
}

export interface UserListResult {
  users: UserRecord[]
  total: number
}

export async function listUsers(params: {
  offset: number
  search: string
  isActive: "all" | "active" | "inactive"
  deleted: "active" | "deleted" | "all"
}): Promise<UserListResult> {
  const query = new URLSearchParams({ limit: "20", offset: String(params.offset) })
  if (params.search) query.set("search", params.search)
  if (params.isActive !== "all") query.set("is_active", String(params.isActive === "active"))
  if (params.deleted === "deleted") {
    query.set("include_deleted", "true")
    query.set("is_deleted", "true")
  }
  if (params.deleted === "all") query.set("include_deleted", "true")
  const response = await api.get<UserRecord[]>(`/users/?${query.toString()}`)
  const records = response.data ?? []
  return {
    users: records,
    total: typeof response.meta.pagination === "object" && response.meta.pagination !== null && "total" in response.meta.pagination && typeof response.meta.pagination.total === "number" ? response.meta.pagination.total : records.length,
  }
}

export async function createUser(input: UserInput): Promise<UserRecord> {
  const response = await api.post<UserRecord>("/users/", input)
  if (!response.data) throw new Error("Backend did not return the created user")
  return response.data
}

export async function createUsers(inputs: UserInput[]): Promise<UserRecord[]> {
  const response = await api.post<UserRecord[]>("/users/batch", { users: inputs })
  return response.data ?? []
}

export async function updateUser(userId: string, input: Partial<Omit<UserInput, "email">>): Promise<UserRecord> {
  const response = await api.patch<UserRecord>(`/users/${userId}`, input)
  if (!response.data) throw new Error("Backend did not return the updated user")
  return response.data
}

export const deleteUser = (userId: string) => api.delete<UserRecord>(`/users/${userId}`, {})
export const restoreUser = (userId: string) => api.post<UserRecord>(`/users/${userId}/restore`, {})
export const resendInvitation = (userId: string) => api.post<UserRecord>(`/users/${userId}/invitation/resend`)
export const revokeUserSessions = (userId: string) => api.post<null>(`/users/${userId}/sessions/revoke`)

export async function listRoles(): Promise<UserRole[]> {
  const response = await api.get<UserRole[]>("/rbac/roles")
  return response.data ?? []
}

export const assignUserRoles = (userId: string, roleIds: string[]) =>
  api.put<null>(`/rbac/users/${userId}/roles`, { role_ids: roleIds })
