import { AdminUserManagement } from "@/components/AdminUserManagement"
import { requirePortalUser } from "@/lib/auth"

export default async function UsersPage() {
  const currentUser = await requirePortalUser("users.read")
  const permissions = new Set(currentUser.permissions)

  return <AdminUserManagement permissions={{
    canInvite: permissions.has("users.invite"),
    canUpdate: permissions.has("users.update"),
    canChangeStatus: permissions.has("users.change_status"),
    canAssignRoles: permissions.has("users.assign_roles"),
    canReadRoles: permissions.has("roles.read"),
    canRevokeSessions: permissions.has("users.revoke_sessions"),
    canDelete: permissions.has("users.delete"),
    canRestore: permissions.has("users.restore"),
  }} />
}
