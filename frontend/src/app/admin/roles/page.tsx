import { AdminRoleManagement } from "@/components/AdminRoleManagement"
import { requirePortalUser } from "@/lib/auth"

export default async function RolesPage() {
  const currentUser = await requirePortalUser("roles.read")
  const permissions = new Set(currentUser.permissions)

  return <AdminRoleManagement canManage={permissions.has("roles.manage")} canManageUsers={permissions.has("users.read")} />
}
